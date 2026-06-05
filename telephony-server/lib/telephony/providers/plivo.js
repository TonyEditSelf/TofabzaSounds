const { CALL_STATUS, PROVIDERS } = require("../types");

const {
  PLIVO_AUTH_ID,
  PLIVO_AUTH_TOKEN,
  PLIVO_PHONE_NUMBER,
  RAILWAY_WS_URL,
  NEXTJS_URL,
} = process.env;

// ─── Status map ───────────────────────────────────────────────────────────────

const PLIVO_STATUS_MAP = {
  queued: CALL_STATUS.INITIATED,
  initiated: CALL_STATUS.INITIATED,
  ringing: CALL_STATUS.RINGING,
  "in-progress": CALL_STATUS.IN_PROGRESS,
  answered: CALL_STATUS.IN_PROGRESS,
  completed: CALL_STATUS.COMPLETED,
  failed: CALL_STATUS.FAILED,
  busy: CALL_STATUS.BUSY,
  "no-answer": CALL_STATUS.NO_ANSWER,
  timeout: CALL_STATUS.NO_ANSWER,
  canceled: CALL_STATUS.FAILED,
  rejected: CALL_STATUS.FAILED,
};

function normalizeStatus(raw) {
  const lower = (raw || "").toLowerCase();
  return PLIVO_STATUS_MAP[lower] || CALL_STATUS.FAILED;
}

// ─── Outbound call ────────────────────────────────────────────────────────────
// Plivo REST API v1: POST /v1/Account/{auth_id}/Call/

async function initiateCall(to, from, agentId, callbackUrl) {
  const fromNumber = from || PLIVO_PHONE_NUMBER;
  const url = `https://api.plivo.com/v1/Account/${PLIVO_AUTH_ID}/Call/`;

  // Plivo answer_url must return XML; point to inbound webhook route
  const answerUrl = `${NEXTJS_URL}/api/webhooks/plivo/${agentId}`;

  const payload = {
    to: to,
    from: fromNumber,
    answer_url: answerUrl,
    answer_method: "POST",
    hangup_url: callbackUrl,
    hangup_method: "POST",
    machine_detection: "false",
  };

  const credentials = Buffer.from(
    `${PLIVO_AUTH_ID}:${PLIVO_AUTH_TOKEN}`,
  ).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      `Plivo initiateCall failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }

  return {
    callSid: json.request_uuid || json.call_uuid || "",
    status: normalizeStatus(
      json.message?.toLowerCase().includes("queued") ? "queued" : "initiated",
    ),
    provider: PROVIDERS.PLIVO,
    raw: json,
  };
}

// ─── Inbound webhook ──────────────────────────────────────────────────────────
// Plivo posts form-encoded data to answer_url; expects XML back.
// Use <Stream> element to connect to Railway WebSocket.

async function parseInboundWebhook(req, params) {
  const agentId = params?.agent_id || params?.agentId || "";

  let body = {};
  try {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const call = {
    callSid: body.CallUUID || body.request_uuid || "",
    from: body.From || body.caller_id || "",
    to: body.To || body.called_id || "",
    agentId,
    direction: (body.Direction || "inbound").toLowerCase(),
    status: normalizeStatus(body.CallStatus),
    provider: PROVIDERS.PLIVO,
    raw: body,
  };

  const wsConfig = getWebSocketConfig(agentId);

  // Plivo XML response: <Stream> element for media streaming
  // Plivo Stream doc: https://www.plivo.com/docs/voice/xml/stream-element/
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream keepCallAlive="true" bidirectional="true" audioTrack="inbound">
    ${wsConfig.url}
  </Stream>
</Response>`;

  const httpResponse = {
    status: 200,
    headers: { "Content-Type": "application/xml" },
    body: xml,
  };

  return { call, httpResponse };
}

// ─── Status callback ──────────────────────────────────────────────────────────
// Plivo hangup_url receives form-encoded POST.

async function parseStatusCallback(req) {
  let body = {};
  try {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const duration = body.Duration || body.BillDuration || null;

  return {
    callSid: body.CallUUID || body.request_uuid || "",
    status: normalizeStatus(body.CallStatus || body.HangupCause),
    duration: duration !== null ? parseInt(duration, 10) : null,
    hangupBy: resolveHangupBy(body.HangupCause || body.hangup_cause),
    provider: PROVIDERS.PLIVO,
    raw: body,
  };
}

function resolveHangupBy(raw) {
  if (!raw) return null;
  const val = raw.toLowerCase();
  // Plivo HangupCause values: NORMAL_CLEARING, USER_BUSY, NO_ANSWER,
  // ORIGINATOR_CANCEL, NORMAL_TEMPORARY_FAILURE, etc.
  if (val.includes("originator") || val.includes("caller")) return "caller";
  if (val.includes("normal_clearing")) return "agent";
  if (val.includes("failure") || val.includes("error")) return "system";
  if (val.includes("busy")) return "caller";
  return null;
}

// ─── WebSocket config ─────────────────────────────────────────────────────────

function getWebSocketConfig(agentId) {
  const base = (RAILWAY_WS_URL || "").replace(/\/$/, "");
  return {
    url: `${base}/ws/call?agent_id=${agentId}&provider=plivo`,
    headers: {},
    audioFormat: "pcm_16000", // Plivo Stream: 16kHz PCM by default
    providerParams: {
      auth_id: PLIVO_AUTH_ID,
    },
  };
}

// ─── Audio normalization ──────────────────────────────────────────────────────
// Plivo Stream delivers 16kHz signed 16-bit PCM — same as Exotel.
// Pass through as-is. If 8kHz config detected via meta, upsample.

function formatAudioChunk(chunk, meta = {}) {
  const raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

  const sampleRate = meta.sampleRate || 16000;

  if (sampleRate === 16000) return raw;

  if (sampleRate === 8000) {
    return upsample8kTo16k(raw);
  }

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
