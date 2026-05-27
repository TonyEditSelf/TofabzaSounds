import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/campaigns/[id]/contacts
// Returns all contacts for a campaign, ordered by created_at
export async function GET(req, { params }) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const { id } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("contacts")
    .select("id, phone, name, status, called_at, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// DELETE /api/campaigns/[id]/contacts
// Clears all contacts for a campaign (only when status is draft)
export async function DELETE(req, { params }) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const { id } = params;
  const supabase = createAdminClient();

  // Guard: don't allow clearing contacts on a running campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", id)
    .single();

  if (campaign?.status === "running") {
    return NextResponse.json(
      { error: "Cannot delete contacts while campaign is running" },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("campaign_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
