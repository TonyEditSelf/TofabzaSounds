/**
 * app/api/widget/[widget_id]/config/route.js
 *
 * Public endpoint — returns safe widget config for embed script.
 * No auth required — only returns non-sensitive fields.
 */

import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req, { params }) {
  const { widget_id } = await params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("widgets")
    .select("name, status, config")
    .eq("id", widget_id)
    .single();

  if (error || !data) {
    return Response.json({ error: "Widget not found." }, { status: 404 });
  }

  if (data.status !== "active") {
    return Response.json({ error: "Widget inactive." }, { status: 403 });
  }

  // Only return safe public fields — never return system_prompt
  return Response.json({
    name: data.name,
    greeting: data.config?.greeting ?? "",
    style: data.config?.style ?? "bubble",
    accentColor: data.config?.accentColor ?? "#F97316",
    language: data.config?.language ?? "ml-IN",
    voice_id: data.config?.voice_id ?? "anand",
    pace: data.config?.pace ?? 1.0,
  });
}
