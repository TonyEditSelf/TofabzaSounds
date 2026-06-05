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

  logger.inboundWebhook({
    callSid,
    payload: rawBody,
    provider: "twilio",
    agentId: agent_id,
  });

  // Convert wss:// Railway URL for the Stream target
  // Twilio connects via wss; agent_id passed as stream parameter
  const streamUrl = `${RAILWAY_WS_URL}/ws/twilio`;

  // TwiML: connect call to Media Stream
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
  <Stream url="${streamUrl.replace(/&/g, "&amp;")}">
      <Parameter name="agent_id" value="${agent_id}" />
      <Parameter name="call_sid" value="${callSid}" />
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
