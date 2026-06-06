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
  "gemini-flash": process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
  "gemini-pro": process.env.GEMINI_PRO_MODEL ?? "gemini-2.5-pro",
};

const DEFAULT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? process.env.GEMINI_MODEL ?? LLM_MODELS["gemini-flash"];
const RAG_URL =
  NEXTJS_URL && `${NEXTJS_URL.replace(/\/$/, "")}/api/rag/query`;

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

function resolveModelCandidates(config = {}) {
  const configured = config?.gemini_model ?? config?.llm_model;
  const providerChoice = config?.llm_provider ?? "gemini-flash";
  const preferred = configured ?? LLM_MODELS[providerChoice] ?? DEFAULT_MODEL;
  return [...new Set([preferred, DEFAULT_MODEL, LLM_MODELS["gemini-flash"], LLM_MODELS["gemini-pro"]].filter(Boolean))];
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
  if (!RAG_URL || !INTERNAL_SECRET) return "";
  try {
    const res = await axios.post(
      RAG_URL,
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
    const status = err?.response?.status;
    const data = err?.response?.data;
    const detail =
      data?.message ??
      data?.error ??
      (typeof data === "string" ? data : "") ??
      err?.message ??
      err?.code ??
      "unknown error";
    console.warn(
      `[rag] fetch failed url=${RAG_URL}`,
      status ? `status=${status}` : "",
      detail || err?.message || err?.code || "unknown error",
    );
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

  const systemPrompt = sanitisePrompt(config?.prompt) + langPrompt + ragContext;

  // Build Gemini contents
  const geminiHistory = history.slice(-20, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const contents = [
    ...geminiHistory,
    { role: "user", parts: [{ text: lastMessage }] },
  ];

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: 300, // phone calls need short responses
      temperature: 0.7,
    },
  };

  for (const modelName of resolveModelCandidates(config)) {
    try {
      const res = await axios.post(geminiUrl(modelName), payload, {
        timeout: 15000,
      });

      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (reply.trim()) {
        console.log(`[llm] model=${modelName}`);
        return reply;
      }
      console.warn(`[llm] Empty reply from model=${modelName}`);
    } catch (err) {
      const status = err?.response?.status;
      const message =
        err?.response?.data?.error?.message ??
        err?.response?.data ??
        err?.message;
      console.error(`[llm] ${modelName} failed:`, status ? `${status}:` : "", message);
      if (status && ![404, 429, 500, 502, 503, 504].includes(status)) break;
    }
  }

  return "";
}
