/**
 * app/api/kb/process-url/route.js
 *
 * POST /api/kb/process-url
 * Internal route — called by the onboarding push flow.
 * Downloads a file from a signed Supabase Storage URL,
 * chunks + embeds it, and inserts into an existing KB.
 *
 * Body: { kb_id, file_url, file_name, file_type }
 * Auth: x-internal-secret header
 */

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
  // Internal auth — same secret used in push/route.js
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return Response.json(
      { error: { code: "UNAUTHORISED", message: "Unauthorised." } },
      { status: 401 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const { kb_id, file_url, file_name, file_type } = body;

  if (!kb_id || !file_url || !file_name || !file_type) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "kb_id, file_url, file_name, file_type are required.",
        },
      },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(file_type)) {
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
    // 1. Download file from signed URL
    const downloadRes = await fetch(file_url);
    if (!downloadRes.ok) {
      return Response.json(
        {
          error: {
            code: "DOWNLOAD_FAILED",
            message: `Could not download file: ${downloadRes.statusText}`,
          },
        },
        { status: 500 },
      );
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > 10 * 1024 * 1024) {
      return Response.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "File must be under 10MB.",
          },
        },
        { status: 400 },
      );
    }

    // Wrap in a File-like object so extractText works identically to kb/upload
    const file = new File([buffer], file_name, { type: file_type });

    // 2. Extract text
    const text = await extractText(file, file_type);
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

    // 3. Chunk
    const chunks = chunkText(text);
    if (chunks.length > 500) {
      return Response.json(
        {
          error: {
            code: "TOO_MANY_CHUNKS",
            message: "File too large — max 500 chunks.",
          },
        },
        { status: 400 },
      );
    }

    const supabase = await createAdminClient();

    // 4. Verify KB exists
    const { data: kb, error: kbErr } = await supabase
      .from("knowledge_bases")
      .select("id")
      .eq("id", kb_id)
      .single();

    if (kbErr || !kb) {
      return Response.json(
        {
          error: { code: "KB_NOT_FOUND", message: "Knowledge base not found." },
        },
        { status: 404 },
      );
    }

    // 5. Embed + insert chunks
    const rows = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embed(chunks[i]);
      rows.push({
        kb_id,
        content: chunks[i],
        embedding,
        source_file: file_name,
        chunk_index: i,
      });
    }

    const { error: chunkErr } = await supabase.from("kb_chunks").insert(rows);
    if (chunkErr) throw chunkErr;

    return Response.json({ success: true, kb_id, chunks_count: rows.length });
  } catch (err) {
    console.error("[kb/process-url]", err?.message);
    return Response.json(
      {
        error: {
          code: "PROCESS_FAILED",
          message: err?.message ?? "Processing failed.",
        },
      },
      { status: 500 },
    );
  }
}
