import "server-only";

/**
 * lib/gemini/embeddings.js
 * Google Gemini embeddings via REST.
 */

const EMBEDDING_MODEL = (
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001"
).replace(/^models\//, "");
const EMBEDDING_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.EMBEDDING_TIMEOUT_MS ?? "5000", 10) || 5000,
);

export async function embed(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    },
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Gemini embed failed");
  return data.embedding.values;
}
