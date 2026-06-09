/**
 * telephony-server/src/websocket/callHandler.js
 *
 * Handles one Exotel AgentStream WebSocket connection per call.
 *
 * Flow:
 *   connected -> start -> media (repeated) -> stop
 *
 * Pipeline per utterance:
 *   VAD detects silence -> Sarvam STT -> RAG + Gemini LLM -> Sarvam TTS -> send PCM chunks
 */

import { supabase } from "../lib/supabase.js";
import {
  getVoiceProvider,
  normalizeLanguageCode,
  resolveVoiceId,
  stt,
  tts,
} from "../voice/provider.js";
import { getLLMReply, streamLLMReply } from "../pipeline/llm.js";
import { stripWavHeader, chunkPcm } from "../lib/audio.js";
import { createCallLog, updateCallLog } from "../lib/callLog.js";
import { Logger, loggerContext } from "../lib/logger.js";

// ── Constants (all env-configurable) ─────────────────────────────────────────
const VAD_SILENCE_THRESHOLD = parseInt(process.env.EXOTEL_VAD_THRESHOLD || "300", 10);
const VAD_SILENCE_DURATION = parseInt(process.env.EXOTEL_VAD_SILENCE_MS || "500", 10); // was 1500ms hardcoded
const MAX_CALL_DURATION_MS =
  (parseInt(process.env.MAX_CALL_DURATION_S) || 600) * 1000;
const PIPELINE_TIMEOUT_MS = parseInt(process.env.EXOTEL_PIPELINE_TIMEOUT_MS || "1500", 10);

// Supabase singleton imported from ../lib/supabase.js


