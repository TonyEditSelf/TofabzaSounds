/**
 * telephony-server/src/pipeline/llm.js
 *
 * LLM pipeline: RAG context fetch + Vertex AI Gemini reply.
 * Provides both batch and streaming helpers for Twilio playback.
 */

import axios from "axios";
import crypto from "crypto";
import { supabase } from "../lib/supabase.js";
import { Logger } from "../lib/logger.js";

const NEXTJS_URL = process.env.NEXTJS_URL;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const DIRECT_RAG =
  (process.env.TELEPHONY_DIRECT_RAG ?? "true").toLowerCase() !== "false";
const VERTEX_AI_PROJECT_ID =
  process.env.VERTEX_AI_PROJECT_ID ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "durable-limiter-495601-f7";
const VERTEX_AI_LOCATION =
  process.env.VERTEX_AI_LOCATION ??
  process.env.GOOGLE_CLOUD_LOCATION ??
  "global";
const VERTEX_AI_SERVICE_ACCOUNT_JSON =
  process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON ??
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const VERTEX_AI_API_BASE_URL =
  process.env.VERTEX_AI_API_BASE_URL ??
  defaultVertexApiBaseUrl(VERTEX_AI_LOCATION);
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

const LLM_MODELS = {
  "gemini-flash":
    process.env.VERTEX_GEMINI_FLASH_MODEL ??
    process.env.GEMINI_FLASH_MODEL ??
    "gemini-2.5-flash",
  "gemini-pro":
    process.env.VERTEX_GEMINI_PRO_MODEL ??
    process.env.GEMINI_PRO_MODEL ??
    "gemini-2.5-pro",
};

const DEFAULT_MODEL =
  process.env.VERTEX_GEMINI_MODEL ??
  process.env.GEMINI_CHAT_MODEL ??
  process.env.GEMINI_MODEL ??
  LLM_MODELS["gemini-flash"];
