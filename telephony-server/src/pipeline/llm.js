/**
 * telephony-server/src/pipeline/llm.js
 *
 * LLM pipeline: RAG context fetch + Gemini Flash/Pro call.
 * Called after STT returns transcript.
 */

import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEXTJS_URL = process.env.NEXTJS_URL; // e.g. https://your-app.vercel.app
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

const LLM_MODELS = {
  "gemini-flash": "gemini-2.5-flash-preview-05-20",
  "gemini-pro": "gemini-2.5-pro-preview-05-06",
};

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

function sanitisePrompt(prompt = "") {
  return prompt.replace(/<\|.*?\|>/g, "").slice(0, 8000);
}

/**
 * Fetch RAG context from Next.js internal route.
 * @param {string} agentId
 * @param {string} query
 * @returns {Promise<string>}
 */
async function fetchRagContext(agentId, query) {
  if (!NEXTJS_URL || !INTERNAL_SECRET) return "";
  try {
    const res = await axios.post(
      `${NEXTJS_URL}/api/rag/query`,
      { query, owner_id: agentId, owner_type: "agent" },
      {
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        timeout: 5000,
      },
    );
    return res.data?.context ?? "";
  } catch (err) {
    console.warn("[rag] fetch failed:", err?.message);
    return "";
  }
}

/**
 * @param {object} params
 * @param {string} params.agentId
 * @param {Array}  params.history  - [{ role: "user"|"assistant", content: string }]
 * @param {string} params.language - BCP-47
 * @param {object} params.config   - agent.config
 * @returns {Promise<string>} reply text
 */
export async function getLLMReply({ agentId, history, language, config }) {
  const lastMessage = history[history.length - 1]?.content ?? "";

  // Fetch RAG context
  const ragContext = await fetchRagContext(agentId, lastMessage);

  // Language instruction
  const langNames = {
    "ml-IN": "Malayalam",
    "hi-IN": "Hindi",
    "en-IN": "English",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "mr-IN": "Marathi",
    "gu-IN": "Gujarati",
    "bn-IN": "Bengali",
    "pa-IN": "Punjabi",
    "od-IN": "Odia",
  };
  const langName = langNames[language] ?? "the caller's language";
  const langPrompt = `\n\nAlways respond in ${langName} only. Keep responses concise — this is a phone call.`;

  const systemPrompt =
    sanitisePrompt(config?.system_prompt) + langPrompt + ragContext;

  // Build Gemini contents
  const geminiHistory = history.slice(-20, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const contents = [
    ...geminiHistory,
    { role: "user", parts: [{ text: lastMessage }] },
  ];

  const modelName =
    LLM_MODELS[config?.llm_provider ?? "gemini-flash"] ??
    LLM_MODELS["gemini-flash"];

  try {
    const res = await axios.post(
      geminiUrl(modelName),
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 300, // phone calls need short responses
          temperature: 0.7,
        },
      },
      { timeout: 15000 },
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (err) {
    console.error("[llm] Failed:", err?.response?.data ?? err?.message);
    return "";
  }
}
