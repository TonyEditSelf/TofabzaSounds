/**
 * lib/google/stt.js
 *
 * Google Cloud Speech-to-Text REST client.
 * Uses shared token cache from lib/google/auth.js — no per-call auth overhead.
 */

import "server-only";
import { getGoogleAccessToken } from "./auth.js";

const BASE = "https://speech.googleapis.com/v1/speech:recognize";

/**
 * Google Cloud STT (Speech-to-Text)
 *
 * @param {object} p
 * @param {Buffer} p.audioBuffer
 * @param {string} [p.languageCode]
 * @returns {Promise<string>}
 */
export async function googleSpeechToText({
  audioBuffer,
  languageCode = "ml-IN",
}) {
  const token = await getGoogleAccessToken();

  const body = {
    audio: { content: audioBuffer.toString("base64") },
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode,
      model: "latest_long",
    },
  };

  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Google STT error ${res.status}: ${err?.error?.message ?? "unknown"}`,
    );
  }

  const data = await res.json();
  const alt = data.results?.[0]?.alternatives?.[0];
  return alt?.transcript ?? "";
}
