import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";

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
  const authError = await requireOperator(req);
  if (authError) return authError;

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
    .from("campaign_contacts")
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
  await supabase.from("campaigns").update({ status: "running" }).eq("id", id);

  // ── 4. fire outbound calls (non-blocking — respond immediately) ──────────────
  const nextjsUrl = process.env.NEXTJS_URL ?? "http://localhost:3000";

  const agentWebhookUrl = `${nextjsUrl}/api/webhooks/exotel/${campaign.agent_id}`;

  // Launch in background; don't await
  (async () => {
    let answeredCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      try {
        // mark as calling
        await supabase
          .from("campaign_contacts")
          .update({ status: "calling", called_at: new Date().toISOString() })
          .eq("id", contact.id);

        const exotelRes = await makeExotelCall({
          to: contact.phone,
          agentWebhookUrl,
        });

        const callSid = exotelRes?.Call?.Sid ?? null;

        await supabase.from("call_logs").insert({
          call_sid: callSid,
          agent_id: campaign.agent_id,
          client_id: campaign.client_id,
          caller_number: contact.phone,
          direction: "outbound",
          status: "calling",
          campaign_id: id,
          started_at: new Date().toISOString(),
        });

        // Optimistically mark answered — real status comes via Exotel status callback
        await supabase
          .from("campaign_contacts")
          .update({ status: "answered" })
          .eq("id", contact.id);

        answeredCount++;

        // Throttle: 1 call per 2 s to avoid Exotel rate limits
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(
          `[campaign:launch] Failed to call ${contact.phone}:`,
          err.message,
        );

        await supabase
          .from("campaign_contacts")
          .update({ status: "failed" })
          .eq("id", contact.id);

        failedCount++;
      }
    }

    // ── mark campaign completed ─────────────────────────────────────────────
    await supabase
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
