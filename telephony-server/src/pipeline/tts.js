/**
 * telephony-server/src/pipeline/tts.js
 *
 * Calls Sarvam Bulbul v3 TTS.
 * Returns WAV buffer (base64 decoded from Sarvam JSON response).
 */

import axios from "axios";

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const TIMEOUT_MS = 10000;

/**
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.language  - BCP-47 e.g. "ml-IN"
 * @param {string} params.speaker   - e.g. "anand"
 * @param {number} params.pace      - 0.5–2.0
 * @returns {Promise<Buffer>} WAV buffer
 */
export async function synthesizeSpeech({
  text,
  language = "ml-IN",
  speaker = "anand",
  pace = 1.0,
}) {
  if (!text?.trim()) throw new Error("TTS: text is required");

  // Clamp pace to valid range
  const safePace = Math.min(2.0, Math.max(0.5, pace));

  // Truncate — Bulbul v3 max 2500 chars
  const safeText = text.slice(0, 2500);

  try {
    const res = await axios.post(
      SARVAM_TTS_URL,
      {
        text: safeText,
        target_language_code: language,
        speaker,
        pace: safePace,
        speech_sample_rate: 8000, // 8kHz for telephony (Exotel G.711)
        model: "bulbul:v3",
        temperature: 0.6,
      },
      {
        headers: {
          "api-subscription-key": SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_MS,
      },
    );

    const base64Audio = res.data?.audios?.[0];
    if (!base64Audio) throw new Error("TTS: empty audios array");

    return Buffer.from(base64Audio, "base64");
  } catch (err) {
    console.error("[tts] Failed:", err?.response?.data ?? err?.message);
    throw err;
  }
}
