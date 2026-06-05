/**
 * Telephony Provider Interface Contract
 * All providers must implement every method defined here.
 * TELEPHONY_PROVIDER=exotel|twilio|myoperator|plivo
 */

/**
 * @typedef {Object} NormalizedCall
 * @property {string} callSid        - Provider call ID
 * @property {string} from           - Caller number
 * @property {string} to             - Dialed number
 * @property {string} agentId        - Resolved agent ID
 * @property {string} direction      - 'inbound' | 'outbound'
 * @property {string} status         - 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer'
 * @property {string} provider       - Provider name
 * @property {Object} raw            - Original provider payload
 */

/**
 * @typedef {Object} NormalizedStatus
 * @property {string} callSid
 * @property {string} status         - normalized status string
 * @property {number|null} duration  - seconds, null if unavailable
 * @property {string|null} hangupBy  - 'caller' | 'agent' | 'system' | null
 * @property {string} provider
 * @property {Object} raw
 */

/**
 * @typedef {Object} WebSocketConfig
 * @property {string} url            - WSS endpoint URL
 * @property {Object} headers        - Headers to include in WS handshake
 * @property {string} audioFormat    - e.g. 'pcm_16000' | 'mulaw_8000'
 * @property {Object} providerParams - Any extra provider-specific params
 */

/**
 * @typedef {Object} InitiateCallResult
 * @property {string} callSid
 * @property {string} status
 * @property {string} provider
 * @property {Object} raw
 */

/**
 * Base class documenting the required interface.
 * Providers don't need to extend this — duck typing is fine —
 * but this serves as the canonical contract reference.
 */
class TelephonyProvider {
  /**
   * Initiate an outbound call.
   * @param {string} to
   * @param {string} from
   * @param {string} agentId
   * @param {string} callbackUrl  - Status callback URL
   * @returns {Promise<InitiateCallResult>}
   */
  async initiateCall(to, from, agentId, callbackUrl) {
    throw new Error("initiateCall() not implemented");
  }

  /**
   * Parse inbound webhook request into a normalized call object.
   * Must also return an httpResponse object with { status, headers, body }
   * that the route handler should send back to the provider.
   * @param {Request} req  - Next.js Request object
   * @param {Object} params - Route params (e.g. { agent_id })
   * @returns {Promise<{ call: NormalizedCall, httpResponse: { status: number, headers: Object, body: string } }>}
   */
  async parseInboundWebhook(req, params) {
    throw new Error("parseInboundWebhook() not implemented");
  }

  /**
   * Parse status callback request into a normalized status object.
   * @param {Request} req
   * @returns {Promise<NormalizedStatus>}
   */
  async parseStatusCallback(req) {
    throw new Error("parseStatusCallback() not implemented");
  }

  /**
   * Return WSS URL + headers for the Railway telephony server to connect.
   * @param {string} agentId
   * @returns {WebSocketConfig}
   */
  getWebSocketConfig(agentId) {
    throw new Error("getWebSocketConfig() not implemented");
  }

  /**
   * Normalize a raw audio chunk from the provider to 16kHz PCM Buffer.
   * Called inside the Railway telephony server audio pipeline.
   * @param {Buffer} chunk  - Raw audio bytes from provider
   * @param {Object} meta   - Provider-specific metadata (encoding, sampleRate, etc.)
   * @returns {Buffer}      - 16kHz signed 16-bit PCM
   */
  formatAudioChunk(chunk, meta = {}) {
    throw new Error("formatAudioChunk() not implemented");
  }
}

/** Canonical status values used internally across all providers */
const CALL_STATUS = {
  INITIATED: "initiated",
  RINGING: "ringing",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  FAILED: "failed",
  BUSY: "busy",
  NO_ANSWER: "no-answer",
};

/** Valid provider names */
const PROVIDERS = {
  EXOTEL: "exotel",
  TWILIO: "twilio",
  MYOPERATOR: "myoperator",
  PLIVO: "plivo",
};

module.exports = { TelephonyProvider, CALL_STATUS, PROVIDERS };
