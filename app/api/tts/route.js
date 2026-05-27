/**
 * app/api/tts/route.js
 *
 * Widget TTS endpoint.
 * Receives text → calls Sarvam Bulbul v3 → returns WAV buffer.
 *
 * Body: { text, language, speaker, pace }
 */

import { textToSpeech } from "@/lib/sarvam/client";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 15;

async function validateWidgetToken(req) {
  const token = req.headers.get("x-widget-token");
  if (!token) return false;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("widget_tokens")
    .select("id, expires_at")
    .eq("token", token)
    .single();
  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) return false;
  return true;
}

export async function POST(req) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev) {
    const valid = await validateWidgetToken(req);
    if (!valid)
      return Response.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or missing widget token.",
          },
        },
        { status: 401 },
      );
  }

  const {
    text,
    language = "ml-IN",
    speaker = "anand",
    pace = 1.0,
  } = await req.json();

  if (!text?.trim()) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "text is required." } },
      { status: 400 },
    );
  }

  try {
    const wavBuffer = await textToSpeech({
      text: text.slice(0, 2500),
      languageCode: language,
      speaker,
      pace,
      speechSampleRate: 22050,
    });

    return new Response(wavBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[tts]", err?.message);
    return Response.json(
      { error: { code: "TTS_FAILED", message: "Voice synthesis failed." } },
      { status: 502 },
    );
  }
}
