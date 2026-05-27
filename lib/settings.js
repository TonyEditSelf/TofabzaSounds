import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";

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

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Returns all settings as a plain key→value object with sensitive values decrypted.
 * Falls back to process.env for any key not found in DB (backward compat).
 */
export async function getSettings() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value, is_sensitive");

  if (error) {
    console.error(
      "[settings] failed to load from DB, falling back to env:",
      error.message,
    );
    return buildEnvFallback();
  }

  const settings = buildEnvFallback();
  for (const row of data ?? []) {
    try {
      settings[row.key] = row.is_sensitive ? decrypt(row.value) : row.value;
    } catch (e) {
      console.error(`[settings] decrypt failed for key ${row.key}:`, e.message);
    }
  }

  _cache = settings;
  _cacheTs = now;
  return settings;
}

/** Invalidate in-process cache (call after POST /api/settings) */
export function invalidateSettingsCache() {
  _cache = null;
  _cacheTs = 0;
}

function buildEnvFallback() {
  return {
    // Sarvam
    sarvam_api_key: process.env.SARVAM_API_KEY ?? "",
    sarvam_default_language: process.env.SARVAM_DEFAULT_LANGUAGE ?? "en-IN",
    sarvam_default_voice: process.env.SARVAM_DEFAULT_VOICE ?? "meera",
    // Gemini
    gemini_api_key: process.env.GEMINI_API_KEY ?? "",
    gemini_chat_model: process.env.GEMINI_CHAT_MODEL ?? "gemini-1.5-flash",
    gemini_embedding_model:
      process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",
    // Exotel
    exotel_api_key: process.env.EXOTEL_API_KEY ?? "",
    exotel_api_token: process.env.EXOTEL_API_TOKEN ?? "",
    exotel_account_sid: process.env.EXOTEL_ACCOUNT_SID ?? "",
    exotel_use_india_host: process.env.EXOTEL_USE_INDIA_HOST ?? "true",
    // Upstash
    upstash_redis_url: process.env.UPSTASH_REDIS_REST_URL ?? "",
    upstash_redis_token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    // Resend
    resend_api_key: process.env.RESEND_API_KEY ?? "",
    resend_from_address: process.env.RESEND_FROM_ADDRESS ?? "",
    // AI defaults
    default_system_prompt:
      process.env.DEFAULT_SYSTEM_PROMPT ??
      "You are a helpful voice assistant. Be concise and friendly.",
    default_max_call_duration: process.env.DEFAULT_MAX_CALL_DURATION ?? "300",
    default_silence_threshold: process.env.DEFAULT_SILENCE_THRESHOLD ?? "2.0",
    cost_markup_multiplier: process.env.COST_MARKUP_MULTIPLIER ?? "2.5",
    exotel_cost_per_minute_inr:
      process.env.EXOTEL_COST_PER_MINUTE_INR ?? "1.00",
    rag_top_k: process.env.RAG_TOP_K ?? "5",
    // App
    agency_name: process.env.AGENCY_NAME ?? "Tofabza Sounds",
    support_email: process.env.SUPPORT_EMAIL ?? "",
    widget_base_url: process.env.NEXT_PUBLIC_WIDGET_BASE_URL ?? "",
  };
}
