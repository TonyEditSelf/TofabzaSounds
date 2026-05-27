/**
 * lib/plivo/client.js
 *
 * Plivo outbound call helper — equivalent to makeExotelCall in lib/exotel/client.js.
 *
 * Required env vars:
 *   PLIVO_AUTH_ID       — Plivo Auth ID (from console.plivo.com)
 *   PLIVO_AUTH_TOKEN    — Plivo Auth Token
 *   PLIVO_PHONE_NUMBER  — Caller number in E.164 format, e.g. +919876543210
 *   NEXTJS_URL          — Public base URL of the Next.js app, e.g. https://app.example.com
 */

const PLIVO_API_BASE = "https://api.plivo.com/v1";

/**
 * Place an outbound call via Plivo.
 *
 * @param {object} params
 * @param {string} params.to          - Destination number in E.164 format
 * @param {string} params.answerUrl   - Webhook URL Plivo hits when the call is answered
 * @returns {Promise<object>}         - Full Plivo response JSON
 * @throws {Error}                    - On non-2xx HTTP response
 */
export async function makePlivoCall({ to, answerUrl }) {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const from = process.env.PLIVO_PHONE_NUMBER;
  const hangupUrl = `${process.env.NEXTJS_URL}/api/webhooks/plivo/status`;

  if (!authId || !authToken || !from) {
    throw new Error(
      "Plivo env vars missing: PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_PHONE_NUMBER are required.",
    );
  }

  const credentials = Buffer.from(`${authId}:${authToken}`).toString("base64");

  const body = new URLSearchParams({
    from,
    to,
    answer_url: answerUrl,
    answer_method: "POST",
    hangup_url: hangupUrl,
    hangup_method: "POST",
  });

  const response = await fetch(`${PLIVO_API_BASE}/Account/${authId}/Call/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Plivo call failed [${response.status}]: ${JSON.stringify(json)}`,
    );
  }

  return json;
}
