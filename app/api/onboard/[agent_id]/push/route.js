import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// ── POST /api/onboard/[agent_id]/push ────────────────────
// Operator-only. Substitutes form_data vars into agent prompt template,
// updates agent config, queues KB file processing, marks submission pushed.
export async function POST(req, { params }) {
  const { agent_id } = await params;

  // Verify operator session
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // Parse body — expects { submission_id }
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { submission_id } = body;
  if (!submission_id) {
    return NextResponse.json(
      { error: "submission_id required." },
      { status: 400 },
    );
  }

  // Fetch submission
  const { data: sub, error: subErr } = await admin
    .from("onboarding_submissions")
    .select("*")
    .eq("id", submission_id)
    .eq("agent_id", agent_id)
    .single();

  if (subErr || !sub) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 },
    );
  }
  if (sub.status === "pushed") {
    return NextResponse.json({ error: "Already pushed." }, { status: 409 });
  }

  // Fetch agent + template
  const { data: agent, error: agentErr } = await admin
    .from("agents")
    .select("id, config, client_id")
    .eq("id", agent_id)
    .single();

  if (agentErr || !agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  let finalPrompt = agent.config?.prompt || "";
  let finalGreeting = agent.config?.greeting || "";

  // If template_id exists, load raw template and substitute variables
  // Look up template by facility_type slug
  const facilityType = agent.config?.facility_type;
  if (facilityType) {
    const { data: tmpl } = await admin
      .from("prompt_templates")
      .select("system_prompt, greeting, variables")
      .eq("slug", facilityType)
      .single();

    if (tmpl) {
      const vars = sub.form_data || {};
      finalPrompt = tmpl.system_prompt.replace(
        /\{\{(\w+)\}\}/g,
        (_, key) => vars[key] || `[${key}]`,
      );
      finalGreeting = tmpl.greeting
        ? tmpl.greeting.replace(
            /\{\{(\w+)\}\}/g,
            (_, key) => vars[key] || `[${key}]`,
          )
        : finalGreeting;
    }
  } else {
    // No facility type — append form data as context block
    const ctx = Object.entries(sub.form_data || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    if (ctx) finalPrompt = `${finalPrompt}\n\n--- Clinic Context ---\n${ctx}`;
  }

  // Apply fallback_number from form if present and not already set
  const updatedConfig = {
    ...agent.config,
    prompt: finalPrompt,
    greeting: finalGreeting,
  };
  if (sub.form_data?.fallback_number && !agent.config?.fallback_number) {
    updatedConfig.fallback_number = sub.form_data.fallback_number;
  }

  // Update agent config
  const { error: updateErr } = await admin
    .from("agents")
    .update({ config: updatedConfig })
    .eq("id", agent_id);

  if (updateErr) {
    console.error("Agent update error:", updateErr);
    return NextResponse.json(
      { error: "Failed to update agent config." },
      { status: 500 },
    );
  }

  // Process uploaded files → create KB and chunks
  if (sub.files?.length > 0) {
    // Ensure a KB exists for this agent
    let kbId;
    const { data: existingKb } = await admin
      .from("knowledge_bases")
      .select("id")
      .eq("owner_id", agent_id)
      .eq("owner_type", "agent")
      .single();

    if (existingKb) {
      kbId = existingKb.id;
    } else {
      const { data: newKb, error: kbErr } = await admin
        .from("knowledge_bases")
        .insert({
          client_id: agent.client_id,
          owner_type: "agent",
          owner_id: agent_id,
          name: "Onboarding KB",
        })
        .select("id")
        .single();

      if (kbErr) {
        console.error("KB create error:", kbErr);
        // Non-fatal — log and continue
      } else {
        kbId = newKb.id;
      }
    }

    // Kick off async file processing for each uploaded file
    // We call the existing /api/kb/upload route internally via fetch
    // (files are in Supabase Storage — pass storage paths)
    if (kbId) {
      for (const f of sub.files) {
        // Generate a short-lived signed URL for the internal fetch
        const { data: signed } = await admin.storage
          .from("onboarding-files")
          .createSignedUrl(f.path, 300); // 5 min expiry

        if (signed?.signedUrl) {
          // Fire and forget — KB processing is async
          fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/kb/process-url`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
            },
            body: JSON.stringify({
              kb_id: kbId,
              file_url: signed.signedUrl,
              file_name: f.name,
              file_type: f.type,
            }),
          }).catch((err) => console.error("KB process-url error:", err));
        }
      }
    }
  }

  // Mark submission as pushed
  await admin
    .from("onboarding_submissions")
    .update({
      status: "pushed",
      pushed_at: new Date().toISOString(),
      pushed_by: user.email,
    })
    .eq("id", submission_id);

  return NextResponse.json({ success: true });
}
