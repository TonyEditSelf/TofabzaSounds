/**
 * app/api/webhooks/exotel/[agent_id]/route.js
 *
 * Exotel calls this URL when a call comes in on the agent's ExoPhone.
 * Returns a JSON response telling Exotel where to connect the WebSocket stream.
 *
 * Exotel Voicebot Applet expects:
 * {
 *   "url": "wss://your-railway-app.up.railway.app/ws/call?agent_id=xxx",
 *   "bidirectional": true,
 *   "sample_rate": 16000,
 *   "encoding": "pcm_s16le"
 * }
 */

import { createAdminClient } from "@/lib/supabase/server";

const RAILWAY_WS_URL = process.env.RAILWAY_WS_URL; // e.g. wss://tofabza-telephony.up.railway.app

import telephony from "@/lib/telephony/index";
import logger from "@/lib/logger";

export async function POST(req, { params }) {
  const { agent_id } = await params;

  // Validate agent exists and is active
  const supabase = await createAdminClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, status, language, config")
    .eq("id", agent_id)
    .single();

  if (error || !agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.status !== "active") {
    return Response.json({ error: "Agent is not active" }, { status: 403 });
  }

  if (!RAILWAY_WS_URL) {
    console.error("[exotel webhook] RAILWAY_WS_URL not set");
    return Response.json(
      { error: "Telephony server not configured" },
      { status: 503 },
    );
  }

  let rawBody = {};
  try {
    const text = await req.text();
    rawBody = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const callSid = rawBody.CallSid || rawBody.call_sid || "";

  logger.inboundWebhook({
    callSid,
    payload: rawBody,
    provider: process.env.TELEPHONY_PROVIDER || "exotel",
    agentId: agent_id,
  });

  const wsConfig = telephony.getWebSocketConfig(agent_id);

  console.log(
    `[exotel webhook] Inbound call → agent: ${agent_id} → ws: ${wsConfig.url}`,
  );

  return Response.json({
    url: wsConfig.url,
    bidirectional: true,
    sample_rate: 16000,
    encoding: "pcm_s16le",
  });
}

// Exotel also sends GET for health checks
export async function GET() {
  return Response.json({ status: "ok" });
}