export function handleCall(ws, req) {
  const loggerCtx = Logger.createContext();
  ws.loggerCtx = loggerCtx;

  loggerContext.run(loggerCtx, () => {
    Logger.log("WS", "handler hit");
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
  let playbackGeneration = 0;
  let activeReplyAbort = null;
  let pendingUserTranscript = null;

  Logger.log("WS", `New connection agentId=${agentId}`);

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
    Logger.log("WS", `Agent loaded: ${agent.name}`);
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
      Logger.log("AUDIO", `speech_end detected (silence_duration_ms=${VAD_SILENCE_DURATION})`);
      const ctx = Logger.context;
      if (ctx) Logger.setState({ totalTurns: ctx.state.totalTurns + 1 });
      await runPipeline(combined);
    }, VAD_SILENCE_DURATION);
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────

  function takeReadyTtsChunks(text, force = false, minChars = 20) {
    const TTS_MIN_CHARS = 20;
    const TTS_MAX_CHARS = 130;
    const chunks = [];
    let rest = text.replace(/\s+/g, " ");

    while (rest.trim().length) {
      const boundaryMatches = [...rest.matchAll(/[.!?\u0964]\s+/g)];
      const boundary = boundaryMatches.find(
        (m) => m.index + m[0].length >= minChars,
      );

      if (boundary) {
        const end = boundary.index + boundary[0].length;
        chunks.push(rest.slice(0, end).trim());
        rest = rest.slice(end).trimStart();
        continue;
      }

      if (rest.length >= TTS_MAX_CHARS) {
        const splitAt = rest.lastIndexOf(" ", TTS_MAX_CHARS);
        const end = splitAt > TTS_MIN_CHARS ? splitAt : TTS_MAX_CHARS;
        chunks.push(rest.slice(0, end).trim());
        rest = rest.slice(end).trimStart();
        continue;
      }

      break;
    }

    if (force && rest.trim()) {
      chunks.push(rest.trim());
      rest = "";
    }
    return { chunks, rest };
  }

  async function runReplyPipeline(transcript, initialTurn = false) {
    if (isProcessing || !agent) return;
    isProcessing = true;

    const t0 = Date.now();
    const generation = ++playbackGeneration;
    const activeLang = normalizeLanguageCode(agent.language ?? lang);
    const voiceProvider = getVoiceProvider(agent.config);
    const activeVoiceId = resolveVoiceId({
      languageCode: activeLang,
      agentConfig: agent.config,
      voiceProvider,
    });

    try {
      if (isBotSpeaking && !initialTurn) sendClear();

      let reply = "";
      let streamedReplyText = "";
      let pendingText = "";
      let ttsQueue = Promise.resolve();

      const enqueueTts = (text) => {
        if (!text?.trim()) return;
        const chunkText = text
          .replace(/\([^)]*\)/g, "")
          .replace(/["*]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!chunkText) return;

        ttsQueue = ttsQueue.then(async () => {
          if (
            activeReplyAbort?.signal.aborted ||
            generation !== playbackGeneration
          )
            return;
          console.log(`[tts/batch] chunk chars=${chunkText.length}`);
          const wav = await tts({
            text: chunkText,
            languageCode: activeLang,
            voiceId: activeVoiceId,
            pace: agent.config?.pace ?? 1.0,
            agentConfig: agent.config,
            voiceProvider,
          });
          if (
            activeReplyAbort?.signal.aborted ||
            generation !== playbackGeneration
          )
            return;
          sendAudio(stripWavHeader(wav));
        });
      };

      activeReplyAbort = new AbortController();

      try {
        reply = await streamLLMReply({
          agentId: agent.id,
          history,
          language: activeLang,
          config: agent.config,
          signal: activeReplyAbort.signal,
          initialTurn,
          onToken: (token) => {
            streamedReplyText += token;
            pendingText += token;
            const ready = takeReadyTtsChunks(pendingText, false, 20);
            pendingText = ready.rest;
            ready.chunks.forEach(enqueueTts);
          },
        });

        const finalChunks = takeReadyTtsChunks(pendingText, true);
        finalChunks.chunks.forEach(enqueueTts);
        await ttsQueue;
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.warn("[llm] streaming failed, falling back:", err?.message);
      }

      if (!reply?.trim() && streamedReplyText.trim()) {
        reply = streamedReplyText.trim();
      }

      if (!reply?.trim()) {
        reply = await getLLMReply({
          agentId: agent.id,
          history,
          language: activeLang,
          config: agent.config,
          initialTurn,
        });
        if (!reply?.trim()) {
          reply =
            agent?.config?.fallback_message ??
            "I am sorry, please try again.";
        }
        const wav = await tts({
          text: reply,
          languageCode: activeLang,
          voiceId: activeVoiceId,
          pace: agent.config?.pace ?? 1.0,
          agentConfig: agent.config,
          voiceProvider,
        });
        sendAudio(stripWavHeader(wav));
      }

      console.log(`[llm] "${reply.slice(0, 80)}"`);
      history = history.slice(-39);
      history.push({ role: "assistant", content: reply });
      console.log(`[pipeline] reply done in ${Date.now() - t0}ms`);
    } catch (err) {
      console.error("[pipeline error]", err?.message);
    } finally {
      if (activeReplyAbort) activeReplyAbort = null;
      isProcessing = false;
      if (pendingUserTranscript) {
        const queued = pendingUserTranscript;
        pendingUserTranscript = null;
        runReplyPipeline(queued).catch((err) =>
          console.error("[pipeline queued]", err?.message),
        );
      }
    }
  }

  async function runPipeline(pcmBuffer) {
    if (isProcessing || !agent) return;
    isProcessing = true;
    const t0 = Date.now();
    try {
      if (isBotSpeaking) sendClear();
      const voiceProvider = getVoiceProvider(agent.config);
      const chimeTimer = setTimeout(
        () => playThinkingChime(),
        PIPELINE_TIMEOUT_MS,
      );
      const activeLang = normalizeLanguageCode(agent.language ?? lang);
      const transcript = await stt({
        audioBuffer: pcmBuffer,
        languageCode: activeLang,
        mimeType: "audio/wav",
        agentConfig: agent.config,
        voiceProvider,
      });
      clearTimeout(chimeTimer);
      if (!transcript?.trim()) {
        Logger.log("STT", "empty transcript; no LLM turn");
        isProcessing = false;
        return;
      }
      Logger.log("STT", `"${transcript}"`);
      history.push({ role: "user", content: transcript });
      isProcessing = false;
      await runReplyPipeline(transcript, false);
    } catch (err) {
      Logger.error("PIPELINE", err?.message);
      isProcessing = false;
    }
  }

  async function playThinkingChime() {
    const silence = Buffer.alloc(3200, 0);
    sendAudio(silence);
  }

  async function playInitialReply() {
    await runReplyPipeline("", true);
  }

  // ── Message handler ────────────────────────────────────────────────────────

  ws.on("message", (data) => {
    loggerContext.run(ws.loggerCtx, async () => {
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
        callSid = msg.start?.call_sid;
        callStart = Date.now();
        Logger.setState({ callSid });
        Logger.log("WS", `start callSid=${callSid}`);

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
        await playInitialReply();
        break;

      case "media": {
        const payload = msg.media?.payload;
        if (!payload) break;
        const seq = msg.sequenceNumber ?? msg.media?.chunk;
        Logger.log("AUDIO", `Received media chunk=${seq} size=${data.length} bytes`);
        Logger.setState({ currentStage: "MEDIA_IN" });

        const pcm = Buffer.from(payload, "base64");
        const rms = getRMS(pcm);

        if (rms > VAD_SILENCE_THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            Logger.log("AUDIO", `speech_start detected, rms=${rms.toFixed(0)}`);
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
        Logger.log("WS", `dtmf: ${msg.dtmf?.digit}`);
        break;

      case "mark":
        if (msg.mark?.name?.startsWith("bot-")) isBotSpeaking = false;
        break;

      case "stop":
        await handleCallEnd(msg.stop?.reason ?? "callended");
        break;
    }
    }); // end loggerContext.run
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
    Logger.log("WS", `ended reason=${reason} duration=${duration}s`);
    Logger.perfSummary();
  }

  ws.on("close", () => {
    loggerContext.run(ws.loggerCtx, () => {
      handleCallEnd("closed").catch(() => {});
    });
  });
  ws.on("error", (err) => {
    loggerContext.run(ws.loggerCtx, () => {
      Logger.error("WS", "error:", err?.message);
    });
  });
  }); // end init run
}
