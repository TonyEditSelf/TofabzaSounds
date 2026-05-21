/**
 * app/api/voices/preview/route.js
 *
 * Thin proxy to Sarvam TTS.
 * Returns raw audio buffer — client decodes via Web Audio API.
 */

import { requireOperator } from "@/lib/auth/requireOperator";
import { textToSpeech } from "@/lib/sarvam/client";

export const maxDuration = 15; // seconds — Vercel route timeout

export async function POST(req) {
  try {
    await requireOperator();
  } catch (res) {
    return res;
  }

  const { voice_id, text, speed = 1, languageCode } = await req.json();

  if (!voice_id || !text?.trim()) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "voice_id and text are required.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const audioBuffer = await textToSpeech({
      text,
      languageCode: languageCode ?? "ml-IN",
      speaker: voice_id,
      pace: speed,
    });
    return new Response(audioBuffer, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    console.error("[voices/preview]", err?.message);
    return Response.json(
      {
        error: {
          code: "SARVAM_ERROR",
          message: "Voice preview unavailable. Try again in a moment.",
        },
      },
      { status: 502 },
    );
  }
}
