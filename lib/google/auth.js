/**
 * lib/google/auth.js
 *
 * Shared Google OAuth2 token cache for lib/google/* modules.
 * Previously each TTS/STT call created a new JWT + exchange — 200-400ms overhead.
 * Now tokens are cached for their full 3600s lifetime minus a 60s safety margin.
 */

import "server-only";

let _tokenCache = null;
let _cachedCryptoKey = null;

/**
 * Returns a valid Google OAuth2 Bearer token.
 * Parses GOOGLE_SERVICE_ACCOUNT_JSON, mints a JWT, exchanges it — or returns cached.
 *
 * @returns {Promise<string>}
 */
export async function getGoogleAccessToken() {
  // Return cached token if still valid (with 60s safety buffer)
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.token;
  }

  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const { private_key, client_email } = JSON.parse(sa);
  const normalizedKey = private_key.replace(/\\n/g, "\n");

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

  // Cache the crypto key — importKey is expensive
  if (!_cachedCryptoKey) {
    const der = Buffer.from(
      normalizedKey.replace(/-----[^-]+-----|\\n|\n/g, ""),
      "base64",
    );
    _cachedCryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    _cachedCryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      data?.error_description ?? data?.error ?? "Failed to get Google access token",
    );
  }

  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}
