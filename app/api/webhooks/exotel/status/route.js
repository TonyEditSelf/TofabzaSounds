// app/api/webhooks/exotel/status/route.js
//
// Exotel calls this URL when a call's status changes (completed, failed,
// busy, no-answer, etc.).  We use it to close out call_logs rows that were
// optimistically written as "in_progress" when the campaign launched.
//
// Exotel sends application/x-www-form-urlencoded with (at minimum):
//   CallSid         — matches call_logs.call_sid
//   Status          — "completed" | "failed" | "busy" | "no-answer" | "canceled"
//   Duration        — total call duration in seconds (only present when completed)
//   RecordingUrl    — optional
//
// This route is PUBLIC (no operator auth) — Exotel can't send our cookies.
// We verify the payload is plausible by requiring CallSid to exist in our DB.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { EXOTEL_COSTS } from "@/lib/costs/pricing";

// Map Exotel status strings → our internal status values
const STATUS_MAP = {
  completed: "completed",
  failed: "failed",
  busy: "failed", // treat busy as failed for our purposes
  "no-answer": "failed",
  canceled: "failed",
  initiated: "in_progress", // shouldn't arrive here but handle gracefully
  ringing: "in_progress",
  "in-progress": "in_progress",
};

export async function POST(req) {
  try {
    // Parse form-encoded body
    const text = await req.text();
    const params = Object.fromEntries(new URLSearchParams(text));

    const callSid = params.CallSid || params.call_sid;
    const rawStatus = (params.Status || params.status || "").toLowerCase();
    const duration = parseInt(params.Duration || params.duration || "0", 10);

    if (!callSid) {
      console.warn("[exotel/status] missing CallSid — ignoring");
      return NextResponse.json(
        { ok: false, error: "missing CallSid" },
        { status: 400 },
      );
    }

    const mappedStatus = STATUS_MAP[rawStatus] ?? "failed";

    // Only write final states — skip intermediate "in-progress" / "ringing" pings
    const isFinal = mappedStatus === "completed" || mappedStatus === "failed";

    const supabase = createAdminClient();

    // Fetch existing log to get cost context
    const { data: log, error: fetchErr } = await supabase
      .from("call_logs")
      .select("id, total_cost_inr, direction, started_at")
      .eq("call_sid", callSid)
      .maybeSingle();

    if (fetchErr) {
      console.error("[exotel/status] DB fetch error:", fetchErr.message);
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 },
      );
    }

    if (!log) {
      // Unknown CallSid — could be an inbound call not initiated by us, or a duplicate.
      // Return 200 so Exotel doesn't keep retrying.
      console.warn("[exotel/status] CallSid not found in call_logs:", callSid);
      return NextResponse.json({ ok: true, note: "unknown CallSid — ignored" });
    }

    // Calculate Exotel cost for this call duration
    // EXOTEL_COSTS.OUTBOUND_PER_MIN is cost per minute in ₹
    const exotelCost =
      isFinal && duration > 0
        ? parseFloat(
            ((duration / 60) * (EXOTEL_COSTS?.OUTBOUND_PER_MIN ?? 0.5)).toFixed(
              4,
            ),
          )
        : 0;

    const updates = {
      status: mappedStatus,
      ended_at: new Date().toISOString(),
      ...(isFinal && duration > 0 && { duration_seconds: duration }),
      // Only update cost if we calculated something meaningful and the row
      // doesn't already have a non-zero cost from the telephony server
      ...(exotelCost > 0 &&
        !log.total_cost_inr && { total_cost_inr: exotelCost }),
    };

    // For non-final pings (shouldn't normally hit here) just update status
    const { error: updateErr } = await supabase
      .from("call_logs")
      .update(updates)
      .eq("call_sid", callSid);

    if (updateErr) {
      console.error("[exotel/status] DB update error:", updateErr.message);
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 },
      );
    }

    // If this contact was part of a campaign, update campaign_contacts.status too
    if (isFinal) {
      // Find the contact by matching call_sid via the campaign_contacts join
      // campaign_contacts doesn't store call_sid directly — match on called_at + campaign
      // The simplest reliable approach: update via the call_log's campaign_id
      const { data: fullLog } = await supabase
        .from("call_logs")
        .select("campaign_id, caller_number")
        .eq("call_sid", callSid)
        .maybeSingle();

      if (fullLog?.campaign_id && fullLog?.caller_number) {
        await supabase
          .from("campaign_contacts")
          .update({
            status: mappedStatus === "completed" ? "called" : "failed",
          })
          .eq("campaign_id", fullLog.campaign_id)
          .eq("phone", fullLog.caller_number)
          .eq("status", "calling"); // only update if still marked "calling"
      }
    }

    console.log(`[exotel/status] ${callSid} → ${mappedStatus} (${duration}s)`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exotel/status] unexpected error:", err?.message);
    // Always return 200 to Exotel — we don't want infinite retries on our bugs
    return NextResponse.json({ ok: false, error: err?.message });
  }
}
