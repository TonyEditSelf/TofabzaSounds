import "server-only";

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
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const { private_key, client_email } = JSON.parse(sa);
  const token = await getAccessToken(private_key, client_email);

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
