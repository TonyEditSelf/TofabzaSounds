/**
 * app/api/webhooks/exotel/route.js
 *
 * Handles two kinds of HTTP callbacks from Exotel:
 *
 *  POST /api/webhooks/exotel
 *    StatusCallback — Exotel POSTs call status updates (in-progress, completed,
 *    failed, busy, no-answer) as application/x-www-form-urlencoded.
 *    We upsert the call_logs row so the dashboard shows final status + duration.
 *
 *  GET  /api/webhooks/exotel
 *    Exotel sends a GET to validate the URL before associating it with an AppId.
 *    Returns 200 OK so the validation passes.
 *
 * The WebSocket streaming endpoint lives at:
 *   ws(s)://<host>/api/webhooks/exotel/stream
 * That is served by server.js (not a Route Handler) because Next.js Route Handlers
 * don't support WS upgrades natively.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Service-role Supabase (auth-free, server-only) ───────────────────────────

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

// ─── Basic-auth guard ─────────────────────────────────────────────────────────

function isAuthorized(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return false;
    return (
      decoded.slice(0, sep) === process.env.EXOTEL_API_KEY &&
      decoded.slice(sep + 1) === process.env.EXOTEL_API_TOKEN
    );
  } catch {
    return false;
  }
}

// ─── GET — URL validation ping from Exotel ────────────────────────────────────

export async function GET(request) {
  // Exotel hits this before saving the webhook URL in the dashboard
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── POST — StatusCallback ────────────────────────────────────────────────────

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Exotel sends application/x-www-form-urlencoded
  let fields;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    fields = await request.json().catch(() => ({}));
  } else {
    // form-urlencoded (default)
    const text = await request.text().catch(() => "");
    fields = Object.fromEntries(new URLSearchParams(text));
  }

  const {
    CallSid,
    Status, // queued | in-progress | completed | failed | busy | no-answer
    From,
    To,
    Duration, // seconds (only present on terminal statuses)
    RecordingUrl, // if recording enabled
    Direction, // inbound | outbound-dial
  } = fields;

  if (!CallSid) {
    return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
  }

  const duration = Duration ? parseInt(Duration, 10) : null;
  const direction = Direction?.toLowerCase().startsWith("outbound")
    ? "outbound"
    : "inbound";
  const statusNorm = (Status ?? "").toLowerCase();

  console.log(
    `[Exotel webhook] ${CallSid} → status=${statusNorm} duration=${duration ?? "?"}s`,
  );

  try {
    const db = getDb();

    // Try to find an existing call_log row for this call (inserted by streamHandler on stop).
    // If found — update the final status and duration.
    // If not found — create a minimal record (e.g. calls that failed before streaming started).
    const { data: existing } = await db
      .from("call_logs")
      .select("id")
      .eq("status", CallSid) // streamHandler temporarily stores CallSid in status
      .maybeSingle();

    if (existing?.id) {
      await db
        .from("call_logs")
        .update({
          status: statusNorm,
          duration_seconds: duration ?? undefined,
        })
        .eq("id", existing.id);
    } else if (
      ["completed", "failed", "busy", "no-answer"].includes(statusNorm)
    ) {
      // Terminal status but no existing row — insert a stub record
      // Agent lookup by To number so we can attach client_id
      const { data: agent } = await db
        .from("agents")
        .select("id, client_id")
        .filter("config->>exotel_number", "eq", To)
        .maybeSingle();

      await db.from("call_logs").insert({
        client_id: agent?.client_id ?? null,
        caller_number: From,
        direction,
        duration_seconds: duration ?? 0,
        total_cost_inr: 0,
        status: statusNorm,
        started_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Exotel webhook] DB error:", err.message);
    // Return 200 so Exotel doesn't retry endlessly
    return NextResponse.json({ received: true, warning: "db_error" });
  }
}
