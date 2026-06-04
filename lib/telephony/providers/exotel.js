const { CALL_STATUS, PROVIDERS } = require("../types");

const {
  EXOTEL_ACCOUNT_SID,
  EXOTEL_API_KEY,
  EXOTEL_API_TOKEN,
  EXOTEL_SUBDOMAIN,
  EXOTEL_EXOPHONE,
  RAILWAY_WS_URL,
  NEXTJS_URL,
} = process.env;

// ─── Status map ───────────────────────────────────────────────────────────────

const EXOTEL_STATUS_MAP = {
  initiated: CALL_STATUS.INITIATED,
  ringing: CALL_STATUS.RINGING,
  "in-progress": CALL_STATUS.IN_PROGRESS,
  completed: CALL_STATUS.COMPLETED,
  failed: CALL_STATUS.FAILED,
  busy: CALL_STATUS.BUSY,
  "no-answer": CALL_STATUS.NO_ANSWER,
  canceled: CALL_STATUS.FAILED,
};

function normalizeStatus(raw) {
  const lower = (raw || "").toLowerCase();
  return EXOTEL_STATUS_MAP[lower] || CALL_STATUS.FAILED;
}

// ─── Outbound call ────────────────────────────────────────────────────────────

async function initiateCall(to, from, agentId, callbackUrl) {
  const fromNumber = from || EXOTEL_EXOPHONE;
  const url = `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}@${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_ACCOUNT_SID}/Calls/connect`;

  const body = new URLSearchParams({
    From: to, // Exotel: From = customer number
    To: fromNumber, // Exotel: To   = exophone
    CallerId: fromNumber,
    StatusCallback: callbackUrl,
    CustomField: agentId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch (_) {}

  if (!res.ok) {
    throw new Error(`Exotel initiateCall failed: ${res.status} ${text}`);
  }

  const callData = json.Call || {};
  return {
    callSid: callData.Sid || callData.CallSid || "",
    status: normalizeStatus(callData.Status),
    provider: PROVIDERS.EXOTEL,
    raw: json,
  };
}

// ─── Inbound webhook ──────────────────────────────────────────────────────────

async function parseInboundWebhook(req, params) {
  const agentId = params?.agent_id || params?.agentId || "";

  let body = {};
  try {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const callSid = body.CallSid || body.call_sid || "";
  const from = body.From || body.CallFrom || "";
  const to = body.To || body.CallTo || "";

  const call = {
    callSid,
    from,
    to,
    agentId,
    direction: "inbound",
    status: normalizeStatus(body.Status || body.CallStatus),
    provider: PROVIDERS.EXOTEL,
    raw: body,
  };

  // Exotel AgentStream response — returns WSS config as JSON
  const wsConfig = getWebSocketConfig(agentId);
  const httpResponse = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "agent_stream",
      params: {
        url: wsConfig.url,
        audio_format: wsConfig.audioFormat,
      },
    }),
  };

  return { call, httpResponse };
}

// ─── Status callback ──────────────────────────────────────────────────────────

async function parseStatusCallback(req) {
  let body = {};
  try {
    const text = await req.text();
    // Exotel sends JSON for status callbacks
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (_) {}

  const callData = body.Call || body;

  const duration = callData.Duration || callData.ConversationDuration || null;
  const hangupBy = resolveHangupBy(callData.HangupBy || callData.hangup_by);

  return {
    callSid: callData.Sid || callData.CallSid || callData.call_sid || "",
    status: normalizeStatus(callData.Status || callData.CallStatus),
    duration: duration !== null ? parseInt(duration, 10) : null,
    hangupBy,
    provider: PROVIDERS.EXOTEL,
    raw: body,
  };
}

function resolveHangupBy(raw) {
  if (!raw) return null;
  const val = raw.toLowerCase();
  if (val.includes("caller") || val.includes("customer")) return "caller";
  if (val.includes("agent") || val.includes("called")) return "agent";
  if (val.includes("system") || val.includes("error")) return "system";
  return null;
}

// ─── WebSocket config ─────────────────────────────────────────────────────────

function getWebSocketConfig(agentId) {
  const base = (RAILWAY_WS_URL || "").replace(/\/$/, "");
  return {
    url: `${base}/ws/call?agent_id=${agentId}`,
    headers: {},
    audioFormat: "pcm_16000",
    providerParams: {
      account_sid: EXOTEL_ACCOUNT_SID,
    },
  };
}

// ─── Audio normalization ──────────────────────────────────────────────────────
// Exotel AgentStream delivers 16kHz signed 16-bit little-endian PCM.
// No conversion needed; pass through as-is.

function formatAudioChunk(chunk, meta = {}) {
  // If a future Exotel config sends 8kHz mulaw, upsample here.
  // For now: Exotel AgentStream = 16kHz PCM → return unchanged.
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  initiateCall,
  parseInboundWebhook,
  parseStatusCallback,
  getWebSocketConfig,
  formatAudioChunk,
};
