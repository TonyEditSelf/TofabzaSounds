const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Retention windows (days) ─────────────────────────────────────────────────

const RETENTION = {
  // Pipeline stages
  outbound_call_initiated: 7,
  websocket_connected: 7,
  websocket_disconnected: 7,
  stt_result: 7,
  llm_response: 7,
  tts_output: 7,
  // Webhook payloads
  inbound_webhook: 30,
  status_callback: 30,
  // Errors always 90d regardless of stage
  _error: 90,
  // Default fallback
  _default: 7,
};

function getExpiresAt(stage, status) {
  if (status === "error") {
    return daysFromNow(RETENTION._error);
  }
  const days = RETENTION[stage] ?? RETENTION._default;
  return daysFromNow(days);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ─── Core log function ────────────────────────────────────────────────────────
// Fire-and-forget. Never throws. Never blocks the call pipeline.

function log(
  stage,
  {
    callSid = null,
    status = "success",
    payload = null,
    errorMessage = null,
    provider = null,
    agentId = null,
    error = null, // Error object — stack appended to errorMessage
  } = {},
) {
  // Normalize error object
  let finalErrorMessage = errorMessage;
  if (error instanceof Error) {
    finalErrorMessage = [errorMessage, error.message, error.stack]
      .filter(Boolean)
      .join("\n");
    status = "error";
  }

  const record = {
    call_sid: callSid,
    stage,
    status,
    payload: payload ? sanitizePayload(payload) : null,
    error_message: finalErrorMessage || null,
    provider: provider || null,
    agent_id: agentId || null,
    expires_at: getExpiresAt(stage, status),
  };

  // Fire-and-forget — intentionally no await
  supabase
    .from("debug_logs")
    .insert(record)
    .then(({ error: dbErr }) => {
      if (dbErr && process.env.NODE_ENV !== "production") {
        console.error("[logger] insert failed:", dbErr.message);
      }
    })
    .catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[logger] unexpected error:", err.message);
      }
    });
}

// ─── Sanitize payload ─────────────────────────────────────────────────────────
// Strip sensitive fields before storing in DB.

const REDACT_KEYS = new Set([
  "password",
  "token",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "auth_token",
  "access_token",
  "refresh_token",
  "x-internal-secret",
]);

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  try {
    return JSON.parse(
      JSON.stringify(payload, (key, value) => {
        if (REDACT_KEYS.has(key.toLowerCase())) return "[REDACTED]";
        return value;
      }),
    );
  } catch (_) {
    return { _error: "payload serialization failed" };
  }
}

// ─── Named stage helpers ──────────────────────────────────────────────────────

const logger = {
  // Raw log — for custom stages
  log,

  inboundWebhook({ callSid, payload, provider, agentId }) {
    log("inbound_webhook", { callSid, payload, provider, agentId });
  },

  outboundCallInitiated({ callSid, payload, provider, agentId }) {
    log("outbound_call_initiated", { callSid, payload, provider, agentId });
  },

  outboundCallFailed({ payload, provider, agentId, error }) {
    log("outbound_call_initiated", {
      status: "error",
      payload,
      provider,
      agentId,
      error,
    });
  },

  websocketConnected({ callSid, provider, agentId, payload }) {
    log("websocket_connected", { callSid, provider, agentId, payload });
  },

  websocketDisconnected({ callSid, provider, agentId, payload }) {
    log("websocket_disconnected", { callSid, provider, agentId, payload });
  },

  sttResult({ callSid, text, latencyMs, provider, agentId }) {
    log("stt_result", {
      callSid,
      provider,
      agentId,
      payload: { text, latency_ms: latencyMs },
    });
  },

  sttError({ callSid, provider, agentId, error }) {
    log("stt_result", { callSid, provider, agentId, status: "error", error });
  },

  llmResponse({ callSid, text, latencyMs, provider, agentId }) {
    log("llm_response", {
      callSid,
      provider,
      agentId,
      payload: { text, latency_ms: latencyMs },
    });
  },

  llmError({ callSid, provider, agentId, error }) {
    log("llm_response", { callSid, provider, agentId, status: "error", error });
  },

  ttsOutput({ callSid, audioBytes, latencyMs, provider, agentId }) {
    log("tts_output", {
      callSid,
      provider,
      agentId,
      payload: { audio_bytes: audioBytes, latency_ms: latencyMs },
    });
  },

  ttsError({ callSid, provider, agentId, error }) {
    log("tts_output", { callSid, provider, agentId, status: "error", error });
  },

  statusCallback({ callSid, payload, provider, agentId }) {
    log("status_callback", { callSid, payload, provider, agentId });
  },

  statusCallbackError({ callSid, provider, agentId, error }) {
    log("status_callback", {
      callSid,
      provider,
      agentId,
      status: "error",
      error,
    });
  },

  error({ callSid, stage, provider, agentId, error, payload }) {
    log(stage || "error", {
      callSid,
      provider,
      agentId,
      status: "error",
      error,
      payload,
    });
  },
};

module.exports = logger;