const RAG_URL = NEXTJS_URL && `${NEXTJS_URL.replace(/\/$/, "")}/api/rag/query`;
const RAG_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.RAG_TIMEOUT_MS ?? "2000", 10) || 2000, // reduced from 6000ms
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
  process.env.VERTEX_EMBEDDING_MODEL ??
  process.env.GEMINI_EMBEDDING_MODEL ??
  "gemini-embedding-001"
).replace(/^models\//, "");

let vertexTokenCache = null;
let vertexCryptoKey = null;

function defaultVertexApiBaseUrl(location) {
  return location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
}

function normalizeVertexModelName(model) {
  return String(model ?? "")
    .replace(/^models\//, "")
    .replace(/^publishers\/google\/models\//, "");
}

function vertexModelPath(model) {
  const normalizedModel = normalizeVertexModelName(model);
  return `projects/${VERTEX_AI_PROJECT_ID}/locations/${VERTEX_AI_LOCATION}/publishers/google/models/${normalizedModel}`;
}

function vertexUrl(model, method) {
  return `${VERTEX_AI_API_BASE_URL}/v1/${vertexModelPath(model)}:${method}`;
}

function vertexStreamUrl(model) {
  return `${vertexUrl(model, "streamGenerateContent")}?alt=sse`;
}

async function getVertexAccessToken() {
  if (vertexTokenCache && vertexTokenCache.expiresAt > Date.now() + 60_000) {
    return vertexTokenCache.token;
  }

  if (!VERTEX_AI_SERVICE_ACCOUNT_JSON) {
    throw new Error(
      "VERTEX_AI_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON is required for Vertex AI",
    );
  }

  const { private_key, client_email } = JSON.parse(
    VERTEX_AI_SERVICE_ACCOUNT_JSON,
  );
  if (!private_key || !client_email) {
    throw new Error(
      "Vertex AI service account JSON is missing private_key or client_email",
    );
  }

  const normalizedPrivateKey = private_key.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;

  if (!vertexCryptoKey) {
    const der = Buffer.from(
      normalizedPrivateKey.replace(/-----[^-]+-----|\n/g, ""),
      "base64",
    );
    vertexCryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    vertexCryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      data?.error_description ??
        data?.error ??
        "Failed to get Vertex AI access token",
    );
  }

  vertexTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function vertexHeaders() {
  const token = await getVertexAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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
    .map(
      (m) => `${m.role === "assistant" ? "Assistant" : "Caller"}: ${m.content}`,
    )
    .join("\n")
    .slice(-1200);
}

const _ragCache = new Map();
const _embeddingCache = new Map();
const RAG_CACHE_TTL = 30_000;
const EMBEDDING_CACHE_TTL = 5 * 60_000;
const CACHE_LIMIT = 200;

// Supabase singleton imported from ../lib/supabase.js — use supabase directly.

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
  const k = Number.parseInt(config?.rag_top_k, 10);
  return k && k >= 15 ? k : 15;
}

function formatRagContext(chunks = []) {
  if (!chunks?.length) return "";
  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
  return `\n\n--- Relevant Knowledge Base Context ---\n(You must use the following information to answer the user's questions if relevant. Do not hallucinate.)\n\n${context}\n--- End Context ---`;
}

async function embedRagQuery(query) {
  const key = shortHash(query);
  const cached = _embeddingCache.get(key);
  if (cached && Date.now() - cached.ts < EMBEDDING_CACHE_TTL) {
    return cached.embedding;
  }

  const res = await fetch(vertexUrl(RAG_EMBEDDING_MODEL, "embedContent"), {
    method: "POST",
    headers: await vertexHeaders(),
    body: JSON.stringify({
      content: { parts: [{ text: query.slice(0, 8000) }] },
      embedContentConfig: { taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 },
    }),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Vertex embed failed");
  const embedding = data.embedding?.values;
  if (!embedding?.length) throw new Error("Vertex embed returned empty vector");
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
  if (!DIRECT_RAG) return null;
  // Uses shared supabase singleton from ../lib/supabase.js

  const topK = normalizeTopK(config);
  const threshold =
    Number.parseFloat(config?.rag_match_threshold) || RAG_MATCH_THRESHOLD;
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
      if (directCtx)
        console.log(`[rag] direct context chars=${directCtx.length}`);
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

  const lastMessage =
    initialTurn || !history.length
      ? `[EVENT: Call Connected. The caller expects you to speak in ${langName}.]`
      : (history[history.length - 1]?.content ?? "");
  if (!initialTurn && ragContext === undefined) {
    ragContext = await fetchRagContext(
      agentId,
      buildRagQuery(history) || lastMessage,
      config,
    );
  }

  const langPrompt =
    `[System: Default response language is ${langName}. Respond in ${langName} unless the caller speaks a different language.]\n\n`;

  const systemPrompt = langPrompt + sanitisePrompt(config?.prompt) + "\n\nKeep responses concise. This is a phone call." + ragContext;
  const geminiHistory = history.slice(-20, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  return {
    payload: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...geminiHistory,
        { role: "user", parts: [{ text: lastMessage }] },
      ],
      generationConfig: {
        maxOutputTokens: config?.max_output_tokens ?? 350,
        temperature: config?.temperature ?? 0.55,
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
      const res = await axios.post(
        vertexUrl(modelName, "generateContent"),
        payload,
        {
          headers: await vertexHeaders(),
          timeout: 15000,
        },
      );

      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (reply.trim()) {
        Logger.log(
          "LLM",
          `vertex model=${modelName} project=${VERTEX_AI_PROJECT_ID} location=${VERTEX_AI_LOCATION}`,
        );
        return reply;
      }
      Logger.warn("LLM", `Empty Vertex reply from model=${modelName}`);
    } catch (err) {
      const status = err?.response?.status;
      const message =
        err?.response?.data?.error?.message ??
        err?.response?.data ??
        err?.message;
      Logger.error(
        "LLM",
        `Vertex ${modelName} failed:`,
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
      const res = await fetch(vertexStreamUrl(modelName), {
        method: "POST",
        headers: await vertexHeaders(),
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message ?? res.statusText;
        Logger.error(
          "LLM",
          `Vertex ${modelName} failed:`,
          `${res.status}:`,
          message,
        );
        if (![404, 429, 500, 502, 503, 504].includes(res.status)) break;
        continue;
      }

      Logger.log(
        "LLM",
        `vertex model=${modelName} project=${VERTEX_AI_PROJECT_ID} location=${VERTEX_AI_LOCATION}`,
      );
      let fullText = "";
      const t0 = Date.now();
      let firstToken = true;
      for await (const token of readGeminiSseText(res.body)) {
        if (firstToken) {
          const ttft = Date.now() - t0;
          Logger.log("LLM", `Time-To-First-Token: ${ttft}ms`);
          Logger.trackLatency("llm", ttft);
          firstToken = false;
        }
        fullText += token;
        await onToken?.(token, fullText);
      }
      return fullText.trim();
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      Logger.error("LLM", `Vertex ${modelName} failed:`, err?.message);
    }
  }

  return "";
}
