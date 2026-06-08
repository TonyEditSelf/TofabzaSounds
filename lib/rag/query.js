/**
 * lib/rag/query.js
 *
 * Shared RAG query function — used by inbound and outbound agents.
 * Embeds the user query → fetches top-K relevant chunks → returns formatted context string.
 * Non-fatal: returns "" on any error so LLM call still proceeds without context.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { embed } from "@/lib/gemini/embeddings";

const DEFAULT_TOP_K = Math.max(
  1,
  Number.parseInt(process.env.RAG_TOP_K ?? "3", 10) || 3,
);
const DEFAULT_THRESHOLD = Number.isFinite(
  Number.parseFloat(process.env.RAG_MATCH_THRESHOLD ?? ""),
)
  ? Number.parseFloat(process.env.RAG_MATCH_THRESHOLD)
  : 0.35;

function formatContext(chunks = []) {
  if (!chunks?.length) return "";
  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
  return `\n\n--- Relevant Knowledge Base Context ---\n${context}\n--- End Context ---`;
}

async function legacyVectorQuery({ supabase, embedding, owner_id, owner_type, topK, threshold }) {
  const { data: kbs } = await supabase
    .from("knowledge_bases")
    .select("id")
    .eq("owner_id", owner_id)
    .eq("owner_type", owner_type);

  if (!kbs?.length) return "";

  const { data: chunks, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    kb_ids: kbs.map((k) => k.id),
    match_threshold: threshold,
    match_count: topK,
  });

  if (error) throw error;
  return formatContext(chunks);
}

/**
 * @param {object} params
 * @param {string} params.query       - User message or STT transcript
 * @param {string} params.owner_id    - agent.id
 * @param {string} params.owner_type  - "agent"
 * @param {number} [params.topK=3]
 * @param {number} [params.threshold=0.75]
 * @returns {Promise<string>}
 */
export async function ragQuery({
  query,
  owner_id,
  owner_type,
  topK = DEFAULT_TOP_K,
  threshold = DEFAULT_THRESHOLD,
}) {
  try {
    const supabase = await createAdminClient();
    const matchCount = Math.max(
      1,
      Number.parseInt(topK, 10) || DEFAULT_TOP_K,
    );
    const matchThreshold = Number.isFinite(Number.parseFloat(threshold))
      ? Number.parseFloat(threshold)
      : DEFAULT_THRESHOLD;

    console.log(
      "[rag] querying for owner_id:",
      owner_id,
      "owner_type:",
      owner_type,
    );
    const embedding = await embed(query);

    const { data: chunks, error: hybridError } = await supabase.rpc("match_chunks_hybrid", {
      query_embedding: embedding,
      query_text: query,
      match_owner_id: owner_id,
      match_owner_type: owner_type,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });

    if (hybridError) {
      console.warn("[rag] hybrid RPC unavailable, falling back:", hybridError.message);
      return legacyVectorQuery({
        supabase,
        embedding,
        owner_id,
        owner_type,
        topK: matchCount,
        threshold: matchThreshold,
      });
    }

    if (!chunks?.length) {
      console.log("[rag] no chunks matched query:", query);
      return "";
    }
    console.log(`[rag] matched ${chunks.length} chunks for:`, query);

    return formatContext(chunks);
  } catch (err) {
    console.error("[rag] query failed:", err?.message);
    return "";
  }
}
