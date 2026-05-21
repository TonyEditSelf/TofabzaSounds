/**
 * app/api/kb/[kb_id]/route.js
 *
 * DELETE /api/kb/[kb_id] — delete a knowledge base (CASCADE deletes chunks)
 * GET    /api/kb/[kb_id] — not needed; list via GET /api/kb?owner_id=
 */

import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";

export async function DELETE(req, { params }) {
  try {
    await requireOperator();
  } catch (res) {
    return res;
  }

  const { kb_id } = await params;

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("knowledge_bases")
    .delete()
    .eq("id", kb_id);

  if (error) {
    return Response.json(
      { error: { code: "DELETE_FAILED", message: error.message } },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
