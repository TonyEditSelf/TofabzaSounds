/**
 * telephony-server/src/websocket/callHandlerTwilio.js
 *
 * Handles one Twilio Media Stream WebSocket connection per call.
 *
 * Twilio Media Stream protocol:
 *   connected -> start -> media (repeated) -> stop
 *
 * Audio format differences vs Exotel:
 *   IN:  base64 mulaw 8kHz  -> decode -> upsample 16kHz -> STT
 *   OUT: PCM 16kHz s16le    -> downsample 8kHz -> encode mulaw -> base64
 *
 * Pipeline per utterance:
 *   VAD detects silence -> STT -> RAG + Gemini LLM -> TTS -> send mulaw chunks
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { stt, tts } from "../voice/provider.js";
import { getLLMReply } from "../pipeline/llm.js";
import { stripWavHeader, upsample8kTo16k } from "../lib/audio.js";
import { createCallLog, updateCallLog } from "../lib/callLog.js";

const VAD_SILENCE_DURATION = 1500;
const MAX_CALL_DURATION_MS =
  (parseInt(process.env.MAX_CALL_DURATION_S) || 600) * 1000;
const PIPELINE_TIMEOUT_MS = 1500;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

// ── mulaw codec ──────────────────────────────────────────────────────────────
// Twilio uses mulaw (G.711 u-law) at 8kHz

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function linearToMulaw(sample) {
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;
  let exp = 7;
  for (
    let expMask = 0x4000;
    (sample & expMask) === 0 && exp > 0;
    exp--, expMask >>= 1
  ) {}
  const mantissa = (sample >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mantissa) & 0xff;
}

function mulawToLinear(mulaw) {
  mulaw = ~mulaw;
  const sign = mulaw & 0x80;
  const exp = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exp;
  return sign ? MULAW_BIAS - sample : sample - MULAW_BIAS;
}

/**
 * Decode mulaw Buffer -> PCM s16le Buffer (8kHz)
 */
function decodeMulaw(mulawBuf) {
  const pcm = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    pcm.writeInt16LE(mulawToLinear(mulawBuf[i]), i * 2);
  }
  return pcm;
}

/**
 * Encode PCM s16le Buffer (8kHz) -> mulaw Buffer
 */
function encodeMulaw(pcmBuf) {
  const mulaw = Buffer.alloc(pcmBuf.length / 2);
  for (let i = 0; i < mulaw.length; i++) {
    mulaw[i] = linearToMulaw(pcmBuf.readInt16LE(i * 2));
  }
  return mulaw;
}

/**
 * Downsample PCM s16le from 16kHz to 8kHz (drop every other sample)
 */
function downsample16kTo8k(pcm16k) {
  const samples = Math.floor(pcm16k.length / 4);
  const out = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    out.writeInt16LE(pcm16k.readInt16LE(i * 4), i * 2);
  }
  return out;
}

/**
 * Split buffer into fixed-size chunks.
 * Twilio expects 160 bytes mulaw = 20ms at 8kHz
 */
