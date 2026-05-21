/**
 * app/api/tts/route.js
 *
 * Widget TTS endpoint.
 * Receives text → calls Sarvam Bulbul v3 → returns WAV buffer.
 *
 * Body: { text, language, speaker, pace }
 */

import { textToSpeech } from "@/lib/sarvam/client";

export const maxDuration = 15;

export async function POST(req) {
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
