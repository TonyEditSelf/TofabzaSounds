/**
 * telephony-server/src/websocket/callHandlerTwilio.js
 *
 * Twilio Media Stream WebSocket handler.
 *
 * Audio format:
 *   IN:  base64 mulaw 8kHz  -> decode -> upsample 16kHz -> Google STT
 *   OUT: Google TTS returns raw mulaw 8kHz -> send directly (no conversion)
 *
 * Pipeline per utterance:
 *   RMS VAD detects speech -> silence timer -> STT -> LLM+RAG -> TTS -> send mulaw
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { stt, tts } from "../voice/provider.js";
import { getLLMReply } from "../pipeline/llm.js";
import { upsample8kTo16k } from "../lib/audio.js";
import { createCallLog, updateCallLog } from "../lib/callLog.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const VAD_SILENCE_THRESHOLD = 300;   // RMS level below which is silence
const VAD_SILENCE_DURATION  = 1500;  // ms of silence before triggering STT
const MAX_CALL_DURATION_MS  = (parseInt(process.env.MAX_CALL_DURATION_S) || 600) * 1000;
const PIPELINE_TIMEOUT_MS   = 1500;  // play chime if pipeline takes longer than this

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

// ── mulaw codec ───────────────────────────────────────────────────────────────

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function mulawToLinear(mulaw) {
  mulaw = ~mulaw;
  const sign     = mulaw & 0x80;
  const exp      = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exp;
  return sign ? MULAW_BIAS - sample : sample - MULAW_BIAS;
}

/** mulaw Buffer (8kHz) -> PCM s16le Buffer (8kHz) */
function decodeMulaw(buf) {
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    pcm.writeInt16LE(mulawToLinear(buf[i]), i * 2);
  }
  return pcm;
}

/** Split buffer into fixed-size chunks (160 bytes = 20ms mulaw at 8kHz) */
function chunkBuffer(buf, size = 160) {
  const chunks = [];
  for (let offset = 0; offset < buf.length; offset += size) {
    chunks.push(buf.subarray(offset, offset + size));
  }
  return chunks;
}

