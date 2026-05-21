/**
 * lib/rag/query.js
 *
 * Shared RAG query function — used by widget chat, inbound agent, outbound agent.
 * Embeds the user query → fetches top-K relevant chunks → returns formatted context string.
 * Non-fatal: returns "" on any error so LLM call still proceeds without context.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { embed } from "@/lib/gemini/embeddings";

/**
 * @param {object} params
 * @param {string} params.query       - User message or STT transcript
 * @param {string} params.owner_id    - widget.id or agent.id
 * @param {string} params.owner_type  - "widget" | "agent"
 * @param {number} [params.topK=3]
 * @param {number} [params.threshold=0.75]
 * @returns {Promise<string>}
 */
export async function ragQuery({
  query,
  owner_id,
  owner_type,
  topK = 3,
  threshold = 0.75,
}) {
  try {
    const supabase = await createAdminClient();
    const embedding = await embed(query);

    const { data: kbs } = await supabase
      .from("knowledge_bases")
      .select("id")
      .eq("owner_id", owner_id)
      .eq("owner_type", owner_type);

    if (!kbs?.length) return "";

    const kbIds = kbs.map((k) => k.id);

    const { data: chunks } = await supabase.rpc("match_chunks", {
      query_embedding: embedding,
      kb_ids: kbIds,
      match_threshold: threshold,
      match_count: topK,
    });

    if (!chunks?.length) return "";

    const context = chunks
      .map((c, i) => `[${i + 1}] ${c.content}`)
      .join("\n\n");

    return `\n\n--- Relevant Knowledge Base Context ---\n${context}\n--- End Context ---`;
  } catch (err) {
    console.error("[rag] query failed:", err?.message);
    return "";
  }
}
