import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requireOperator } from "@/lib/auth/requireOperator";
import { createAdminClient } from "@/lib/supabase/server";

// ── key format: tf_live_<32 random hex chars> ─────────────────────────────────
// prefix = first 8 chars after "tf_live_"  →  shown in list for identification
// hash   = SHA-256 of full key              →  stored, never the raw key

function generateKey() {
  const raw = randomBytes(24).toString("hex"); // 48 hex chars
  const full = `tf_live_${raw}`; // tf_live_xxxx…
  const prefix = full.slice(0, 15); // "tf_live_xxxxxxx"
  const hash = createHash("sha256").update(full).digest("hex");
  return { full, prefix, hash };
}

// POST /api/api-keys
// Body: { name: string }
// Returns: { id, name, key, key_prefix, created_at }  — key shown only here
export async function POST(req) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json(
      { error: "Name must be 80 chars or fewer" },
      { status: 400 },
    );
  }

  const { full, prefix, hash } = generateKey();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ name, key_hash: hash, key_prefix: prefix })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) {
    console.error("[api-keys:POST]", error);
    return NextResponse.json(
      { error: "Failed to create key" },
      { status: 500 },
    );
  }

  // Return full key ONCE — it is never stored in plaintext
  return NextResponse.json({
    id: data.id,
    name: data.name,
    key: full, // shown to user once in the UI
    key_prefix: data.key_prefix,
    created_at: data.created_at,
  });
}

// GET /api/api-keys
// Returns all keys (no hashes, no raw keys)
export async function GET(req) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// DELETE /api/api-keys?id=<uuid>
export async function DELETE(req) {
  const authError = await requireOperator(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("api_keys").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── helper exported for other routes to verify incoming keys ──────────────────
// Usage in any protected route:
//   import { verifyApiKey } from "@/app/api/api-keys/route"
//   const ok = await verifyApiKey(req)
export async function verifyApiKey(req) {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!key) return false;

  const hash = createHash("sha256").update(key).digest("hex");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("api_keys")
    .select("id")
    .eq("key_hash", hash)
    .single();

  if (!data) return false;

  // update last_used (fire-and-forget)
  supabase
    .from("api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return true;
}
