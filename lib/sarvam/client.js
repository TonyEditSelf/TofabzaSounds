import "server-only";

import axios from "axios";
import CircuitBreaker from "opossum";

// =============================================================
// /lib/sarvam/client.js
//
// Sarvam AI API client.
// Models (May 2026):
//   STT → Saaras v3  (model: "saaras:v3")  — NOT "saarika" (legacy)
//   TTS → Bulbul v3  (model: "bulbul:v3")
//
// Auth header: api-subscription-key  (NOT Authorization: Bearer)
//
// TTS response: JSON { audios: ["base64WAV..."] }
//   NOT a streaming MP3. Decode base64 → WAV binary → AudioContext.
//
// All calls: 5-second timeout enforced.
// One circuit breaker for all Sarvam calls (5 failures → open 30s).
// =============================================================

const BASE_URL = process.env.SARVAM_API_BASE_URL || "https://api.sarvam.ai";
const TIMEOUT_MS = parseInt(process.env.SARVAM_API_TIMEOUT_MS || "15000");
const AUTH_HEADER = "api-subscription-key"; // exact header name — do not change

/** Shared axios instance for all Sarvam calls */
const sarvamAxios = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { "api-subscription-key": process.env.SARVAM_API_KEY },
});

// =============================================================
// CIRCUIT BREAKER
// 5 consecutive failures → circuit opens for 30s → half-open retry
// =============================================================

const circuitOptions = {
  timeout: TIMEOUT_MS,
  errorThresholdPercentage: 50,
  resetTimeout: 30000, // 30s open before half-open
  volumeThreshold: 5, // min 5 calls before tripping
};

/** Sends a TTS request — wrapped by circuit breaker below */
async function _ttsRequest(payload) {
  const response = await sarvamAxios.post("/text-to-speech", payload);
  return response.data;
}

/** Sends an STT request — wrapped by circuit breaker below */
async function _sttRequest(formData) {
  const response = await sarvamAxios.post("/speech-to-text", formData, {
    headers: { ...formData.getHeaders?.() },
  });
  return response.data;
}

const ttsCircuit = new CircuitBreaker(_ttsRequest, circuitOptions);
const sttCircuit = new CircuitBreaker(_sttRequest, {
  ...circuitOptions,
  errorFilter: (err) => {
    console.error("[stt circuit] error:", err?.response?.data ?? err?.message);
    return false;
  },
});

// Fire alert email when circuit opens
ttsCircuit.on("open", () => {
  console.error("[sarvam] TTS circuit breaker OPEN");
  // Email alert fired from calling code that has agent context
});

sttCircuit.on("open", () => {
  console.error("[sarvam] STT circuit breaker OPEN");
});

/** True when TTS circuit is open (degraded mode banner) */
export function isTtsCircuitOpen() {
  return ttsCircuit.opened;
}
/** True when STT circuit is open */
export function isSttCircuitOpen() {
  return sttCircuit.opened;
}

// =============================================================
// TTS — Bulbul v3
// =============================================================

/**
 * Converts text to speech using Bulbul v3.
 *
 * ⚠️  Response is JSON { audios: ["base64WAV..."] } — NOT streaming MP3.
 * Returns a WAV Buffer decoded from base64.
 * Caller must use AudioContext.decodeAudioData() to play in browser,
 * or strip WAV header for raw PCM when sending to Exotel WebSocket.
 *
 * @param {object} params
 * @param {string} params.text              - Input text (max 2500 chars for bulbul:v3)
 * @param {string} params.languageCode      - BCP-47 e.g. "ml-IN"
 * @param {string} [params.speaker]         - Speaker ID e.g. "anand". Default: "shubh"
 * @param {number} [params.pace]            - Speed 0.5–2.0. Default: 1.0
 * @param {number} [params.speechSampleRate] - 8000|16000|22050|24000. Default: 22050
 * @param {number} [params.temperature]     - Expressiveness 0.01–2.0. Default: 0.6
 * @returns {Promise<Buffer>} WAV audio buffer
 */
export async function textToSpeech({
  text,
  languageCode,
  speaker = "shubh",
  pace = 1.0,
  speechSampleRate = 22050,
  temperature = 0.6,
}) {
  if (!text?.trim()) throw new Error("TTS: text is required");
  if (!languageCode) throw new Error("TTS: languageCode is required");
  if (text.length > 2500)
    throw new Error("TTS: text exceeds 2500 character limit for bulbul:v3");
  if (pace < 0.5 || pace > 2) throw new Error("TTS: pace must be 0.5–2.0");

  const payload = {
    text,
    target_language_code: languageCode,
    speaker,
    pace,
    speech_sample_rate: speechSampleRate,
    model: "bulbul:v3",
    temperature,
    // pitch, loudness, enable_preprocessing — NOT supported on bulbul:v3
  };

  const data = await ttsCircuit.fire(payload);

  if (!data?.audios?.[0]) {
    throw new Error("TTS: empty audios array in response");
  }

  // Decode base64 WAV string → Buffer
  return Buffer.from(data.audios[0], "base64");
}

