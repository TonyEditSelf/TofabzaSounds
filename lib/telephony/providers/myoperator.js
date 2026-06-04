const { CALL_STATUS, PROVIDERS } = require("../types");

const {
  MYOPERATOR_API_KEY,
  MYOPERATOR_COMPANY_ID,
  MYOPERATOR_PHONE_NUMBER,
  RAILWAY_WS_URL,
  NEXTJS_URL,
} = process.env;

// ─── Status map ───────────────────────────────────────────────────────────────

const MYOPERATOR_STATUS_MAP = {
  initiated: CALL_STATUS.INITIATED,
  ringing: CALL_STATUS.RINGING,
  answered: CALL_STATUS.IN_PROGRESS,
  "in-progress": CALL_STATUS.IN_PROGRESS,
  completed: CALL_STATUS.COMPLETED,
  failed: CALL_STATUS.FAILED,
  busy: CALL_STATUS.BUSY,
  noanswer: CALL_STATUS.NO_ANSWER,
  "no-answer": CALL_STATUS.NO_ANSWER,
  missed: CALL_STATUS.NO_ANSWER,
  canceled: CALL_STATUS.FAILED,
};

function normalizeStatus(raw) {
  const lower = (raw || "").toLowerCase();
  return MYOPERATOR_STATUS_MAP[lower] || CALL_STATUS.FAILED;
}

// ─── Outbound call ────────────────────────────────────────────────────────────
// MyOperator Click-to-Call API (v2).
// Docs: https://myoperator.com/api-docs/click-to-call

async function initiateCall(to, from, agentId, callbackUrl) {
  const fromNumber = from || MYOPERATOR_PHONE_NUMBER;

  // TODO: Confirm exact MyOperator Click-to-Call endpoint and payload shape
  // when API credentials are available. Stub follows known v2 pattern.
  const url = "https://api.myoperator.co/v2/calls/initiate";

  const payload = {
    api_key: MYOPERATOR_API_KEY,
    company_id: MYOPERATOR_COMPANY_ID,
    caller_number: to,
    agent_number: fromNumber,
    custom_data: agentId,
    callback_url: callbackUrl,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      `MyOperator initiateCall failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }

  return {
    callSid: json.call_id || json.callId || json.sid || "",
    status: normalizeStatus(json.status),
    provider: PROVIDERS.MYOPERATOR,
    raw: json,
  };
}

// ─── Inbound webhook ──────────────────────────────────────────────────────────
// MyOperator posts JSON or form-encoded data to the webhook URL.
// Response format: JSON with websocket routing details.
// TODO: Confirm MyOperator AgentStream / media stream protocol docs.

async function parseInboundWebhook(req, params) {
  const agentId = params?.agent_id || params?.agentId || "";

  let body = {};
  try {
    const text = await req.text();
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (_) {}

  const call = {
    callSid: body.call_id || body.CallSid || body.callId || "",
    from: body.caller || body.From || body.from || "",
    to: body.called || body.To || body.to || "",
    agentId,
    direction: "inbound",
    status: normalizeStatus(body.status || body.call_status || body.CallStatus),
    provider: PROVIDERS.MYOPERATOR,
    raw: body,
  };

  const wsConfig = getWebSocketConfig(agentId);

  // TODO: Replace with confirmed MyOperator media-stream response shape.
  const httpResponse = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "stream",
      stream_url: wsConfig.url,
      audio_format: wsConfig.audioFormat,
    }),
  };

  return { call, httpResponse };
}

// ─── Status callback ──────────────────────────────────────────────────────────

async function parseStatusCallback(req) {
  let body = {};
  try {
    const text = await req.text();
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (_) {}

  const duration = body.duration || body.call_duration || null;

  return {
    callSid: body.call_id || body.callId || body.CallSid || "",
    status: normalizeStatus(body.status || body.call_status),
    duration: duration !== null ? parseInt(duration, 10) : null,
    hangupBy: resolveHangupBy(body.hangup_by || body.hangup_cause),
    provider: PROVIDERS.MYOPERATOR,
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
// TODO: Confirm whether MyOperator uses AgentStream-style WSS or
// a different media stream protocol. Update url pattern accordingly.

function getWebSocketConfig(agentId) {
  const base = (RAILWAY_WS_URL || "").replace(/\/$/, "");
  return {
    url: `${base}/ws/call?agent_id=${agentId}&provider=myoperator`,
    headers: {},
    audioFormat: "pcm_8000", // TODO: confirm MyOperator audio format
    providerParams: {
      company_id: MYOPERATOR_COMPANY_ID,
    },
  };
}

// ─── Audio normalization ──────────────────────────────────────────────────────
// TODO: Confirm MyOperator audio encoding (assumed 8kHz PCM).
// Upsample 8kHz signed 16-bit PCM → 16kHz signed 16-bit PCM.

function formatAudioChunk(chunk, meta = {}) {
  const raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

  // If MyOperator sends 8kHz PCM (not mulaw), upsample directly.
  // Update this if encoding differs.
  const sampleRate = meta.sampleRate || 8000;

  if (sampleRate === 16000) return raw; // already correct

  if (sampleRate === 8000) {
    return upsample8kTo16k(raw);
  }

  // Unknown rate — return as-is and let STT handle the mismatch
  return raw;
}

function upsample8kTo16k(pcm8k) {
  const sampleCount = Math.floor(pcm8k.length / 2);
  const out = Buffer.alloc(sampleCount * 4);
  for (let i = 0; i < sampleCount; i++) {
    const s0 = pcm8k.readInt16LE(i * 2);
    const s1 = i + 1 < sampleCount ? pcm8k.readInt16LE((i + 1) * 2) : s0;
    const interp = Math.round((s0 + s1) / 2);
    out.writeInt16LE(s0, i * 4);
    out.writeInt16LE(interp, i * 4 + 2);
  }
  return out;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  initiateCall,
  parseInboundWebhook,
  parseStatusCallback,
  getWebSocketConfig,
  formatAudioChunk,
};
