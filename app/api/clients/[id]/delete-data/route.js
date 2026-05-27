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

  // 1. Get all widget IDs for this client (needed to delete widget_tokens)
  const { data: widgets } = await admin
    .from("widgets")
    .select("id")
    .eq("client_id", clientId);

  const widgetIds = (widgets ?? []).map((w) => w.id);

  // 2. Delete in order — widget_tokens first (FK to widgets), then the rest
  const ops = [];

  if (widgetIds.length > 0) {
    ops.push(admin.from("widget_tokens").delete().in("widget_id", widgetIds));
  }

  ops.push(
    admin.from("widget_sessions").delete().eq("client_id", clientId),
    admin.from("call_logs").delete().eq("client_id", clientId),
  );

  const results = await Promise.all(ops);
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
