/**
 * app/api/voices/google-preview/route.js
 *
 * Operator-only proxy to Google Cloud TTS.
 * Returns raw WAV buffer — same as /api/voices/preview.
 */

import { requireOperator } from "@/lib/auth/requireOperator";
import { googleTextToSpeech } from "@/lib/google/tts";

export const maxDuration = 15;

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
    const audioBuffer = await googleTextToSpeech({
      text,
      voiceName: voice_id,
      languageCode: languageCode ?? "ml-IN",
      speakingRate: speed,
    });

    return new Response(audioBuffer, {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    });
  } catch (err) {
    console.error("[voices/google-preview]", err?.message);
    return Response.json(
      {
        error: {
          code: "GOOGLE_TTS_ERROR",
          message: err?.message ?? "Google TTS unavailable.",
        },
      },
      { status: 502 },
    );
  }
}
