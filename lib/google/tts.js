/**
 * lib/google/tts.js
 *
 * Google Cloud Text-to-Speech REST client.
 * Uses GOOGLE_TTS_API_KEY env var.
 *
 * Returns a WAV Buffer (same shape as Sarvam TTS so callers are interchangeable).
 */

import "server-only";

const BASE = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * @param {object} p
 * @param {string} p.text
 * @param {string} p.voiceName      e.g. "ml-IN-Wavenet-A"
 * @param {string} p.languageCode   e.g. "ml-IN"
 * @param {number} [p.speakingRate] 0.25–4.0, default 1.0
 * @returns {Promise<Buffer>} WAV buffer
 */
export async function googleTextToSpeech({
  text,
  voiceName,
  languageCode,
  speakingRate = 1.0,
}) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_TTS_API_KEY is not set");

  const body = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: {
      audioEncoding: "LINEAR16", // WAV
      speakingRate,
    },
  };

  const res = await fetch(`${BASE}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Google TTS error ${res.status}: ${err?.error?.message ?? "unknown"}`,
    );
  }

  const data = await res.json();
  if (!data.audioContent) throw new Error("Google TTS: empty audioContent");

  return Buffer.from(data.audioContent, "base64");
}
