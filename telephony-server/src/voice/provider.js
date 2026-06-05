/**
 * telephony-server/src/voice/provider.js
 *
 * Self-contained STT/TTS provider for Railway telephony server.
 * No Next.js dependencies (no server-only, no lib/settings.js).
 * Reads config directly from process.env.
 *
 * Supports: Sarvam (default) and Google Cloud.
 */

import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";

// ── Config from env ───────────────────────────────────────────────────────────

const VOICE_PROVIDER = process.env.VOICE_PROVIDER ?? "sarvam";

// Sarvam
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_BASE_URL =
  process.env.SARVAM_API_BASE_URL ?? "https://api.sarvam.ai";
const SARVAM_TIMEOUT_MS = parseInt(
  process.env.SARVAM_API_TIMEOUT_MS ?? "15000",
);

// Google
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// ── Sarvam axios instance ─────────────────────────────────────────────────────

const sarvamAxios = axios.create({
  baseURL: SARVAM_BASE_URL,
  timeout: SARVAM_TIMEOUT_MS,
  headers: { "api-subscription-key": SARVAM_API_KEY },
});

// ── Sarvam TTS ────────────────────────────────────────────────────────────────

async function sarvamTTS({
  text,
  languageCode,
  speaker = "anand",
  pace = 1.0,
  speechSampleRate = 16000,
}) {
  if (!text?.trim()) throw new Error("TTS: text is required");
  if (!languageCode) throw new Error("TTS: languageCode is required");

  const payload = {
    text,
    target_language_code: languageCode,
    speaker,
    pace,
    speech_sample_rate: speechSampleRate,
    model: "bulbul:v3",
    temperature: 0.6,
  };

  const response = await sarvamAxios.post("/text-to-speech", payload);
  const data = response.data;

  if (!data?.audios?.[0]) throw new Error("TTS: empty audios array");
  return Buffer.from(data.audios[0], "base64");
}

// ── Sarvam STT ────────────────────────────────────────────────────────────────

async function sarvamSTT({
  audioBuffer,
  languageCode,
  mimeType = "audio/wav",
}) {
  if (!audioBuffer || audioBuffer.length === 0)
    throw new Error("STT: audioBuffer is required");

  const form = new FormData();
  const safeMime = mimeType.split(";")[0].trim();
  form.append("file", audioBuffer, {
    filename: "audio.wav",
    contentType: safeMime,
  });
  form.append("model", "saaras:v3");
  form.append("mode", "transcribe");
  if (languageCode) form.append("language_code", languageCode);

  const response = await sarvamAxios.post("/speech-to-text", form, {
    headers: { ...form.getHeaders() },
  });

  return response.data?.transcript ?? "";
}

// ── Google helpers ────────────────────────────────────────────────────────────

async function getGoogleAccessToken() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const { private_key, client_email } = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const unsigned = `${header}.${payload}`;

  const der = Buffer.from(
    private_key.replace(/-----[^-]+-----|\n/g, ""),
    "base64",
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Google access token");
  return data.access_token;
}

// ── Google TTS ────────────────────────────────────────────────────────────────

async function googleTTS({
  text,
  languageCode,
  voiceName,
  speakingRate = 1.0,
}) {
  const token = await getGoogleAccessToken();
  const body = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: {
      audioEncoding: "MULAW",
      sampleRateHertz: 8000,
      speakingRate,
    },
  };
  const res = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google TTS error ${res.status}: ${err?.error?.message}`);
  }
  const data = await res.json();
  if (!data.audioContent) throw new Error("Google TTS: empty audioContent");
  return Buffer.from(data.audioContent, "base64");
}

// ── Google STT ────────────────────────────────────────────────────────────────

async function googleSTT({ audioBuffer, languageCode = "ml-IN" }) {
  console.log(
    "[googleSTT] size:",
    audioBuffer.length,
    "first bytes:",
    audioBuffer.slice(0, 4).toString("hex"),
  );
  const token = await getGoogleAccessToken();
  const body = {
    audio: { content: audioBuffer.toString("base64") },
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode,
      model: "phone_call",
    },
  };
  const res = await fetch("https://speech.googleapis.com/v1/speech:recognize", {
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
    throw new Error(`Google STT error ${res.status}: ${err?.error?.message}`);
  }
  const data = await res.json();
  return data.results?.[0]?.alternatives?.[0]?.transcript ?? "";
}

// ── Unified exports ───────────────────────────────────────────────────────────

export async function tts({
  text,
  languageCode,
  voiceId,
  pace = 1.0,
  sampleRate = 16000,
}) {
  const provider = VOICE_PROVIDER;

  if (provider === "google") {
    return googleTTS({
      text,
      languageCode,
      voiceName:
        voiceId ?? process.env.GOOGLE_DEFAULT_VOICE ?? "ml-IN-Wavenet-B",
      speakingRate: pace,
    });
  }

  return sarvamTTS({
    text,
    languageCode,
    speaker: voiceId ?? process.env.SARVAM_DEFAULT_VOICE ?? "anand",
    pace,
    speechSampleRate: sampleRate,
  });
}

export async function stt({
  audioBuffer,
  languageCode,
  mimeType = "audio/wav",
}) {
  const provider = VOICE_PROVIDER;

  if (provider === "google") {
    return googleSTT({ audioBuffer, languageCode });
  }

  return sarvamSTT({ audioBuffer, languageCode, mimeType });
}
