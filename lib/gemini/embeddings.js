import "server-only";
import crypto from "crypto";

/**
 * lib/gemini/embeddings.js
 * Vertex AI Gemini embeddings via REST.
 */

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
const EMBEDDING_MODEL = (
  process.env.VERTEX_EMBEDDING_MODEL ??
  process.env.GEMINI_EMBEDDING_MODEL ??
  "gemini-embedding-001"
).replace(/^models\//, "");
const EMBEDDING_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.EMBEDDING_TIMEOUT_MS ?? "5000", 10) || 5000,
);

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

export async function embed(text) {
  const res = await fetch(vertexUrl(EMBEDDING_MODEL, "embedContent"), {
    method: "POST",
    headers: await vertexHeaders(),
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      embedContentConfig: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 768 },
    }),
    signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Vertex embed failed");
  return data.embedding.values;
}
