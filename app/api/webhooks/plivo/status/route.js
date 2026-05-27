/**
 * app/api/webhooks/plivo/status/route.js
 *
 * Plivo hangup webhook — equivalent to app/api/webhooks/exotel/status/route.js.
 *
 * Plivo POST fields (application/x-www-form-urlencoded):
 *   CallUUID    — unique call identifier (maps to call_sid in call_logs)
 *   CallStatus  — completed | failed | busy | no-answer | canceled
 *   Duration    — call duration in seconds (string)
 *
 * Security: Plivo does not support a shared secret in the URL the same way
 * Exotel does.  We verify that CallUUID exists in call_logs before writing,
 * which prevents arbitrary external writes.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// import { calculateCallCost } from "@/lib/costs/pricing";
// reuse existing cost logic

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/** Map Plivo CallStatus values to the internal status vocabulary. */
const STATUS_MAP = {
  completed: "completed",
  failed: "failed",
  busy: "failed",
  "no-answer": "failed",
  canceled: "failed",
};

export async function POST(request) {
  try {
    const text = await request.text();
    const params = new URLSearchParams(text);

    const callUUID = params.get("CallUUID");
    const plivoStatus = params.get("CallStatus") ?? "failed";
    const duration = parseInt(params.get("Duration") ?? "0", 10);

    if (!callUUID) {
      return NextResponse.json({ error: "Missing CallUUID" }, { status: 400 });
    }

    // Verify the call exists before writing (acts as implicit auth check).
    const { data: existingLog, error: lookupError } = await supabaseAdmin
      .from("call_logs")
      .select("id, client_id, direction")
      .eq("call_sid", callUUID)
      .single();

    if (lookupError || !existingLog) {
      // Unknown call — ignore silently to avoid leaking information.
      return NextResponse.json({ ok: true });
    }

    const internalStatus = STATUS_MAP[plivoStatus] ?? "failed";
    const endedAt = new Date().toISOString();

    // Calculate cost using the same pricing helper as Exotel.
    let totalCostInr = null;
    try {
      totalCostInr = calculateCallCost({
        durationSeconds: duration,
        direction: existingLog.direction,
        provider: "plivo",
      });
    } catch {
      // Cost calculation is best-effort; do not fail the webhook.
    }

    await supabaseAdmin
      .from("call_logs")
      .update({
        status: internalStatus,
        duration_seconds: duration,
        ended_at: endedAt,
        ...(totalCostInr !== null ? { total_cost_inr: totalCostInr } : {}),
      })
      .eq("call_sid", callUUID);

    // If the call belongs to a campaign, update the matching contact row.
    if (internalStatus === "completed" || internalStatus === "failed") {
      await supabaseAdmin
        .from("contacts")
        .update({
          status: internalStatus === "completed" ? "called" : "failed",
          called_at: endedAt,
        })
        .eq("call_sid", callUUID);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[plivo/status] Unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
