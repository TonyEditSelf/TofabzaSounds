import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlivo } from "@/lib/telephony/provider";
import { makePlivoCall } from "@/lib/plivo/client";

// Exotel outbound call — v3 Calls API
// POST https://api.exotel.com/v1/Accounts/{sid}/Calls/connect.json
async function makeExotelCall({ to, agentWebhookUrl }) {
  const sid = process.env.EXOTEL_ACCOUNT_SID; // tofabza1
  const key = process.env.EXOTEL_API_KEY;
  const token = process.env.EXOTEL_API_TOKEN;
  const exophone = process.env.EXOTEL_EXOPHONE ?? "04954266427";
  const subdomain = process.env.EXOTEL_SUBDOMAIN ?? "api.exotel.com";

  const url = `https://${key}:${token}@${subdomain}/v1/Accounts/${sid}/Calls/connect.json`;

  const body = new URLSearchParams({
    From: exophone,
    To: to,
    CallerId: exophone,
    // Url points to the TwiML-style callback on your Next.js app
    // Exotel will POST to this URL when the called party answers
    Url: agentWebhookUrl,
    Record: "false",
    StatusCallback: `${process.env.NEXTJS_URL}/api/webhooks/exotel/status`,
    StatusCallbackEvents: "terminal",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exotel error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function POST(req, { params }) {
  // Allow cron/internal calls via x-internal-secret header
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternalCall =
    internalSecret && internalSecret === process.env.INTERNAL_API_SECRET;

  if (!isInternalCall) {
    const authError = await requireOperator(req);
    if (authError) return authError;
  }

  const { id } = params;
  const supabase = createAdminClient();

  // ── 1. load campaign ────────────────────────────────────────────────────────
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("*, agents(id, name, config)")
    .eq("id", id)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "running") {
    return NextResponse.json(
      { error: "Campaign is already running" },
      { status: 409 },
    );
  }

  if (!campaign.agent_id) {
    return NextResponse.json(
      { error: "No agent assigned to this campaign" },
      { status: 400 },
    );
  }

  // ── 2. load pending contacts ─────────────────────────────────────────────────
  const { data: contacts, error: contErr } = await supabase
    .from("contacts")
    .select("id, phone, name")
    .eq("campaign_id", id)
    .eq("status", "pending");

  if (contErr) {
    return NextResponse.json(
      { error: "Failed to load contacts" },
      { status: 500 },
    );
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json(
      { error: "No pending contacts to call" },
      { status: 400 },
    );
  }

  // ── 3. mark campaign as running ──────────────────────────────────────────────
  const { error: runErr } = await supabase
    .from("campaigns")
    .update({ status: "running" })
    .eq("id", id);
  if (runErr) {
    return NextResponse.json(
      { error: "Failed to update campaign status" },
      { status: 500 },
    );
  }

  // ── 4. fire outbound calls (non-blocking — respond immediately) ──────────────
  const nextjsUrl = process.env.NEXTJS_URL;
  if (!nextjsUrl) {
    return NextResponse.json(
      { error: "NEXTJS_URL is not configured" },
      { status: 500 },
    );
  }

  const agentWebhookUrl = isPlivo()
    ? `${nextjsUrl}/api/webhooks/plivo/${campaign.agent_id}`
    : `${nextjsUrl}/api/webhooks/exotel/${campaign.agent_id}`;

  // Launch in background; don't await
  (async () => {
    let answeredCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      try {
        // mark as calling
        await supabase
          .from("contacts")
          .update({ status: "calling", called_at: new Date().toISOString() })
          .eq("id", contact.id);

        const exotelRes = isPlivo()
          ? await makePlivoCall({
              to: contact.phone,
              answerUrl: agentWebhookUrl,
            })
          : await makeExotelCall({ to: contact.phone, agentWebhookUrl });

        const callSid = isPlivo()
          ? (exotelRes?.request_uuid ?? null)
          : (exotelRes?.Call?.Sid ?? null);

        const { error: logErr } = await supabase.from("call_logs").insert({
          call_sid: callSid,
          agent_id: campaign.agent_id,
          client_id: campaign.client_id,
          caller_number: contact.phone,
          direction: "outbound",
          status: "calling",
          campaign_id: id,
          started_at: new Date().toISOString(),
        });
        if (logErr)
          console.error(
            `[campaign:launch] call_log insert failed for ${contact.phone}:`,
            logErr.message,
          );

        // Store call_sid so the status webhook can match exactly
        const { error: callingErr } = await supabase
          .from("contacts")
          .update({ status: "calling", call_sid: callSid })
          .eq("id", contact.id);
        if (callingErr)
          console.error(
            `[campaign:launch] contact status update failed:`,
            callingErr.message,
          );

        answeredCount++;

        // Throttle: 1 call per 2 s to avoid Exotel rate limits
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(
          `[campaign:launch] Failed to call ${contact.phone}:`,
          err.message,
        );

        await supabase
          .from("contacts")
          .update({ status: "failed" })
          .eq("id", contact.id);

        failedCount++;
      }
    }

    // ── mark campaign completed ─────────────────────────────────────────────
    const { error: completeErr } = await supabase
      .from("campaigns")
      .update({
        status: "completed",
        config: {
          ...campaign.config,
          last_run: new Date().toISOString(),
          answered: answeredCount,
          failed: failedCount,
        },
      })
      .eq("id", id);
    if (completeErr)
      console.error(
        "[campaign:launch] Failed to mark campaign completed:",
        completeErr.message,
      );

    console.log(
      `[campaign:launch] Done — answered: ${answeredCount}, failed: ${failedCount}`,
    );

    // Send completion email
    try {
      const { sendCampaignCompletedEmail } = await import("@/lib/email/client");
      await sendCampaignCompletedEmail({
        campaignName: campaign.name,
        answered: answeredCount,
        failed: failedCount,
        total: contacts.length,
        dashboardUrl: process.env.NEXTJS_URL ?? "",
      });
    } catch (err) {
      console.warn("[campaign:launch] email failed:", err.message);
    }
  })();

  return NextResponse.json({
    ok: true,
    message: `Launching calls to ${contacts.length} contacts`,
    count: contacts.length,
  });
}
