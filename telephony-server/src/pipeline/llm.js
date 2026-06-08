/**
 * telephony-server/src/pipeline/llm.js
 *
 * LLM pipeline: RAG context fetch + Gemini reply.
 * Provides both batch and streaming helpers for Twilio playback.
 */

import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEXTJS_URL = process.env.NEXTJS_URL;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

const LLM_MODELS = {
  "gemini-flash": process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
  "gemini-pro": process.env.GEMINI_PRO_MODEL ?? "gemini-2.5-pro",
};

const DEFAULT_MODEL =
  process.env.GEMINI_CHAT_MODEL ??
  process.env.GEMINI_MODEL ??
  LLM_MODELS["gemini-flash"];
const RAG_URL =
  NEXTJS_URL && `${NEXTJS_URL.replace(/\/$/, "")}/api/rag/query`;

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

function geminiStreamUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
}

function resolveModelCandidates(config = {}) {
  const configured = config?.gemini_model ?? config?.llm_model;
  const providerChoice = config?.llm_provider ?? "gemini-flash";
  const preferred = configured ?? LLM_MODELS[providerChoice] ?? DEFAULT_MODEL;
  return [
    ...new Set(
      [
        preferred,
        DEFAULT_MODEL,
        LLM_MODELS["gemini-flash"],
        LLM_MODELS["gemini-pro"],
      ].filter(Boolean),
    ),
  ];
}

function sanitisePrompt(prompt = "") {
  return prompt.replace(/<\|.*?\|>/g, "").slice(0, 8000);
}

function buildRagQuery(history = []) {
  return history
    .slice(-5)
    .map((m) => `${m.role === "assistant" ? "Assistant" : "Caller"}: ${m.content}`)
    .join("\n")
    .slice(-1200);
}

const _ragCache = new Map();
const RAG_CACHE_TTL = 30_000;

async function fetchRagContext(agentId, query) {
  if (!RAG_URL || !INTERNAL_SECRET) return "";

  const cached = _ragCache.get(agentId);
  if (cached && Date.now() - cached.ts < RAG_CACHE_TTL) return cached.ctx;

  try {
    const res = await axios.post(
      RAG_URL,
      { query, owner_id: agentId, owner_type: "agent" },
      {
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        timeout: 1500,
      },
    );
    const ctx = res.data?.context ?? "";
    _ragCache.set(agentId, { ctx, ts: Date.now() });
    return ctx;
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

async function buildGeminiPayload({ agentId, history, language, config, ragContext }) {
  const lastMessage = history[history.length - 1]?.content ?? "";
  if (ragContext === undefined) {
    ragContext = await fetchRagContext(agentId, buildRagQuery(history) || lastMessage);
  }

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
  const langPrompt =
    `\n\nAlways respond in ${langName} only. ` +
    "Keep responses concise. This is a phone call.";

  const systemPrompt = sanitisePrompt(config?.prompt) + langPrompt + ragContext;
  const geminiHistory = history.slice(-20, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  return {
    payload: {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...geminiHistory,
        { role: "user", parts: [{ text: lastMessage }] },
      ],
      generationConfig: {
        maxOutputTokens: 220,
        temperature: 0.55,
      },
    },
  };
}

async function* readGeminiSseText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!data || data === "[DONE]") continue;

      let json;
      try {
        json = JSON.parse(data);
      } catch (_) {
        continue;
      }

      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part?.text) yield part.text;
      }
    }
  }
}

export async function getLLMReply({ agentId, history, language, config }) {
  const { payload } = await buildGeminiPayload({
    agentId,
    history,
    language,
    config,
  });

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
      console.error(
        `[llm] ${modelName} failed:`,
        status ? `${status}:` : "",
        message,
      );
      if (status && ![404, 429, 500, 502, 503, 504].includes(status)) break;
    }
  }

  return "";
}

export async function streamLLMReply({
  agentId,
  history,
  language,
  config,
  signal,
  onToken,
}) {
  const { payload } = await buildGeminiPayload({
    agentId,
    history,
    language,
    config,
  });

  for (const modelName of resolveModelCandidates(config)) {
    try {
      const res = await fetch(geminiStreamUrl(modelName), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message ?? res.statusText;
        console.error(
          `[llm/stream] ${modelName} failed:`,
          `${res.status}:`,
          message,
        );
        if (![404, 429, 500, 502, 503, 504].includes(res.status)) break;
        continue;
      }

      console.log(`[llm/stream] model=${modelName}`);
      let fullText = "";
      for await (const token of readGeminiSseText(res.body)) {
        fullText += token;
        await onToken?.(token, fullText);
      }
      return fullText.trim();
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      console.error(`[llm/stream] ${modelName} failed:`, err?.message);
    }
  }

  return "";
}
