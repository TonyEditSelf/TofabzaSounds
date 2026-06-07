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

const RAILWAY_WS_URL = process.env.RAILWAY_WS_URL; // e.g. wss://tofabza-telephony.up.railway.app

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

export async function POST(req, { params }) {
  const { agent_id } = await params;

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

  let rawBody = {};
  try {
    const text = await req.text();
    rawBody = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const callSid = rawBody.CallSid || "";
  const from = rawBody.From || "";

  logger.inboundWebhook({
    callSid,
    payload: rawBody,
    provider: "twilio",
    agentId: agent_id,
  });

  // Convert wss:// Railway URL for the Stream target
  // Twilio connects via wss; agent_id passed as stream parameter
  const streamUrl = `${toWebSocketBase(RAILWAY_WS_URL)}/ws/twilio`;

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
