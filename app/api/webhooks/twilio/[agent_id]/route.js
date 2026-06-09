/**
 * app/api/webhooks/twilio/[agent_id]/route.js
 *
 * Twilio calls this URL when a call comes in.
 * Returns TwiML telling Twilio to open a Media Stream to Railway WebSocket.
 *
 * Twilio Media Streams send mulaw 8kHz — Railway callHandler must handle this.
 * Set TELEPHONY_PROVIDER=twilio and point this number's Voice webhook here.
 */

import { createAdminClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { createHmac } from "crypto";

const RAILWAY_WS_URL = process.env.RAILWAY_WS_URL; // e.g. wss://tofabza-telephony.up.railway.app
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function toWebSocketBase(rawUrl) {
  const trimmed = (rawUrl || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return `wss://${trimmed.slice(8)}`;
  if (/^http:\/\//i.test(trimmed)) return `ws://${trimmed.slice(7)}`;
  return `wss://${trimmed}`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Validates the Twilio request signature (X-Twilio-Signature header).
 * Twilio signs every webhook: HMAC-SHA1(authToken, url + sorted params).
 * Returns true if valid, or if TWILIO_AUTH_TOKEN is not configured (dev mode).
 */
function validateTwilioSignature(signature, url, params) {
  if (!TWILIO_AUTH_TOKEN) {
    console.warn("[twilio webhook] TWILIO_AUTH_TOKEN not set — skipping signature validation");
    return true;
  }
  if (!signature) return false;

  // Build the string to sign: URL + sorted param key-value pairs
  const sortedKeys = Object.keys(params).sort();
  const toSign = url + sortedKeys.map((k) => `${k}${params[k]}`).join("");
  const expected = createHmac("sha1", TWILIO_AUTH_TOKEN)
    .update(toSign, "utf8")
    .digest("base64");

  // Constant-time compare to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req, { params }) {
  const { agent_id } = await params;

  // Read raw body first (needed for signature validation)
  let rawBody = {};
  let rawBodyText = "";
  try {
    rawBodyText = await req.text();
    rawBody = Object.fromEntries(new URLSearchParams(rawBodyText));
  } catch (_) {}

  // Validate Twilio request signature — prevent spoofed webhook calls
  const twilioSignature = req.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/${agent_id}`;
  if (!validateTwilioSignature(twilioSignature, webhookUrl, rawBody)) {
    console.warn("[twilio webhook] Invalid signature — rejecting request");
    return new Response("<Response><Reject/></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = await createAdminClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, status, language, config")
    .eq("id", agent_id)
    .single();

  if (error || !agent) {
    return new Response("<Response><Reject/></Response>", {
      status: 404,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (agent.status !== "active") {
    return new Response("<Response><Reject/></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!RAILWAY_WS_URL) {
    console.error("[twilio webhook] RAILWAY_WS_URL not set");
    return new Response(
      "<Response><Say>Service temporarily unavailable.</Say></Response>",
      { status: 503, headers: { "Content-Type": "text/xml" } },
    );
  }

  const callSid = rawBody.CallSid || "";
  const from = rawBody.From || "";

  logger.inboundWebhook({
    callSid,
    payload: rawBody,
    provider: "twilio",
    agentId: agent_id,
  });

  // Build stream URL — include shared secret token if configured.
  // TWILIO_WS_SECRET must also be set on the Railway telephony server.
  const wsBase = toWebSocketBase(RAILWAY_WS_URL);
  const wsSecret = process.env.TWILIO_WS_SECRET;
  const streamUrl = wsSecret
    ? `${wsBase}/ws/twilio?token=${encodeURIComponent(wsSecret)}`
    : `${wsBase}/ws/twilio`;

  // TwiML: connect call to Media Stream
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="agent_id" value="${escapeXml(agent_id)}" />
      <Parameter name="call_sid" value="${escapeXml(callSid)}" />
      <Parameter name="from" value="${escapeXml(from)}" />
    </Stream>
  </Connect>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET() {
  return new Response("<Response><Say>OK</Say></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
