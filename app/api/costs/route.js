import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";

// ── cost constants (mirrors lib/costs/pricing.js) ─────────────────────────────
// Override via settings table if present
const DEFAULTS = {
  exotel_cost_per_minute_inr: 1.0, // ₹ per minute
  sarvam_stt_cost_per_minute: 0.0041, // USD per minute → converted
  sarvam_tts_cost_per_char: 0.000004, // USD per char
  cost_markup_multiplier: 2.5,
  usd_to_inr: 84,
};

function calcCallCost(durationSeconds, cfg) {
  const mins = durationSeconds / 60;
  const exotel = mins * cfg.exotel_cost_per_minute_inr;
  const stt = mins * cfg.sarvam_stt_cost_per_minute * cfg.usd_to_inr;
  // rough TTS estimate: avg 150 chars/response, ~3 responses/min
  const tts = mins * 3 * 150 * cfg.sarvam_tts_cost_per_char * cfg.usd_to_inr;
  const raw = exotel + stt + tts;
  return {
    raw: parseFloat(raw.toFixed(4)),
    billable: parseFloat((raw * cfg.cost_markup_multiplier).toFixed(4)),
    breakdown: {
      exotel: parseFloat(exotel.toFixed(4)),
      stt: parseFloat(stt.toFixed(4)),
      tts: parseFloat(tts.toFixed(4)),
    },
  };
}

// GET /api/costs?range=7|30|90|custom&from=ISO&to=ISO
export async function GET(req) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "30";
  const supabase = createAdminClient();

  // ── date range ──────────────────────────────────────────────────────────────
  let fromDate, toDate;
  toDate = new Date();
  if (range === "custom") {
    fromDate = new Date(searchParams.get("from") ?? toDate);
    toDate = new Date(searchParams.get("to") ?? toDate);
  } else {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(range));
  }

  // ── load settings overrides ──────────────────────────────────────────────────
  const { data: settingsRows } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["exotel_cost_per_minute_inr", "cost_markup_multiplier"]);

  const cfg = { ...DEFAULTS };
  for (const row of settingsRows ?? []) {
    if (cfg[row.key] !== undefined) cfg[row.key] = parseFloat(row.value);
  }

  // ── load call_logs ────────────────────────────────────────────────────────────
  const { data: logs, error } = await supabase
    .from("call_logs")
    .select(
      `
      id, agent_id, client_id, status, duration_seconds, started_at,
      agents ( name ),
      clients ( name ),
      campaign_id, campaigns ( id, name )
    `,
    )
    .gte("started_at", fromDate.toISOString())
    .lte("started_at", toDate.toISOString())
    .eq("status", "completed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── aggregate ─────────────────────────────────────────────────────────────────
  let totalRaw = 0;
  let totalBillable = 0;
  let totalMins = 0;
  let totalCalls = 0;

  const byClient = {};
  const byAgent = {};
  const byCampaign = {};
  const byDay = {};

  for (const log of logs ?? []) {
    const dur = log.duration_seconds ?? 0;
    const cost = calcCallCost(dur, cfg);

    totalRaw += cost.raw;
    totalBillable += cost.billable;
    totalMins += dur / 60;
    totalCalls++;

    // ── by client ─────────────────────────────────────────────────────────────
    const cid = log.client_id;
    const cname = log.clients?.name ?? "Unknown";
    if (!byClient[cid])
      byClient[cid] = {
        id: cid,
        name: cname,
        calls: 0,
        minutes: 0,
        raw: 0,
        billable: 0,
      };
    byClient[cid].calls++;
    byClient[cid].minutes += dur / 60;
    byClient[cid].raw += cost.raw;
    byClient[cid].billable += cost.billable;

    // ── by agent ──────────────────────────────────────────────────────────────
    const aid = log.agent_id;
    const aname = log.agents?.name ?? "Unknown";
    if (!byAgent[aid])
      byAgent[aid] = {
        id: aid,
        name: aname,
        calls: 0,
        minutes: 0,
        raw: 0,
        billable: 0,
      };
    byAgent[aid].calls++;
    byAgent[aid].minutes += dur / 60;
    byAgent[aid].raw += cost.raw;
    byAgent[aid].billable += cost.billable;

    // ── by campaign ───────────────────────────────────────────────────────────
    const campId = log.campaign_id ?? null;
    const campName = log.campaigns?.name ?? null;
    if (campId) {
      if (!byCampaign[campId])
        byCampaign[campId] = {
          id: campId,
          name: campName ?? "Unknown",
          calls: 0,
          minutes: 0,
          raw: 0,
          billable: 0,
        };
      byCampaign[campId].calls++;
      byCampaign[campId].minutes += dur / 60;
      byCampaign[campId].raw += cost.raw;
      byCampaign[campId].billable += cost.billable;
    }

    // ── by day ────────────────────────────────────────────────────────────────
    const day = log.started_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, calls: 0, raw: 0, billable: 0 };
    byDay[day].calls++;
    byDay[day].raw += cost.raw;
    byDay[day].billable += cost.billable;
  }

  // ── sort + round ──────────────────────────────────────────────────────────────
  const round = (v) => parseFloat(v.toFixed(2));
  const sortDesc = (arr) =>
    arr
      .sort((a, b) => b.billable - a.billable)
      .map((r) => ({
        ...r,
        raw: round(r.raw),
        billable: round(r.billable),
        minutes: round(r.minutes),
      }));

  // fill daily gaps
  const dailyMap = byDay;
  const dailySeries = [];
  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    const d = cursor.toISOString().slice(0, 10);
    dailySeries.push(dailyMap[d] ?? { date: d, calls: 0, raw: 0, billable: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json({
    summary: {
      totalCalls,
      totalMinutes: round(totalMins),
      totalRaw: round(totalRaw),
      totalBillable: round(totalBillable),
      markup: cfg.cost_markup_multiplier,
    },
    byClient: sortDesc(Object.values(byClient)),
    byAgent: sortDesc(Object.values(byAgent)),
    byCampaign: sortDesc(Object.values(byCampaign)),
    dailySeries,
  });
}
