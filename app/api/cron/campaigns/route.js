// app/api/cron/campaigns/route.js
//
// Vercel cron job — runs every 5 minutes.
// Finds all campaigns where status = 'scheduled' and scheduled_at <= now(),
// then calls the existing launch route for each one internally.
//
// Protected by CRON_SECRET header (set in vercel.json + env vars).
// Vercel injects this automatically when using the cron config.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const CRON_SECRET = process.env.CRON_SECRET;
const NEXTJS_URL = process.env.NEXTJS_URL;

export async function GET(req) {
  // Verify this is a legitimate Vercel cron invocation
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn("[cron/campaigns] unauthorized attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find all campaigns due to launch
  const { data: dueCampaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, client_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  if (error) {
    console.error("[cron/campaigns] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueCampaigns?.length) {
    return NextResponse.json({ ok: true, launched: 0, note: "nothing due" });
  }

  console.log(`[cron/campaigns] ${dueCampaigns.length} campaign(s) due`);

  const results = await Promise.allSettled(
    dueCampaigns.map(async (campaign) => {
      try {
        // Mark as 'launching' immediately so a second cron tick can't double-fire
        const { error: lockErr } = await supabase
          .from("campaigns")
          .update({ status: "launching" })
          .eq("id", campaign.id)
          .eq("status", "scheduled"); // optimistic lock — only updates if still 'scheduled'

        if (lockErr) throw new Error(`Lock failed: ${lockErr.message}`);

        // Call the existing launch route internally
        const launchRes = await fetch(
          `${NEXTJS_URL}/api/campaigns/${campaign.id}/launch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Pass the internal secret so requireOperator() can be bypassed
              // OR use the service-role cookie pattern your launch route expects.
              // Adjust this to match how your launch route is actually protected.
              "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
            },
          },
        );

        if (!launchRes.ok) {
          const body = await launchRes.text();
          throw new Error(`Launch HTTP ${launchRes.status}: ${body}`);
        }

        console.log(
          `[cron/campaigns] launched: ${campaign.id} (${campaign.name})`,
        );
        return { id: campaign.id, ok: true };
      } catch (err) {
        // Revert status back to 'scheduled' so it can be retried next tick
        await supabase
          .from("campaigns")
          .update({ status: "scheduled" })
          .eq("id", campaign.id);

        console.error(
          `[cron/campaigns] failed to launch ${campaign.id}:`,
          err.message,
        );
        return { id: campaign.id, ok: false, error: err.message };
      }
    }),
  );

  const launched = results.filter(
    (r) => r.status === "fulfilled" && r.value?.ok,
  ).length;
  const failed = results.length - launched;

  return NextResponse.json({ ok: true, launched, failed });
}