// =============================================================
// STT — Saaras v3 (REST, for widget audio blobs < 30s)
// =============================================================

/**
 * Transcribes audio using Saaras v3 (REST endpoint).
 * Use for widget audio blobs — audio must be under 30 seconds.
 * For phone call streaming, use the WebSocket client in
 * /telephony-server/src/pipeline/sttStream.js
 *
 * Accepted formats: WAV, MP3, AAC, OGG, OPUS, FLAC, MP4, M4A, AMR, WMA, WebM, PCM
 * Best results at 16kHz sample rate.
 *
 * @param {object} params
 * @param {Buffer} params.audioBuffer   - Audio file binary
 * @param {string} params.mimeType      - MIME type e.g. "audio/webm" or "audio/mp4"
 * @param {string} [params.languageCode] - BCP-47 code, or omit for auto-detect
 * @param {string} [params.mode]        - "transcribe" (default) | "translate" | "verbatim"
 * @returns {Promise<{ transcript: string, languageCode: string, confidence: number }>}
 */
export async function speechToText({
  audioBuffer,
  mimeType,
  languageCode,
  mode = "transcribe",
}) {
  if (!audioBuffer || audioBuffer.length === 0)
    throw new Error("STT: audioBuffer is required");

  // Use FormData for multipart/form-data upload
  const { FormData, Blob } = await import("node:buffer")
    .then(() =>
      // Node 18+ has these; use form-data package if not available
      ({ FormData: globalThis.FormData, Blob: globalThis.Blob }),
    )
    .catch(async () => {
      const { default: FormData } = await import("form-data");
      return { FormData, Blob: null };
    });

  const NodeFormData = (await import("form-data")).default;
  const form = new NodeFormData();

  const safeMime = mimeType.split(";")[0].trim();
  form.append("file", audioBuffer, {
    filename: "audio.webm",
    contentType: safeMime,
  });
  form.append("model", "saaras:v3");
  form.append("mode", mode);
  if (languageCode) form.append("language_code", languageCode);

  const data = await sttCircuit.fire(form);

  return {
    transcript: data.transcript || "",
    languageCode: data.language_code || languageCode || "unknown",
    confidence: data.language_probability || 0,
    requestId: data.request_id,
  };
}

// =============================================================
// HELPERS
// =============================================================

/**
 * Strips the 44-byte WAV header from a WAV buffer,
 * returning raw PCM s16le samples.
 * Used when sending bot audio to Exotel WebSocket (needs raw PCM).
 *
 * @param {Buffer} wavBuffer
 * @returns {Buffer} Raw PCM samples
 */
export function stripWavHeader(wavBuffer) {
  // Standard WAV header is 44 bytes.
  // For WAV files with non-standard chunks, scan for "data" marker.
  const dataMarker = wavBuffer.indexOf(Buffer.from("data"));
  if (dataMarker === -1) {
    // No WAV header found — assume already raw PCM
    return wavBuffer;
  }
  // After "data" marker: 4 bytes chunk size, then PCM data starts
  return wavBuffer.slice(dataMarker + 8);
}

/**
 * Splits a PCM buffer into fixed-size chunks for WebSocket streaming.
 * Exotel requires chunks that are multiples of 320 bytes.
 * 3200 bytes = 100ms of audio at 16kHz mono s16le (1 sample = 2 bytes).
 *
 * @param {Buffer} pcmBuffer
 * @param {number} [chunkSize=3200] - Must be a multiple of 320
 * @returns {Buffer[]}
 */
export function chunkPcm(pcmBuffer, chunkSize = 3200) {
  const chunks = [];
  for (let offset = 0; offset < pcmBuffer.length; offset += chunkSize) {
    chunks.push(pcmBuffer.slice(offset, offset + chunkSize));
  }
  return chunks;
}

/**
 * Validates that a language code is supported by BOTH STT and TTS.
 * Only these 11 codes support full agent operation (voice in + voice out).
 * STT alone supports 23 languages but TTS only supports 11.
 *
 * @param {string} languageCode
 * @returns {boolean}
 */
export function isSupportedAgentLanguage(languageCode) {
  return AGENT_SUPPORTED_LANGUAGES.some((l) => l.code === languageCode);
}

/**
 * Languages where BOTH Saaras v3 STT and Bulbul v3 TTS work.
 * Use this list for agent/widget language dropdowns.
 * Do NOT allow agents in codes outside this list (TTS will fail).
 */
export const AGENT_SUPPORTED_LANGUAGES = [
  { code: "ml-IN", name: "Malayalam" },
  { code: "hi-IN", name: "Hindi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
  { code: "kn-IN", name: "Kannada" },
  { code: "bn-IN", name: "Bengali" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "mr-IN", name: "Marathi" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "od-IN", name: "Odia" },
  { code: "en-IN", name: "English (India)" },
];
