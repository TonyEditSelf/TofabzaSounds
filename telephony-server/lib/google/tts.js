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
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const { private_key, client_email } = JSON.parse(sa);
  const token = await getAccessToken(private_key, client_email);

  const body = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: {
      audioEncoding: "LINEAR16", // WAV
      speakingRate,
    },
  };

  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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

async function getAccessToken(privateKey, clientEmail) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const key = await importPrivateKey(privateKey);
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

async function importPrivateKey(pem) {
  const der = Buffer.from(pem.replace(/-----[^-]+-----|\n/g, ""), "base64");
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}
