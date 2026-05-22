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

  // Build WebSocket URL with agent context
  const wsUrl = `${RAILWAY_WS_URL}/ws/call?agent_id=${agent_id}&lang=${agent.language ?? "ml-IN"}`;

  // Log the inbound call attempt
  console.log(
    `[exotel webhook] Inbound call → agent: ${agent_id} → ws: ${wsUrl}`,
  );

  // Return Exotel Voicebot Applet response
  return Response.json({
    url: wsUrl,
    bidirectional: true,
    sample_rate: 16000,
    encoding: "pcm_s16le",
  });
}

// Exotel also sends GET for health checks
export async function GET() {
  return Response.json({ status: "ok" });
}
