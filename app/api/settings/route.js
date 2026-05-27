import { createAdminClient } from "@/lib/supabase/server";
import { requireOperator } from "@/lib/auth/requireOperator";
import { NextResponse } from "next/server";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY; // 32-byte hex string
const ALGORITHM = "aes-256-gcm";

// Keys that should be encrypted at rest
const SENSITIVE_KEYS = [
  "sarvam_api_key",
  "gemini_api_key",
  "exotel_api_key",
  "exotel_api_token",
  "upstash_redis_url",
  "upstash_redis_token",
  "resend_api_key",
];

function encrypt(plaintext) {
  if (!ENCRYPTION_KEY) throw new Error("SETTINGS_ENCRYPTION_KEY not set");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext) {
  if (!ENCRYPTION_KEY) throw new Error("SETTINGS_ENCRYPTION_KEY not set");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

function maskValue(value) {
  if (!value || value.length < 8) return "••••••••";
  return value.slice(0, 4) + "••••••••" + value.slice(-4);
}

export async function GET(request) {
  const authError = await requireOperator(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("key, value, is_sensitive");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const settings = {};
  for (const row of data ?? []) {
    if (row.is_sensitive) {
      try {
        const decrypted = decrypt(row.value);
        settings[row.key] = maskValue(decrypted);
      } catch {
        settings[row.key] = "••••••••";
      }
    } else {
      settings[row.key] = row.value;
    }
  }

  return NextResponse.json({ settings });
}

export async function POST(request) {
  const authError = await requireOperator(request);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const upserts = [];

  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    // Skip masked values (user didn't change them)
    if (typeof value === "string" && value.includes("••••")) continue;

    const isSensitive = SENSITIVE_KEYS.includes(key);
    const storedValue = isSensitive ? encrypt(String(value)) : String(value);

    upserts.push({
      key,
      value: storedValue,
      is_sensitive: isSensitive,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { error } = await supabase
    .from("settings")
    .upsert(upserts, { onConflict: "key" });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: upserts.length });
}
