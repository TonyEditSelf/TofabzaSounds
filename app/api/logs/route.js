import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireOperator } from "@/lib/auth/requireOperator";

export async function GET(req) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);

  // ─── Filters ────────────────────────────────────────────────────────────────
  const callSid = searchParams.get("call_sid") || null;
  const stage = searchParams.get("stage") || null;
  const status = searchParams.get("status") || null;
  const provider = searchParams.get("provider") || null;
  const dateFrom = searchParams.get("date_from") || null;
  const dateTo = searchParams.get("date_to") || null;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  // ─── Query ───────────────────────────────────────────────────────────────────
  let query = supabase
    .from("debug_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (callSid) query = query.ilike("call_sid", `%${callSid}%`);
  if (stage) query = query.eq("stage", stage);
  if (status) query = query.eq("status", status);
  if (provider) query = query.eq("provider", provider);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

  const { data: logs, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ─── Retention summary ───────────────────────────────────────────────────────
  const { data: summary } = await supabase
    .from("debug_logs_retention_summary")
    .select("*")
    .single();

  // Next cleanup: find earliest expires_at in future
  const { data: nextCleanup } = await supabase
    .from("debug_logs")
    .select("expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(1)
    .single();

  return NextResponse.json({
    logs: logs || [],
    total: count || 0,
    page,
    limit,
    summary: {
      total_logs: summary?.total_logs || 0,
      oldest_log: summary?.oldest_log || null,
      error_count: summary?.error_count || 0,
      next_expiry: nextCleanup?.expires_at || null,
    },
  });
}
