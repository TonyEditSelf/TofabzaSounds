'use server';
import 'server-only';

import axios from 'axios';

// =============================================================
// /lib/exotel/client.js
//
// Exotel API client — India region (api.in.exotel.com).
//
// ⚠️  ARCHITECTURE CORRECTION from build prompt v5:
// Exotel does NOT use a BXML webhook response model.
// It uses AgentStream configured via App Bazaar:
//
//   Passthru applet → POST to /api/webhooks/exotel → return 200 or 302
//   Voicebot applet → WebSocket to Railway (configured once in App Bazaar)
//
// There is no BXML to generate. No XML in this file.
//
// Audio format over WebSocket:
//   FROM Exotel → base64-encoded raw PCM s16le in JSON media messages
//   TO   Exotel → base64-encoded raw PCM s16le in JSON media messages
//   NOT μ-law G.711 raw bytes.
//
// Auth: HTTP Basic Auth → base64(API_KEY:API_TOKEN) on all API calls.
// =============================================================

const ACCOUNT_SID = process.env.EXOTEL_ACCOUNT_SID;
const API_KEY     = process.env.EXOTEL_API_KEY;
const API_TOKEN   = process.env.EXOTEL_API_TOKEN;
const SUBDOMAIN   = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com'; // India region

/**
 * Base64-encoded Basic Auth credentials.
 * Format: base64(API_KEY:API_TOKEN)
 */
function getAuthHeader() {
  const credentials = `${API_KEY}:${API_TOKEN}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/** Base URL for all Exotel API calls */
function baseUrl() {
  return `https://${SUBDOMAIN}/v1/Accounts/${ACCOUNT_SID}`;
}

const exotelAxios = axios.create({ timeout: 10000 });

// =============================================================
// OUTBOUND CALLS
// =============================================================

/**
 * Initiates an outbound call via Exotel.
 * Used for: campaigns, test calls from Agent Builder.
 *
 * For outbound voicebot calls, pass railwayWsUrl — this sets StreamUrl
 * on the call, which opens the AgentStream WebSocket to Railway.
 *
 * @param {object} params
 * @param {string} params.from          - Your Exotel ExoPhone CLI (e.g. "09XXXXXXXX")
 * @param {string} params.to            - Destination number (E.164: "+91XXXXXXXXXX")
 * @param {string} [params.agentId]     - Passed as query param to Railway WebSocket
 * @param {string} [params.railwayWsUrl] - Railway WebSocket base URL (wss://...)
 * @param {string} [params.callType]    - "trans" (transactional) | "promo" (promotional)
 * @param {number} [params.timeLimit]   - Max call duration seconds. Default 600.
 * @param {string} [params.statusCallbackUrl] - URL for call completion POST
 * @returns {Promise<{ callSid: string, status: string }>}
 */
