/**
 * telephony-server/src/pipeline/llm.js
 *
 * LLM pipeline: RAG context fetch + Gemini reply.
 * Provides both batch and streaming helpers for Twilio playback.
 */

import axios from "axios";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEXTJS_URL = process.env.NEXTJS_URL;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIRECT_RAG =
  (process.env.TELEPHONY_DIRECT_RAG ?? "true").toLowerCase() !== "false";

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
const RAG_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.RAG_TIMEOUT_MS ?? "6000", 10) || 6000,
);
const RAG_TOP_K = Math.max(
  1,
  Number.parseInt(process.env.RAG_TOP_K ?? "3", 10) || 3,
);
const RAG_MATCH_THRESHOLD = Number.isFinite(
  Number.parseFloat(process.env.RAG_MATCH_THRESHOLD ?? ""),
)
  ? Number.parseFloat(process.env.RAG_MATCH_THRESHOLD)
  : 0.35;
const RAG_EMBEDDING_MODEL = (
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001"
).replace(/^models\//, "");

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

function geminiStreamUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
}

function geminiEmbeddingUrl(model) {
  return `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent?key=${GEMINI_API_KEY}`;
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
const _embeddingCache = new Map();
const RAG_CACHE_TTL = 30_000;
const EMBEDDING_CACHE_TTL = 5 * 60_000;
const CACHE_LIMIT = 200;

let _supabase = null;
function getSupabase() {
  if (!_supabase && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _supabase;
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function setBoundedCache(cache, key, value) {
  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

function normalizeTopK(config = {}) {
  return Math.max(1, Number.parseInt(config?.rag_top_k ?? RAG_TOP_K, 10) || 3);
}

function formatRagContext(chunks = []) {
  if (!chunks?.length) return "";
  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
  return `\n\n--- Relevant Knowledge Base Context ---\n${context}\n--- End Context ---`;
}

async function embedRagQuery(query) {
  const key = shortHash(query);
  const cached = _embeddingCache.get(key);
  if (cached && Date.now() - cached.ts < EMBEDDING_CACHE_TTL) {
    return cached.embedding;
  }

  const res = await fetch(geminiEmbeddingUrl(RAG_EMBEDDING_MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${RAG_EMBEDDING_MODEL}`,
      content: { parts: [{ text: query.slice(0, 8000) }] },
    }),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Gemini embed failed");
  const embedding = data.embedding?.values;
  if (!embedding?.length) throw new Error("Gemini embed returned empty vector");
  setBoundedCache(_embeddingCache, key, { embedding, ts: Date.now() });
  return embedding;
}

async function fetchLegacyDirectRagContext({
  supabase,
  agentId,
  embedding,
  topK,
  threshold,
}) {
  const { data: kbs, error: kbError } = await supabase
    .from("knowledge_bases")
    .select("id")
    .eq("owner_id", agentId)
    .eq("owner_type", "agent");

  if (kbError) throw kbError;
  if (!kbs?.length) return "";

  const { data: chunks, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    kb_ids: kbs.map((k) => k.id),
    match_threshold: threshold,
    match_count: topK,
  });

  if (error) throw error;
  return formatRagContext(chunks);
}

async function fetchDirectRagContext(agentId, query, config = {}) {
  if (!DIRECT_RAG || !GEMINI_API_KEY) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const topK = normalizeTopK(config);
  const threshold = Number.parseFloat(config?.rag_match_threshold) || RAG_MATCH_THRESHOLD;
  const embedding = await embedRagQuery(query);

  const { data: chunks, error } = await supabase.rpc("match_chunks_hybrid", {
    query_embedding: embedding,
    query_text: query,
    match_owner_id: agentId,
    match_owner_type: "agent",
    match_count: topK,
    match_threshold: threshold,
  });

  if (!error) return formatRagContext(chunks);

  console.warn("[rag] hybrid RPC unavailable, falling back:", error.message);
  return fetchLegacyDirectRagContext({
    supabase,
    agentId,
    embedding,
    topK,
    threshold,
  });
}

async function fetchRagContext(agentId, query, config = {}) {
  const topK = normalizeTopK(config);
  const cacheKey = `${agentId}:${topK}:${shortHash(query)}`;

  const cached = _ragCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < RAG_CACHE_TTL) return cached.ctx;

  try {
    const directCtx = await fetchDirectRagContext(agentId, query, config);
    if (directCtx !== null) {
      setBoundedCache(_ragCache, cacheKey, { ctx: directCtx, ts: Date.now() });
      if (directCtx) console.log(`[rag] direct context chars=${directCtx.length}`);
      return directCtx;
    }
  } catch (err) {
    console.warn("[rag] direct fetch failed:", err?.message);
  }

  if (!RAG_URL || !INTERNAL_SECRET) return "";

  try {
    const res = await axios.post(
      RAG_URL,
      { query, owner_id: agentId, owner_type: "agent", top_k: topK },
      {
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        timeout: RAG_TIMEOUT_MS,
      },
    );
    const ctx = res.data?.context ?? "";
    setBoundedCache(_ragCache, cacheKey, { ctx, ts: Date.now() });
    if (ctx) console.log(`[rag] fetched context chars=${ctx.length}`);
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

async function buildGeminiPayload({
  agentId,
  history,
  language,
  config,
  ragContext,
  initialTurn = false,
}) {
  const lastMessage =
    initialTurn || !history.length
      ? "Begin the call now. Greet the caller according to the agent instructions."
      : (history[history.length - 1]?.content ?? "");
  if (!initialTurn && ragContext === undefined) {
    ragContext = await fetchRagContext(
      agentId,
      buildRagQuery(history) || lastMessage,
      config,
    );
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

export async function getLLMReply({
  agentId,
  history,
  language,
  config,
  initialTurn = false,
}) {
  const { payload } = await buildGeminiPayload({
    agentId,
    history,
    language,
    config,
    initialTurn,
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
  initialTurn = false,
}) {
  const { payload } = await buildGeminiPayload({
    agentId,
    history,
    language,
    config,
    initialTurn,
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
