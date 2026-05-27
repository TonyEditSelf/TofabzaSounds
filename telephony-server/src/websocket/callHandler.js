/**
 * telephony-server/src/websocket/callHandler.js
 *
 * Handles one Exotel AgentStream WebSocket connection per call.
 *
 * Flow:
 *   connected → start → media (repeated) → stop
 *
 * Pipeline per utterance:
 *   VAD detects silence → Sarvam STT → RAG + Gemini LLM → Sarvam TTS → send PCM chunks
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { transcribeAudio } from "../pipeline/stt.js";
import { getLLMReply } from "../pipeline/llm.js";
import { synthesizeSpeech } from "../pipeline/tts.js";
import { stripWavHeader, chunkPcm } from "../lib/audio.js";
import { createCallLog, updateCallLog } from "../lib/callLog.js";

const VAD_SILENCE_THRESHOLD = 300; // RMS — tune after testing
const VAD_SILENCE_DURATION = 1500; // ms silence before STT
const MAX_CALL_DURATION_MS =
  (parseInt(process.env.MAX_CALL_DURATION_S) || 600) * 1000;
const PIPELINE_TIMEOUT_MS = 1500; // play thinking chime if pipeline > this

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

export function handleCall(ws, req, provider = "exotel") {
  const url = new URL(req.url, "wss://localhost");
  const agentId = url.searchParams.get("agent_id");
  const lang = url.searchParams.get("lang") ?? "ml-IN";

  let streamSid = null;
  let callSid = null;
  let callLogId = null;
  let agent = null;
  let history = [];
  let pcmChunks = [];
  let isSpeaking = false;
  let isProcessing = false;
  let isBotSpeaking = false;
  let callTimeout = null;
  let vadTimer = null;
  let callStart = Date.now();
  let markCounter = 0;

  console.log(`[call] New connection agentId=${agentId}`);

  // ── Load agent from Supabase ───────────────────────────────────────────────

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
    console.log(`[call] Agent loaded: ${agent.name}`);
  }

  // ── Send audio back to caller ──────────────────────────────────────────────

  function sendAudio(pcmBuffer) {
    if (!streamSid || ws.readyState !== 1) return;
    isBotSpeaking = true;
    chunkPcm(pcmBuffer, 3200).forEach((chunk) => {
      if (ws.readyState !== 1) return;
      ws.send(
        JSON.stringify({
          event: "media",
          stream_sid: streamSid,
          media: { payload: chunk.toString("base64") },
        }),
      );
    });
    ws.send(
      JSON.stringify({
        event: "mark",
        stream_sid: streamSid,
        mark: { name: `bot-${++markCounter}` },
      }),
    );
  }

  function sendClear() {
    if (!streamSid || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ event: "clear", stream_sid: streamSid }));
    isBotSpeaking = false;
  }

  // ── VAD ───────────────────────────────────────────────────────────────────

  function getRMS(pcm) {
    let sum = 0;
    for (let i = 0; i < pcm.length - 1; i += 2) {
      const s = pcm.readInt16LE(i);
      sum += s * s;
    }
    return Math.sqrt(sum / (pcm.length / 2));
  }

  function resetVadTimer() {
    if (vadTimer) clearTimeout(vadTimer);
    vadTimer = setTimeout(async () => {
      if (pcmChunks.length === 0 || isProcessing) return;
      const combined = Buffer.concat(pcmChunks);
      pcmChunks = [];
      isSpeaking = false;
      await runPipeline(combined);
    }, VAD_SILENCE_DURATION);
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  async function runPipeline(pcmBuffer) {
    if (isProcessing || !agent) return;
    isProcessing = true;

    const t0 = Date.now();

    try {
      if (isBotSpeaking) sendClear();

      // Thinking chime after PIPELINE_TIMEOUT_MS
      const chimeTimer = setTimeout(
        () => playThinkingChime(),
        PIPELINE_TIMEOUT_MS,
      );

      // 1. STT
      const transcript = await transcribeAudio(
        pcmBuffer,
        agent.language ?? lang,
      );
      clearTimeout(chimeTimer);

      if (!transcript?.trim()) {
        isProcessing = false;
        return;
      }

      console.log(`[stt] "${transcript}"`);
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
      console.log(`[llm] "${reply.slice(0, 80)}"`);

      history = history.slice(-40);
      history.push({ role: "assistant", content: reply });

      // 3. TTS
      const wav = await synthesizeSpeech({
        text: reply,
        language: agent.language ?? lang,
        speaker: agent.config?.voice_id ?? "anand",
        pace: agent.config?.pace ?? 1.0,
      });

      sendAudio(stripWavHeader(wav));
      console.log(`[pipeline] ${Date.now() - t0}ms`);
    } catch (err) {
      console.error("[pipeline]", err?.message);
      try {
        const msg =
          agent?.config?.fallback_message ?? "I am sorry, please try again.";
        const wav = await synthesizeSpeech({
          text: msg,
          language: agent?.language ?? lang,
          speaker: "anand",
        });
        sendAudio(stripWavHeader(wav));
      } catch (_) {}
    } finally {
      isProcessing = false;
    }
  }

  async function playThinkingChime() {
    const silence = Buffer.alloc(3200, 0);
    sendAudio(silence);
  }

  async function playGreeting() {
    const greeting = agent?.config?.greeting;
    if (!greeting) return;
    try {
      const wav = await synthesizeSpeech({
        text: greeting,
        language: agent.language ?? lang,
        speaker: agent.config?.voice_id ?? "anand",
      });
      sendAudio(stripWavHeader(wav));
    } catch (err) {
      console.error("[greeting]", err?.message);
    }
  }

  // ── Message handler ────────────────────────────────────────────────────────

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        await loadAgent();
        break;

      case "start":
        streamSid = msg.stream_sid ?? msg.start?.stream_sid;
        callSid =
          provider === "plivo"
            ? (msg.start?.callId ?? msg.start?.call_sid)
            : msg.start?.call_sid;
        callStart = Date.now();
        console.log(`[call] start callSid=${callSid}`);

        callLogId = await createCallLog(supabase, {
          callSid,
          agentId,
          clientId: agent?.client_id,
          callerNumber: msg.start?.from,
          direction: "inbound",
        });

        callTimeout = setTimeout(
          () => ws.close(1000, "max_duration"),
          MAX_CALL_DURATION_MS,
        );
        await playGreeting();
        break;

      case "media": {
        const payload = msg.media?.payload;
        if (!payload) break;
        const pcm = Buffer.from(payload, "base64");
        const rms = getRMS(pcm);

        if (rms > VAD_SILENCE_THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            if (isBotSpeaking) sendClear();
          }
          pcmChunks.push(pcm);
          resetVadTimer();
        } else if (isSpeaking) {
          pcmChunks.push(pcm);
          resetVadTimer();
        }
        break;
      }

      case "dtmf":
        console.log(`[dtmf] ${msg.dtmf?.digit}`);
        break;

      case "mark":
        if (msg.mark?.name?.startsWith("bot-")) isBotSpeaking = false;
        break;

      case "stop":
        await handleCallEnd(msg.stop?.reason ?? "callended");
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
    console.log(`[call] ended reason=${reason} duration=${duration}s`);
  }

  ws.on("close", () => handleCallEnd("closed").catch(() => {}));
  ws.on("error", (err) => console.error("[ws error]", err?.message));
}
