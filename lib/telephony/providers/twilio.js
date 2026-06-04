const { CALL_STATUS, PROVIDERS } = require("../types");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  RAILWAY_WS_URL,
} = process.env;

// ─── Status map ───────────────────────────────────────────────────────────────

const TWILIO_STATUS_MAP = {
  queued: CALL_STATUS.INITIATED,
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
  return TWILIO_STATUS_MAP[lower] || CALL_STATUS.FAILED;
}

// ─── Outbound call ────────────────────────────────────────────────────────────

async function initiateCall(to, from, agentId, callbackUrl) {
  const fromNumber = from || TWILIO_PHONE_NUMBER;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;

  const wsConfig = getWebSocketConfig(agentId);

  // Twilio Media Streams: answer with <Connect><Stream> TwiML
  const twimlUrl = `${process.env.NEXTJS_URL}/api/webhooks/twilio/${agentId}`;

  const body = new URLSearchParams({
    To: to,
    From: fromNumber,
    Url: twimlUrl,
    StatusCallback: callbackUrl,
    StatusCallbackMethod: "POST",
  });

  const credentials = Buffer.from(
    `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
  ).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      `Twilio initiateCall failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }

  return {
    callSid: json.sid || "",
    status: normalizeStatus(json.status),
    provider: PROVIDERS.TWILIO,
    raw: json,
  };
}

// ─── Inbound webhook ──────────────────────────────────────────────────────────
// Twilio sends form-encoded POST; expects TwiML back.
// We return <Connect><Stream> TwiML pointing to Railway WS.

async function parseInboundWebhook(req, params) {
  const agentId = params?.agent_id || params?.agentId || "";

  let body = {};
  try {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const call = {
    callSid: body.CallSid || "",
    from: body.From || "",
    to: body.To || "",
    agentId,
    direction: "inbound",
    status: normalizeStatus(body.CallStatus),
    provider: PROVIDERS.TWILIO,
    raw: body,
  };

  const wsConfig = getWebSocketConfig(agentId);

  // TwiML response: connect call to Railway Media Stream WebSocket
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsConfig.url}">
      <Parameter name="agent_id" value="${agentId}"/>
    </Stream>
  </Connect>
</Response>`;

  const httpResponse = {
    status: 200,
    headers: { "Content-Type": "text/xml" },
    body: twiml,
  };

  return { call, httpResponse };
}

// ─── Status callback ──────────────────────────────────────────────────────────

async function parseStatusCallback(req) {
  let body = {};
  try {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch (_) {}

  const duration = body.CallDuration || null;

  return {
    callSid: body.CallSid || "",
    status: normalizeStatus(body.CallStatus),
    duration: duration !== null ? parseInt(duration, 10) : null,
    hangupBy: resolveHangupBy(body.HangupBy),
    provider: PROVIDERS.TWILIO,
    raw: body,
  };
}

function resolveHangupBy(raw) {
  if (!raw) return null;
  const val = raw.toLowerCase();
  if (val.includes("caller")) return "caller";
  if (val.includes("agent") || val.includes("called")) return "agent";
  if (val.includes("system") || val.includes("error")) return "system";
  return null;
}

// ─── WebSocket config ─────────────────────────────────────────────────────────
// Twilio Media Streams connects TO our Railway server via WSS.

function getWebSocketConfig(agentId) {
  const base = (RAILWAY_WS_URL || "").replace(/\/$/, "");
  return {
    url: `${base}/ws/call?agent_id=${agentId}&provider=twilio`,
    headers: {},
    audioFormat: "mulaw_8000", // Twilio default: 8kHz µ-law
    providerParams: {
      account_sid: TWILIO_ACCOUNT_SID,
    },
  };
}

// ─── Audio normalization ──────────────────────────────────────────────────────
// Twilio Media Streams: 8kHz µ-law → convert to 16kHz signed 16-bit PCM
// for Sarvam STT compatibility.

function formatAudioChunk(chunk, meta = {}) {
  const raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

  // µ-law decode table
  const pcm8k = mulawDecode(raw);

  // Upsample 8kHz → 16kHz by linear interpolation
  const pcm16k = upsample8kTo16k(pcm8k);

  return pcm16k;
}

function mulawDecode(mulawBuf) {
  const out = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    let mulaw = ~mulawBuf[i] & 0xff;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0f;
    let sample = ((mantissa << 1) + 33) << exponent;
    sample -= 33;
    if (sign) sample = -sample;
    // Clamp to int16
    sample = Math.max(-32768, Math.min(32767, sample));
    out.writeInt16LE(sample, i * 2);
  }
  return out;
}

function upsample8kTo16k(pcm8k) {
  // Each sample in pcm8k is 2 bytes (int16 LE)
  const sampleCount = pcm8k.length / 2;
  const out = Buffer.alloc(sampleCount * 2 * 2); // 2x samples
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