/** RMS loudness of PCM s16le buffer */
function getRMS(pcm) {
  let sum = 0;
  for (let i = 0; i < pcm.length - 1; i += 2) {
    const s = pcm.readInt16LE(i);
    sum += s * s;
  }
  return Math.sqrt(sum / (pcm.length / 2));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export function handleCall(ws, req) {
  console.log("[twilio] handler hit");

  const url = new URL(req.url, "wss://localhost");
  let agentId = url.searchParams.get("agent_id");
  const lang  = url.searchParams.get("lang") ?? "ml-IN";

  let streamSid    = null;
  let callSid      = null;
  let callLogId    = null;
  let agent        = null;
  let history      = [];
  let pcmChunks    = [];   // 16kHz PCM accumulated during speech
  let isSpeaking   = false;
  let isProcessing = false;
  let isBotSpeaking = false;
  let callTimeout  = null;
  let vadTimer     = null;
  let callStart    = Date.now();
  let markCounter  = 0;
  let pendingMark  = null;

  console.log(`[twilio] New connection agentId=${agentId}`);

  // ── Load agent ──────────────────────────────────────────────────────────────

  async function loadAgent() {
    if (!agentId) { ws.close(1008, "No agent_id"); return; }
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, status, language, config, client_id")
      .eq("id", agentId)
      .single();
    if (error || !data || data.status !== "active") {
      ws.close(1008, "Agent not found or inactive");
      return;
    }
    agent = data;
    console.log(`[twilio] Agent loaded: ${agent.name}`);
  }

  // ── Send audio to Twilio ────────────────────────────────────────────────────
  // Google TTS returns raw mulaw 8kHz — send directly, no conversion needed.

  function sendMulawAudio(mulawBuf) {
    if (!streamSid || ws.readyState !== 1) return;
    isBotSpeaking = true;
    chunkBuffer(mulawBuf, 160).forEach((chunk) => {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: chunk.toString("base64") },
      }));
    });
    pendingMark = `bot-${++markCounter}`;
    ws.send(JSON.stringify({
      event: "mark",
      streamSid,
      mark: { name: pendingMark },
    }));
    console.log(`[twilio] sent audio, waiting for mark: ${pendingMark}`);
  }

  function sendClear() {
    if (!streamSid || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ event: "clear", streamSid }));
    isBotSpeaking = false;
  }

  // ── VAD ─────────────────────────────────────────────────────────────────────

  function resetVadTimer() {
    if (vadTimer) clearTimeout(vadTimer);
    vadTimer = setTimeout(async () => {
      console.log(`[vad] silence timer fired, chunks=${pcmChunks.length} isProcessing=${isProcessing}`);
      if (pcmChunks.length === 0 || isProcessing) return;
      const combined = Buffer.concat(pcmChunks);
      pcmChunks  = [];
      isSpeaking = false;
      await runPipeline(combined);
    }, VAD_SILENCE_DURATION);
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────────

  async function runPipeline(pcm16kBuffer) {
    if (isProcessing || !agent) return;
    isProcessing = true;
    const t0 = Date.now();
    console.log(`[twilio/pipeline] start, bufSize=${pcm16kBuffer.length}`);

    try {
      if (isBotSpeaking) sendClear();

      const chimeTimer = setTimeout(() => playChime(), PIPELINE_TIMEOUT_MS);

      // 1. STT
      const transcript = await stt({
        audioBuffer: pcm16kBuffer,
        languageCode: agent.language ?? lang,
        mimeType: "audio/wav",
      });
      clearTimeout(chimeTimer);
      console.log(`[twilio/stt] "${transcript}"`);

      if (!transcript?.trim()) { isProcessing = false; return; }

      history.push({ role: "user", content: transcript });

      // 2. LLM + RAG
      const reply = await getLLMReply({
        agentId:  agent.id,
        history,
        language: agent.language ?? lang,
        config:   agent.config,
      });
      if (!reply) { isProcessing = false; return; }
      console.log(`[twilio/llm] "${reply.slice(0, 80)}"`);

      history = history.slice(-40);
      history.push({ role: "assistant", content: reply });

      // 3. TTS — Google returns raw mulaw 8kHz, send directly
      const mulawBuf = await tts({
        text:         reply,
        languageCode: agent.language ?? lang,
        voiceId:      agent.config?.voice_id,
        pace:         agent.config?.pace ?? 1.0,
      });
      sendMulawAudio(mulawBuf);
      console.log(`[twilio/pipeline] done in ${Date.now() - t0}ms`);

    } catch (err) {
      console.error("[twilio/pipeline] ERROR:", err?.message);
      try {
        const msg = agent?.config?.fallback_message ?? "I am sorry, please try again.";
        const mulawBuf = await tts({
          text:         msg,
          languageCode: agent?.language ?? lang,
          voiceId:      agent?.config?.voice_id,
        });
        sendMulawAudio(mulawBuf);
      } catch (_) {}
    } finally {
      isProcessing = false;
    }
  }

  async function playChime() {
    // 20ms silence as placeholder chime
    const silence = Buffer.alloc(160, 0xff); // 0xff = mulaw silence
    sendMulawAudio(silence);
  }

  // ── Message handler ───────────────────────────────────────────────────────────

  ws.on("message", async (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.event) {

      case "connected":
        break;

      case "start": {
        streamSid = msg.streamSid ?? msg.start?.streamSid;
        callSid   = msg.start?.callSid;
        console.log("[twilio] customParameters:", JSON.stringify(msg.start?.customParameters));
        agentId   = agentId ?? msg.start?.customParameters?.agent_id;
        callStart = Date.now();

        await loadAgent();
        if (!agent) break;

        console.log(`[twilio] start callSid=${callSid}`);

        callLogId = await createCallLog(supabase, {
          callSid,
          agentId,
          clientId:     agent.client_id,
          callerNumber: msg.start?.customParameters?.from ?? null,
          direction:    "inbound",
        });

        callTimeout = setTimeout(() => ws.close(1000, "max_duration"), MAX_CALL_DURATION_MS);

        // Play greeting — Google TTS returns raw mulaw 8kHz, send directly
        try {
          isBotSpeaking = true;
          const greetingMulaw = await tts({
            text:         agent.config?.greeting ?? "",
            languageCode: agent.language ?? lang,
            voiceId:      agent.config?.voice_id,
          });
          sendMulawAudio(greetingMulaw);
        } catch (err) {
          console.error("[twilio] greeting error:", err?.message);
          isBotSpeaking = false;
        }
        break;
      }

      case "media": {
        const payload = msg.media?.payload;
        if (!payload) break;

        // Decode incoming mulaw 8kHz -> PCM 16kHz for STT
        const mulawBuf = Buffer.from(payload, "base64");
        const pcm8k    = decodeMulaw(mulawBuf);
        const pcm16k   = upsample8kTo16k(pcm8k);

        // Drop all frames while bot is speaking
        if (isBotSpeaking) break;

        // RMS-based VAD (same as Exotel handler)
        const rms = getRMS(pcm16k);
        if (rms > VAD_SILENCE_THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            console.log(`[twilio/vad] speech started, rms=${rms.toFixed(0)}`);
          }
          pcmChunks.push(pcm16k);
          resetVadTimer();
        } else if (isSpeaking) {
          pcmChunks.push(pcm16k);
          resetVadTimer();
        }
        break;
      }

      case "dtmf":
        console.log(`[twilio/dtmf] ${msg.dtmf?.digit}`);
        break;

      case "mark":
        if (msg.mark?.name === pendingMark) {
          isBotSpeaking = false;
          pendingMark   = null;
          console.log(`[twilio] mark received, now listening: ${msg.mark.name}`);
        }
        break;

      case "stop":
        await handleCallEnd("callended");
        break;
    }
  });

  // ── Call end ──────────────────────────────────────────────────────────────────

  async function handleCallEnd(reason) {
    if (callTimeout) clearTimeout(callTimeout);
    if (vadTimer)    clearTimeout(vadTimer);
    const duration = Math.floor((Date.now() - callStart) / 1000);
    await updateCallLog(supabase, callLogId, {
      status:     reason === "callended" ? "completed" : reason,
      duration,
      transcript: history.length ? history : null,
    });
    console.log(`[twilio] ended reason=${reason} duration=${duration}s`);
  }

  ws.on("close", () => handleCallEnd("closed").catch(() => {}));
  ws.on("error", (err) => console.error("[twilio/ws error]", err?.message));
}