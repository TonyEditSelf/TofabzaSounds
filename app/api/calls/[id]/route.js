// app/api/calls/[id]/route.js

import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req, { params }) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const { id } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("call_logs")
    .select(
      `
      *,
      agents   ( id, name ),
      clients  ( id, name ),
      campaigns( id, name )
    `,
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
