/**
 * app/api/voices/sync/route.js
 *
 * GET  /api/voices/sync  — fetch all voices from Sarvam, upsert into DB
 *
 * Called manually from Settings page or triggered by pg_cron nightly.
 * Operator-only — requireOperator() guard.
 */

import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";
import { BULBUL_V3_SPEAKERS } from "@/lib/sarvam/voices";

export const maxDuration = 30;

export async function GET() {
  try {
    await requireOperator();
  } catch (res) {
    return res;
  }

  try {
    // 1. Fetch voices from Sarvam
    const rows = BULBUL_V3_SPEAKERS.map((v) => ({
      voice_id: v.id,
      name: v.name,
      gender: v.gender,
      language: "multi",
      provider: "sarvam",
    }));

    // 3. Upsert — conflict on voice_id, never overwrite is_favourite
    const supabase = await createAdminClient();
    const { error, count } = await supabase.from("voices").upsert(rows, {
      onConflict: "voice_id",
      ignoreDuplicates: false,
      count: "exact",
    });

    if (error) throw error;

    return Response.json({
      ok: true,
      synced: count ?? rows.length,
      message: `${count ?? rows.length} voices synced.`,
    });
  } catch (err) {
    console.error("[voices/sync]", err?.message);
    return Response.json(
      {
        error: {
          code: "SYNC_FAILED",
          message: err?.message ?? "Voice sync failed.",
        },
      },
      { status: 500 },
    );
  }
}
