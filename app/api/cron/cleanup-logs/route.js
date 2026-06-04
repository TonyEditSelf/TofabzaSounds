import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Runs daily via Vercel cron.
// Add to vercel.json:
// {
//   "crons": [{ "path": "/api/cron/cleanup-logs", "schedule": "0 2 * * *" }]
// }

export async function GET(req) {
  // Verify cron secret — Vercel sets Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  try {
    const { error, count } = await supabase
      .from("debug_logs")
      .delete({ count: "exact" })
      .lt("expires_at", now);

    if (error) {
      console.error("[cleanup-logs] delete failed:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    console.log(`[cleanup-logs] deleted ${count ?? 0} expired log rows`);

    return NextResponse.json({
      ok: true,
      deleted: count ?? 0,
      ran_at: now,
    });
  } catch (err) {
    console.error("[cleanup-logs] unexpected error:", err.message);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}
