import "server-only";

/**
 * lib/gemini/embeddings.js
 * Google Gemini text-embedding-004 via REST (free tier)
 */

export async function embed(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Gemini embed failed");
  return data.embedding.values;
}
