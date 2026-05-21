/**
 * app/api/kb/upload/route.js
 *
 * POST /api/kb/upload
 * Uploads a document → chunks → embeds → stores in Supabase.
 */

import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";
import { extractText } from "@/lib/rag/extract";
import { chunkText } from "@/lib/rag/chunk";
import { embed } from "@/lib/gemini/embeddings";

export const maxDuration = 60;

const ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req) {
  try {
    await requireOperator();
  } catch (res) {
    return res;
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const owner_type = formData.get("owner_type");
  const owner_id = formData.get("owner_id");
  const client_id = formData.get("client_id");
  const name = formData.get("name");

  if (!file || !owner_type || !owner_id || !client_id || !name) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "file, owner_type, owner_id, client_id, name are required.",
        },
      },
      { status: 400 },
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    return Response.json(
      {
        error: { code: "FILE_TOO_LARGE", message: "File must be under 10MB." },
      },
      { status: 400 },
    );
  }

  const mimeType = file.type || "text/plain";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return Response.json(
      {
        error: {
          code: "INVALID_TYPE",
          message: "Only PDF, TXT, MD, DOCX are supported.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const supabase = await createAdminClient();

    // Check KB limit
    const { count } = await supabase
      .from("knowledge_bases")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner_id)
      .eq("owner_type", owner_type);

    if (count >= 5) {
      return Response.json(
        {
          error: {
            code: "KB_LIMIT",
            message: "Maximum 5 knowledge bases per owner.",
          },
        },
        { status: 400 },
      );
    }

    // 1. Extract text
    const text = await extractText(file, mimeType);
    if (!text?.trim()) {
      return Response.json(
        {
          error: {
            code: "EMPTY_TEXT",
            message: "Could not extract text from file.",
          },
        },
        { status: 400 },
      );
    }

    // 2. Chunk
    const chunks = chunkText(text);
    if (chunks.length > 500) {
      return Response.json(
        {
          error: {
            code: "TOO_MANY_CHUNKS",
            message: "File too large — max 500 chunks (≈200K chars).",
          },
        },
        { status: 400 },
      );
    }

    // 3. Upsert knowledge_base row
    const { data: kb, error: kbErr } = await supabase
      .from("knowledge_bases")
      .insert({ client_id, owner_type, owner_id, name })
      .select("id")
      .single();

    if (kbErr) throw kbErr;

    // 4. Embed + insert chunks (batch)
    const rows = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embed(chunks[i]);
      rows.push({
        kb_id: kb.id,
        content: chunks[i],
        embedding,
        source_file: file.name,
        chunk_index: i,
      });
    }

    const { error: chunkErr } = await supabase.from("kb_chunks").insert(rows);
    if (chunkErr) throw chunkErr;

    return Response.json({ kb_id: kb.id, chunks_count: rows.length });
  } catch (err) {
    console.error("[kb/upload]", err?.message);
    return Response.json(
      {
        error: {
          code: "UPLOAD_FAILED",
          message: err?.message ?? "Upload failed.",
        },
      },
      { status: 500 },
    );
  }
}
