/**
 * app/api/webhooks/plivo/[agent_id]/route.js
 *
 * Plivo calls this URL (POST) when an inbound call is answered.
 * We return Plivo XML that tells Plivo to stream bidirectional audio
 * to the Railway telephony server's /plivo WebSocket route.
 *
 * Also used as the answerUrl for outbound campaign calls.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req, { params }) {
  const { agent_id } = params;

  const supabase = createAdminClient();

  // Verify agent exists and is active
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, status, language")
    .eq("id", agent_id)
    .single();

  if (error || !agent || agent.status !== "active") {
    // Return empty Response — Plivo will hang up
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml" } },
    );
  }

  const wsUrl = process.env.RAILWAY_WS_URL; // e.g. wss://your-app.railway.app
  if (!wsUrl) {
    console.error("[plivo/answer] RAILWAY_WS_URL is not set");
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml" } },
    );
  }

  // Build WebSocket URL — /plivo path + agent_id + language
  const streamUrl = `${wsUrl}/plivo?agent_id=${agent_id}&lang=${agent.language ?? "ml-IN"}`;

  // Plivo XML — Stream element for bidirectional 16kHz PCM audio
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-l16;rate=16000">${streamUrl}</Stream>
</Response>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