function chunkBuffer(buf, chunkSize = 160) {
  const chunks = [];
  for (let offset = 0; offset < buf.length; offset += chunkSize) {
    chunks.push(buf.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export function handleCall(ws, req) {
  console.log("[twilio] handler hit");
  const url = new URL(req.url, "wss://localhost");
  let agentId = url.searchParams.get("agent_id");
  const lang = url.searchParams.get("lang") ?? "ml-IN";

  let streamSid = null;
  let callSid = null;
  let callLogId = null;
  let agent = null;
  let history = [];
  let pcmChunks = []; // 16kHz PCM after upsample
  let isSpeaking = false;
  let isProcessing = false;
  let isBotSpeaking = false;
  let callTimeout = null;
  let vadTimer = null;
  let callStart = Date.now();
  let markCounter = 0;

  console.log(`[twilio] New connection agentId=${agentId}`);

  // ── Load agent ──────────────────────────────────────────────────────────────

  async function loadAgent() {
    if (!agentId) {
      ws.close(1008, "No agent_id");
      return;
    }
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
  // Input: PCM 16kHz s16le Buffer (from TTS)
  // Output: mulaw 8kHz base64 chunks via Twilio media event

  function sendAudio(pcm16kBuffer) {
    if (!streamSid || ws.readyState !== 1) return;
    isBotSpeaking = true;

    const pcm8k = downsample16kTo8k(pcm16kBuffer);
    const mulaw = encodeMulaw(pcm8k);

    chunkBuffer(mulaw, 160).forEach((chunk) => {
      if (ws.readyState !== 1) return;
      ws.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: chunk.toString("base64") },
        }),
      );
    });

    // Mark to detect playback completion
    ws.send(
      JSON.stringify({
        event: "mark",
        streamSid,
        mark: { name: `bot-${++markCounter}` },
      }),
    );
  }

  function sendClear() {
    if (!streamSid || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ event: "clear", streamSid }));
    isBotSpeaking = false;
  }

  function sendMulawAudio(mulawBuffer) {
    if (!streamSid || ws.readyState !== 1) return;
    isBotSpeaking = true;
    chunkBuffer(mulawBuffer, 160).forEach((chunk) => {
      if (ws.readyState !== 1) return;
      ws.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: chunk.toString("base64") },
        }),
      );
    });
    ws.send(
      JSON.stringify({
        event: "mark",
        streamSid,
        mark: { name: `bot-${++markCounter}` },
      }),
    );
  }

  // ── VAD ─────────────────────────────────────────────────────────────────────

  function resetVadTimer() {
    if (vadTimer) clearTimeout(vadTimer);
    vadTimer = setTimeout(async () => {
      console.log(
        "[vad] timer fired, chunks:",
        pcmChunks.length,
        "isProcessing:",
        isProcessing,
      );
      if (pcmChunks.length === 0 || isProcessing) return;

      const combined = Buffer.concat(pcmChunks);
      pcmChunks = [];
      isSpeaking = false;
      await runPipeline(combined);
    }, VAD_SILENCE_DURATION);
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────────

  async function runPipeline(pcm16kBuffer) {
    console.log(
      "[twilio/pipeline] start, agent:",
      !!agent,
      "isProcessing:",
      isProcessing,
    );
    if (isProcessing || !agent) return;
    isProcessing = true;
    const t0 = Date.now();

    try {
      if (isBotSpeaking) sendClear();

      const chimeTimer = setTimeout(
        () => playThinkingChime(),
        PIPELINE_TIMEOUT_MS,
      );

      // 1. STT — send 16kHz PCM
      console.log(
        "[twilio/pipeline] calling STT, buffer size:",
        pcm16kBuffer.length,
      );
      console.log(
        "[twilio/pipeline] calling STT, buffer size:",
        pcm16kBuffer.length,
      );
      const transcript = await stt({
        audioBuffer: pcm16kBuffer,
        languageCode: agent.language ?? lang,
        mimeType: "audio/wav",
      });
      clearTimeout(chimeTimer);
      console.log("[twilio/pipeline] STT done:", transcript);

      if (!transcript?.trim()) {
        isProcessing = false;
        return;
      }

      console.log(`[twilio/stt] "${transcript}"`);
      history.push({ role: "user", content: transcript });

      // 2. LLM + RAG
      const reply = await getLLMReply({
        agentId: agent.id,
        history,
        language: agent.language ?? lang,
        config: agent.config,
      });

      if (!reply) {
        isProcessing = false;
        return;
      }
      console.log(`[twilio/llm] "${reply.slice(0, 80)}"`);
      console.log("[twilio/pipeline] LLM done, calling TTS");

      history = history.slice(-40);
      history.push({ role: "assistant", content: reply });

      // 3. TTS — returns WAV (16kHz PCM inside)
      const wav = await tts({
        text: reply,
        languageCode: agent.language ?? lang,
        voiceId: agent.config?.voice_id ?? "anand",
        pace: agent.config?.pace ?? 1.0,
      });

      console.log("[twilio/pipeline] TTS done, sending audio");
      sendMulawAudio(stripWavHeader(wav));
      console.log(`[twilio/pipeline] ${Date.now() - t0}ms`);
    } catch (err) {
      console.error("[twilio/pipeline] ERROR:", err?.message, err?.stack);
      try {
        const msg =
          agent?.config?.fallback_message ?? "I am sorry, please try again.";
        const wav = await tts({
          text: msg,
          languageCode: agent?.language ?? lang,
          voiceId: "anand",
        });
        sendMulawAudio(stripWavHeader(wav));
      } catch (_) {}
    } finally {
      isProcessing = false;
    }
  }

  async function playThinkingChime() {
    const silence = Buffer.alloc(320, 0); // 20ms silence at 8kHz mulaw equivalent
    sendAudio(silence);
  }

  async function playGreeting() {
    const greeting = agent?.config?.greeting;
    if (!greeting) return;
    try {
      const wav = await tts({
        text: greeting,
        languageCode: agent.language ?? lang,
        voiceId: agent.config?.voice_id ?? "anand",
      });
      sendMulawAudio(stripWavHeader(wav));
    } catch (err) {
      console.error("[twilio/pipeline] ERROR:", err?.message, err?.stack);
    }
  }

  // ── Message handler ──────────────────────────────────────────────────────────

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        // agent loaded after start event when agentId is available
        break;

      case "start":
        streamSid = msg.streamSid ?? msg.start?.streamSid;
        callSid = msg.start?.callSid;
        console.log(
          "[twilio] customParameters:",
          JSON.stringify(msg.start?.customParameters),
        );
        agentId = agentId ?? msg.start?.customParameters?.agent_id;
        callStart = Date.now();
        await loadAgent();
        console.log(`[twilio] start callSid=${callSid}`);

        callLogId = await createCallLog(supabase, {
          callSid,
          agentId,
          clientId: agent?.client_id,
          callerNumber: msg.start?.customParameters?.from ?? null,
          direction: "inbound",
        });

        callTimeout = setTimeout(
          () => ws.close(1000, "max_duration"),
          MAX_CALL_DURATION_MS,
        );
        isBotSpeaking = true;
        await playGreeting();
        break;

      case "media": {
        const payload = msg.media?.payload;
        if (!payload) break;

        // Decode mulaw 8kHz -> PCM 8kHz -> upsample to 16kHz
        const mulawBuf = Buffer.from(payload, "base64");
        const pcm8k = decodeMulaw(mulawBuf);
        const pcm16k = upsample8kTo16k(pcm8k);

        if (!isBotSpeaking) {
          pcmChunks.push(pcm16k);
          resetVadTimer();
        }
        break;
      }

      case "dtmf":
        console.log(`[twilio/dtmf] ${msg.dtmf?.digit}`);
        break;

      case "mark":
        // Twilio mark name is nested differently
        if (msg.mark?.name?.startsWith("bot-")) isBotSpeaking = false;
        break;

      case "stop":
        await handleCallEnd("callended");
        break;
    }
  });

  async function handleCallEnd(reason) {
    if (callTimeout) clearTimeout(callTimeout);
    if (vadTimer) clearTimeout(vadTimer);
    const duration = Math.floor((Date.now() - callStart) / 1000);
    await updateCallLog(supabase, callLogId, {
      status: reason === "callended" ? "completed" : reason,
      duration,
      transcript: history.length ? history : null,
    });
    console.log(`[twilio] ended reason=${reason} duration=${duration}s`);
  }

  ws.on("close", () => handleCallEnd("closed").catch(() => {}));
  ws.on("error", (err) => console.error("[twilio/ws error]", err?.message));
}
