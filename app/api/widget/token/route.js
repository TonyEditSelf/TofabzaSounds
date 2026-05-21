/**
 * app/api/widget/token/route.js
 *
 * POST /api/widget/token
 *
 * Called by the embed script on page load.
 * Validates the origin against widget.allowed_domains.
 * Returns a short-lived token (24h) stored in widget_tokens table.
 *
 * Body: { widget_id, origin }
 */

import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 10;

function extractDomain(origin = "") {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return origin
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0];
  }
}

export async function POST(req) {
  const { widget_id, origin } = await req.json();

  if (!widget_id || !origin) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "widget_id and origin are required.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createAdminClient();

  // 1. Fetch widget
  const { data: widget, error } = await supabase
    .from("widgets")
    .select("id, status, allowed_domains")
    .eq("id", widget_id)
    .single();

  if (error || !widget) {
    return Response.json(
      { error: { code: "WIDGET_NOT_FOUND", message: "Widget not found." } },
      { status: 404 },
    );
  }

  if (widget.status !== "active") {
    return Response.json(
      { error: { code: "WIDGET_INACTIVE", message: "Widget is not active." } },
      { status: 403 },
    );
  }

  // 2. Validate origin against allowed_domains
  const requestDomain = extractDomain(origin);
  const allowedDomains = widget.allowed_domains ?? [];
  const isAllowed = allowedDomains.some(
    (d) => requestDomain === d || requestDomain.endsWith(`.${d}`),
  );

  // Always allow localhost in development
  const isLocalhost =
    requestDomain === "localhost" || requestDomain === "127.0.0.1";

  if (!isAllowed && !isLocalhost) {
    return Response.json(
      {
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "This domain is not authorised for this widget.",
        },
      },
      { status: 403 },
    );
  }

  // 3. Generate token
  const token = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  const { error: insertErr } = await supabase.from("widget_tokens").insert({
    token,
    widget_id,
    allowed_origin: origin,
    expires_at,
  });

  if (insertErr) {
    console.error("[widget/token]", insertErr.message);
    return Response.json(
      {
        error: {
          code: "TOKEN_CREATE_FAILED",
          message: "Failed to create token.",
        },
      },
      { status: 500 },
    );
  }

  return Response.json({ token, expires_at });
}