export async function initiateOutboundCall({
  from,
  to,
  agentId,
  railwayWsUrl,
  callType = 'trans',
  timeLimit = 600,
  statusCallbackUrl,
}) {
  const params = new URLSearchParams({
    From:     from,
    To:       to,
    CallerId: from,
    CallType: callType,
    TimeLimit: String(timeLimit),
    TimeOut:  '30',
  });

  if (railwayWsUrl && agentId) {
    // StreamUrl opens AgentStream WebSocket to Railway for voicebot calls
    params.set('StreamUrl', `${railwayWsUrl}/ws/call?agent_id=${agentId}`);
  }

  if (statusCallbackUrl) {
    params.set('StatusCallback', statusCallbackUrl);
    params.set('StatusCallbackEvents', 'terminal');
  }

  if (agentId) {
    params.set('CustomField', `agentId:${agentId}`);
  }

  const response = await exotelAxios.post(
    `${baseUrl()}/Calls/connect`,
    params.toString(),
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const call = response.data?.Call;
  if (!call?.Sid) throw new Error('Exotel: no CallSid in response');

  return { callSid: call.Sid, status: call.Status };
}

// =============================================================
// PASSTHRU WEBHOOK HANDLER
// Called from /api/webhooks/exotel/route.js
// =============================================================

/**
 * Validates that an incoming Passthru POST is genuinely from Exotel.
 * Exotel does NOT send HMAC on Passthru — validate via AccountSid field.
 *
 * @param {FormData} body - Parsed form data from Exotel POST
 * @returns {boolean}
 */
export function validatePassthruRequest(body) {
  const accountSid = body.get('AccountSid');
  return accountSid === ACCOUNT_SID;
}

/**
 * Parses the standard fields from an Exotel Passthru POST body.
 *
 * @param {FormData} body
 * @returns {{ callSid: string, from: string, to: string, direction: string, status: string }}
 */
export function parsePassthruPayload(body) {
  return {
    callSid:   body.get('CallSid'),
    from:      body.get('From'),
    to:        body.get('To'),
    direction: body.get('Direction'),
    status:    body.get('CallStatus'),
  };
}

// =============================================================
// WEBSOCKET HELPERS (used by telephony-server)
// =============================================================

/**
 * Builds the WSS URL for the Voicebot applet to connect to Railway.
 * Includes Basic Auth credentials in the URL.
 *
 * Configure this URL in Exotel App Bazaar → Voicebot applet once per agent.
 *
 * @param {string} railwayBaseUrl - e.g. "https://your-app.railway.app"
 * @param {string} agentId
 * @param {string} [lang]
 * @returns {string} wss://API_KEY:API_TOKEN@your-app.railway.app/ws/call?agent_id=...
 */
export function buildVoicebotWssUrl(railwayBaseUrl, agentId, lang) {
  const wsBase = railwayBaseUrl.replace(/^https?:\/\//, '');
  const params = new URLSearchParams({ agent_id: agentId });
  if (lang) params.set('lang', lang);
  return `wss://${API_KEY}:${API_TOKEN}@${wsBase}/ws/call?${params.toString()}`;
}

/**
 * Builds a JSON media message to send bot audio to Exotel over WebSocket.
 * Audio must be raw PCM s16le at the configured sample rate (16kHz),
 * base64-encoded.
 *
 * @param {string} streamSid
 * @param {Buffer} pcmBuffer - Raw PCM s16le samples
 * @returns {string} JSON string ready to send via ws.send()
 */
export function buildMediaMessage(streamSid, pcmBuffer) {
  return JSON.stringify({
    event:      'media',
    stream_sid: streamSid,
    media: {
      payload: pcmBuffer.toString('base64'),
    },
  });
}

/**
 * Builds a clear message to interrupt queued bot audio (barge-in).
 * Send when VAD detects the caller has started speaking.
 *
 * @param {string} streamSid
 * @returns {string} JSON string
 */
export function buildClearMessage(streamSid) {
  return JSON.stringify({ event: 'clear', stream_sid: streamSid });
}

/**
 * Builds a mark message — Exotel sends back a mark event when
 * your named audio chunk has finished playing.
 *
 * @param {string} streamSid
 * @param {string} name - Label for this mark (e.g. "reply-1")
 * @returns {string} JSON string
 */
export function buildMarkMessage(streamSid, name) {
  return JSON.stringify({ event: 'mark', stream_sid: streamSid, mark: { name } });
}

/**
 * Decodes a PCM audio payload from an Exotel media WebSocket message.
 * Exotel sends: base64-encoded raw PCM s16le in msg.media.payload
 *
 * @param {object} msg - Parsed WebSocket message object
 * @returns {Buffer} Raw PCM buffer
 */
export function decodePcmPayload(msg) {
  if (msg.event !== 'media') throw new Error(`Expected media event, got: ${msg.event}`);
  return Buffer.from(msg.media.payload, 'base64');
}

// =============================================================
// APP BAZAAR SETUP GUIDE (for reference — not code)
// =============================================================
//
// One-time setup per ExoPhone (agent DID) in Exotel Dashboard → App Bazaar:
//
// 1. Create new app
// 2. Add applets in order:
//    a. Passthru   → POST URL: https://your-vercel-app.vercel.app/api/webhooks/exotel
//                     200 branch → next applet
//                     302 branch → Hangup (or Greeting with "outside hours" message)
//    b. [Optional] Greeting → audio URL: 24hr signed URL of consent IVR audio (if recording enabled)
//    c. Voicebot   → WSS URL: wss://API_KEY:API_TOKEN@your-railway.app/ws/call?agent_id={id}
//                     Sample rate: 16000 Hz
//    d. Passthru   → POST URL: /api/webhooks/exotel/status (for call completion)
// 3. Assign app to the agent's ExoPhone DID
// 4. Repeat for each agent DID
//
// For outbound voicebot calls (campaigns), StreamUrl in the Calls API
// handles the WebSocket connection — no App Bazaar setup needed for outbound.
