import { createAdminClient } from "@/lib/supabase/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { NextResponse } from "next/server";

export async function DELETE(req, { params }) {
  try {
    await requireOperator();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ error: "Missing client ID" }, { status: 400 });
  }

  const admin = createAdminClient();
  const results = await Promise.all([
    admin.from("call_logs").delete().eq("client_id", clientId),
  ]);
  const failed = results.filter((r) => r.error);

  if (failed.length > 0) {
    console.error(
      "[delete-data] Errors:",
      failed.map((r) => r.error.message),
    );
    return NextResponse.json(
      {
        error: "Partial delete failure",
        details: failed.map((r) => r.error.message),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
