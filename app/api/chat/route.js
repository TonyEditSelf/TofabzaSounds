/**
 * app/api/chat/route.js
 *
 * Widget chat endpoint.
 * Flow: validate token → RAG context → Gemini Flash → return response
 *
 * Body: {
 *   widget_id  — UUID
 *   session_id — client-generated UUID
 *   message    — user text
 *   token      — widget auth token (skipped in dev)
 *   history    — last N turns [{ role: "user"|"assistant", content: string }]
 * }
 */

import { createAdminClient } from "@/lib/supabase/server";
import { ragQuery } from "@/lib/rag/query";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === "true";
const LOCAL_LLM_URL =
  process.env.LOCAL_LLM_URL ?? "http://localhost:1234/v1/chat/completions";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL ?? "local-model";

export const maxDuration = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitiseSystemPrompt(prompt = "") {
  let clean = prompt.replace(/<\|.*?\|>/g, "");
  if (clean.length > 8000) clean = clean.slice(0, 8000);
  return clean;
}

function geminiUrl(model, stream = false) {
  if (stream)
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

const LLM_MODELS = {
  "gemini-flash": "gemini-2.5-flash", // smarter, default choice
  "gemini-flash-lite": "gemini-2.5-flash-lite", // faster + cheaper, high-volume
};

// ─── Token validation ─────────────────────────────────────────────────────────

async function validateToken(supabase, token, widget_id) {
  const { data, error } = await supabase
    .from("widget_tokens")
    .select("widget_id, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) return { valid: false, reason: "Invalid token." };
  if (data.widget_id !== widget_id)
    return { valid: false, reason: "Token mismatch." };
  if (new Date(data.expires_at) < new Date())
    return { valid: false, reason: "Token expired." };
  return { valid: true };
}

// ─── Cost logging ─────────────────────────────────────────────────────────────

async function logCost(
  supabase,
  { widget_id, client_id, session_id, input_tokens, output_tokens },
) {
  try {
    // GPT-4o-mini equivalent — Gemini Flash pricing TBD, log tokens for now
    await supabase.from("widget_sessions").upsert(
      {
        id: session_id,
        widget_id,
        client_id,
        last_active: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: false },
    );
  } catch (_) {
    // Non-fatal
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req) {
  let widget_id,
    session_id,
    message,
    token,
    history = [],
    language;
  try {
    ({
      widget_id,
      session_id,
      message,
      token,
      history = [],
      language,
    } = await req.json());
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Invalid request body." } },
      { status: 400 },
    );
  }

  if (!widget_id || !message?.trim()) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "widget_id and message are required.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createAdminClient();

  // 1. Fetch widget
  const { data: widget, error: widgetErr } = await supabase
    .from("widgets")
    .select("id, status, config, client_id")
    .eq("id", widget_id)
    .single();

  if (widgetErr || !widget) {
    return Response.json(
      { error: { code: "WIDGET_NOT_FOUND", message: "Widget not found." } },
      { status: 404 },
    );
  }

  if (widget.status !== "active") {
    return Response.json(
      {
        error: {
          code: "WIDGET_INACTIVE",
          message: "This assistant is not active yet.",
        },
      },
      { status: 403 },
    );
  }

  // 2a. Start RAG immediately — runs in parallel with token validation
  const ragPromise =
    process.env.DISABLE_RAG === "true"
      ? Promise.resolve("")
      : ragQuery({ query: message, owner_id: widget_id, owner_type: "widget" });

  // 2. Token validation (production only)
  if (process.env.NODE_ENV === "production") {
    if (!token) {
      return Response.json(
        {
          error: {
            code: "MISSING_TOKEN",
            message: "Authentication token is required.",
          },
        },
        { status: 401 },
      );
    }
    const { valid, reason } = await validateToken(supabase, token, widget_id);
    if (!valid) {
      return Response.json(
        { error: { code: "INVALID_TOKEN", message: reason } },
        { status: 403 },
      );
    }
  }

  // 3. Await RAG (was running during token validation above)
  const ragContext = await ragPromise;

  // 4. System prompt
  const detectedLang = language ?? widget.config?.language ?? "ml-IN";
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
  const langName = langNames[detectedLang] ?? "the user's language";
  const langPrompt = `\n\nAlways respond in ${langName} only.`;
  const systemPrompt =
    sanitiseSystemPrompt(widget.config?.system_prompt) +
    langPrompt +
    ragContext;

  // 5. LLM provider from config (default: gemini-flash)
  const llmProvider = widget.config?.llm_provider ?? "gemini-flash";
  const modelName = LLM_MODELS[llmProvider] ?? LLM_MODELS["gemini-flash"];

  // 6. Build Gemini contents — last 20 turns
  const geminiHistory = history.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const contents = [
    ...geminiHistory,
    { role: "user", parts: [{ text: message }] },
  ];

  // 7. Call Gemini
  let geminiRes;
  try {
    if (USE_LOCAL_LLM) {
      // LM Studio — OpenAI-compatible
      geminiRes = await fetch(LOCAL_LLM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LOCAL_LLM_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            ...history.slice(-20).map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            { role: "user", content: message },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } else {
      geminiRes = await fetch(geminiUrl(modelName, true), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
          },
        }),
        signal: AbortSignal.timeout(25_000),
      });
    }
  } catch (err) {
    console.error("[chat] Gemini timeout:", err?.message);
    return Response.json(
      {
        error: {
          code: "LLM_TIMEOUT",
          message: "Assistant is taking too long. Please try again.",
        },
      },
      { status: 502 },
    );
  }

  if (!geminiRes.ok) {
    const err = await geminiRes.json();
    console.error("[chat] Gemini error:", err?.error?.message);
    return Response.json(
      {
        error: {
          code: "LLM_ERROR",
          message:
            widget.config?.fallback_message ??
            "I'm having trouble responding right now. Please try again.",
        },
      },
      { status: 502 },
    );
  }

  // 8. Local LLM — non-streaming fallback
  if (USE_LOCAL_LLM) {
    const geminiData = await geminiRes.json();
    const reply = geminiData?.choices?.[0]?.message?.content ?? "";
    if (!reply)
      return Response.json(
        {
          error: { code: "EMPTY_RESPONSE", message: "No response generated." },
        },
        { status: 502 },
      );
    logCost(supabase, {
      widget_id,
      client_id: widget.client_id,
      session_id: session_id ?? crypto.randomUUID(),
      input_tokens: 0,
      output_tokens: 0,
    }).catch(() => {});
    return Response.json({ reply, language: detectedLang });
  }

  // 8. Stream Gemini SSE → client SSE
  const _sid = session_id ?? crypto.randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = geminiRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const chunk = JSON.parse(raw);
              const token =
                chunk?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (token)
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ token, language: detectedLang })}\n\n`,
                  ),
                );
            } catch {}
          }
        }
      } finally {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, language: detectedLang })}\n\n`,
          ),
        );
        controller.close();
        logCost(supabase, {
          widget_id,
          client_id: widget.client_id,
          session_id: _sid,
          input_tokens: 0,
          output_tokens: 0,
        }).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
