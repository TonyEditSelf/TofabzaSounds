/**
 * /lib/costs/pricing.js
 *
 * API cost constants — ALL VALUES IN INR.
 * Confirmed from official documentation (May 2026).
 *
 * Sarvam:  https://docs.sarvam.ai (pricing section)
 * OpenAI:  https://platform.openai.com/pricing
 * Exotel:  Your Exotel plan document — EXOTEL_COSTS still needs filling.
 */

// =============================================================
// SARVAM AI — CONFIRMED ✅  docs.sarvam.ai May 2026
// =============================================================

/** STT — Saaras v3.  Billing: per second, rounded up. */
export const SARVAM_STT = {
  PER_HOUR:   30,       // ₹
  PER_MINUTE: 0.5,      // ₹
  PER_SECOND: 0.00833,  // ₹ — use this for per-call cost
};

/** TTS — Bulbul v3.  Billing: per character of input text. */
export const SARVAM_TTS = {
  PER_10K_CHARS: 30,    // ₹
  PER_CHARACTER: 0.003, // ₹ — use this for per-call cost
};

/** Free credits on every new Sarvam account, never expire. */
export const SARVAM_FREE_CREDITS_INR = 100;

// =============================================================
// OPENAI — ESTIMATED  (verify at platform.openai.com/pricing)
// USD/INR rate used: ₹84/USD (May 2026)
// Input:  $0.15/1M  → ₹12.60/1M
// Output: $0.60/1M  → ₹50.40/1M
// =============================================================

export const OPENAI_COSTS = {
  GPT4O_MINI_INPUT_PER_1M_TOKENS:   12.60,
  GPT4O_MINI_OUTPUT_PER_1M_TOKENS:  50.40,
  /** Blended estimate: 40% input + 60% output per turn */
  GPT4O_MINI_BLENDED_PER_1K_TOKENS: 0.035,
};

// =============================================================
// EXOTEL — TODO: fill from your Exotel plan document
// Typical: ₹0.50–₹1.50/min depending on plan
// =============================================================

export const EXOTEL_COSTS = {
  PER_MINUTE_INBOUND:  1, 
  PER_MINUTE_OUTBOUND: 1,
};

// =============================================================
// BUSINESS LOGIC
// =============================================================

export const DEFAULT_MARKUP                = 2.5;
export const DEFAULT_MAX_COST_PER_CALL_INR = 50;
export const COST_ALERT_THRESHOLD_INR      = 5000;

/**
 * Estimates total API cost for one call in INR.
 *
 * Example 2-min call:
 *   STT:    120s × ₹0.00833   = ₹1.00
 *   TTS:    300ch × ₹0.003    = ₹0.90
 *   LLM:    2000t × ₹0.035/1K = ₹0.07
 *   Exotel: 2min  × ₹1.00     = ₹2.00 (once filled)
 *   Total ≈ ₹4 → invoice at 2.5× = ₹10
 *
 * @param {object} p
 * @param {number} p.durationSeconds
 * @param {number} p.ttsCharacters
 * @param {number} p.totalTokens
 * @param {'inbound'|'outbound'} [p.callType]
 * @returns {number} INR, 4 decimal places
 */
export function estimateCallCost({ durationSeconds = 0, ttsCharacters = 0, totalTokens = 0, callType = 'inbound' }) {
  const stt    = durationSeconds * SARVAM_STT.PER_SECOND;
  const tts    = ttsCharacters * SARVAM_TTS.PER_CHARACTER;
  const llm    = (totalTokens / 1000) * OPENAI_COSTS.GPT4O_MINI_BLENDED_PER_1K_TOKENS;
  const exotel = (durationSeconds / 60) * (callType === 'outbound' ? EXOTEL_COSTS.PER_MINUTE_OUTBOUND : EXOTEL_COSTS.PER_MINUTE_INBOUND);
  return Math.round((stt + tts + llm + exotel) * 10000) / 10000;
}

/**
 * Sarvam rate limits by plan — used by queue management and circuit breaker.
 */
export const SARVAM_RATE_LIMITS = {
  STARTER: { STT_REST_RPM: 60, STT_WS_CONCURRENT: 20, TTS_REST_RPM: 30, TTS_WS_CONCURRENT: 30 },
  PRO:     { STT_REST_RPM: 100, STT_WS_CONCURRENT: 100, TTS_REST_RPM: 200, TTS_WS_CONCURRENT: 200 },
};
