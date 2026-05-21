/**
 * app/api/stt/route.js
 *
 * Widget STT endpoint.
 * Receives audio blob from embed.js → forwards to Sarvam Saaras v3 → returns transcript.
 *
 * Headers: X-Audio-Mime — detected MIME type from MediaRecorder
 * Body: FormData with "audio" field
 */

import { speechToText } from "@/lib/sarvam/client";

export const maxDuration = 30;

export async function POST(req) {
  const mimeType = req.headers.get("x-audio-mime") || "audio/webm";

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_BODY",
          message: "Expected multipart/form-data.",
        },
      },
      { status: 400 },
    );
  }

  const audioFile = formData.get("audio");
  if (!audioFile) {
    return Response.json(
      { error: { code: "NO_AUDIO", message: "No audio file provided." } },
      { status: 400 },
    );
  }

  // Size guard — Sarvam max 30s audio, roughly 5MB for webm
  if (audioFile.size > 5 * 1024 * 1024) {
    return Response.json(
      {
        error: {
          code: "AUDIO_TOO_LARGE",
          message: "Audio must be under 5MB (30 seconds).",
        },
      },
      { status: 400 },
    );
  }

  try {
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    console.log("[stt] mimeType:", mimeType, "size:", audioBuffer.length);

    const result = await speechToText({
      audioBuffer,
      mimeType,
      mode: "transcribe",
    });

    if (!result.transcript) {
      return Response.json(
        {
          error: {
            code: "EMPTY_TRANSCRIPT",
            message: "Didn't catch that. Please try again.",
          },
        },
        { status: 422 },
      );
    }

    return Response.json({
      transcript: result.transcript,
      languageCode: result.languageCode,
      confidence: result.confidence,
    });
  } catch (err) {
    console.error("[stt]", err?.message);
    return Response.json(
      {
        error: {
          code: "STT_FAILED",
          message: "Voice transcription failed. Please try again.",
        },
      },
      { status: 502 },
    );
  }
}
