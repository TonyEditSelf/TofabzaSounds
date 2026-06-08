/**
 * telephony-server/src/websocket/callHandlerTwilio.js
 *
 * Twilio Media Stream WebSocket handler.
 *
 * Audio format:
 *   IN:  base64 mulaw 8kHz -> Google STT; decoded PCM is used for VAD
 *   OUT: provider returns raw mulaw 8kHz -> send directly to Twilio
 *
 * Pipeline per utterance:
 *   RMS VAD detects speech -> silence timer -> STT -> LLM+RAG -> TTS -> send mulaw
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getVoiceProvider, stt, tts } from "../voice/provider.js";
import { createStreamingStt, createStreamingTts } from "../voice/streaming.js";
import { getLLMReply, streamLLMReply } from "../pipeline/llm.js";
import { upsample8kTo16k } from "../lib/audio.js";
import { createCallLog, updateCallLog } from "../lib/callLog.js";

// ── Constants ─────────────────────────────────────────────────────────────────

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const VAD_SILENCE_THRESHOLD = intEnv("TWILIO_VAD_THRESHOLD", 180);
const VAD_SILENCE_DURATION = intEnv("TWILIO_VAD_SILENCE_MS", 300);
const MIN_UTTERANCE_MS = intEnv("TWILIO_MIN_UTTERANCE_MS", 240);
const MAX_CALL_DURATION_MS =
  (parseInt(process.env.MAX_CALL_DURATION_S) || 600) * 1000;
const BARGE_IN_THRESHOLD = intEnv("TWILIO_BARGE_IN_THRESHOLD", 300);
const TTS_MIN_CHARS = intEnv("TWILIO_TTS_MIN_CHARS", 20);
const TTS_MAX_CHARS = intEnv("TWILIO_TTS_MAX_CHARS", 130);
const TWILIO_FRAME_MS = 20;
const TWILIO_SAMPLE_RATE = 8000;
const STREAMING_PIPELINE =
  (process.env.TWILIO_STREAMING_PIPELINE ?? "false").toLowerCase() === "true";
const STREAMING_STT =
  (process.env.TWILIO_STREAMING_STT ?? "false").toLowerCase() === "true";
const STREAMING_TTS =
  (process.env.TWILIO_STREAMING_TTS ?? "false").toLowerCase() === "true";

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

// ── mulaw codec ───────────────────────────────────────────────────────────────

const MULAW_BIAS = 0x84;

function mulawToLinear(mulaw) {
  mulaw = ~mulaw;
  const sign = mulaw & 0x80;
  const exp = (mulaw >> 4) & 0x07;
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
  const lang = url.searchParams.get("lang") ?? "ml-IN";

  let streamSid = null;
  let callSid = null;
  let callLogId = null;
  let agent = null;
  let history = [];
  let pcmChunks = []; // 16kHz PCM accumulated for non-Google STT
  let sttChunks = []; // provider-native audio accumulated during speech
  let utteranceMs = 0;
  let silenceMs = 0;
  let isSpeaking = false;
  let isProcessing = false;
  let isBotSpeaking = false;
  let callTimeout = null;
  let vadTimer = null;
  let botAudioTimer = null;
  let activeReplyAbort = null;
  let playbackGeneration = 0;
  let callStart = Date.now();
  let callEnded = false;
  let markCounter = 0;
  const pendingMarks = new Set();
  let initialGreetingPending = false;
  let initialGreetingSent = false;
  let streamingStt = null;
  let streamingSttPausedForBot = false;
  let latestStreamingInterim = "";
  let detectedLang = null;
  let streamingFallbackTimer = null;
  let streamingFallbackGeneration = 0;
  const voiceProvider = getVoiceProvider();

  console.log(
    `[twilio] New connection agentId=${agentId} voiceProvider=${voiceProvider}` +
      ` streamingPipeline=${STREAMING_PIPELINE}` +
      ` streamingStt=${STREAMING_STT}` +
      ` streamingTts=${STREAMING_TTS}`,
  );

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

  async function initStreamingPipeline() {
    if (!STREAMING_PIPELINE || !STREAMING_STT || streamingStt) return;
    streamingStt = await createStreamingStt({
      provider: voiceProvider,
      languageCode: agent.language ?? lang,
      onInterimTranscript: (text, lang) => {
        latestStreamingInterim = text?.trim() ?? "";
        if (lang && lang !== detectedLang) {
          detectedLang = lang;
          console.log(`[twilio/stt] detected language: ${lang}`);
        }
        console.log(`[twilio/stt/interim] "${text.slice(0, 80)}"`);
      },
      onFinalTranscript: async (text, lang) => {
        const transcript = text?.trim();
        if (!transcript || isProcessing || !agent) return;
        if (lang && lang !== detectedLang) {
          detectedLang = lang;
          console.log(`[twilio/stt] detected language (final): ${lang}`);
        }
        latestStreamingInterim = "";
        streamingFallbackGeneration++;
        if (streamingFallbackTimer) clearTimeout(streamingFallbackTimer);
        streamingFallbackTimer = null;
        console.log(`[twilio/stt/final] "${transcript}"`);
        await runReplyPipeline(transcript);
      },
      onError: (err) => {
        console.error("[twilio/stt/stream] ERROR:", err?.message);
        streamingStt?.close();
        streamingStt = null;
      },
    });
    console.log(
      `[twilio] streaming pipeline enabled provider=${voiceProvider}`,
    );
  }

  async function ensureStreamingStt() {
    if (!STREAMING_PIPELINE || !STREAMING_STT || !agent) return null;
    if (!streamingStt || streamingStt.isClosed?.()) {
      streamingStt = null;
      try {
        await initStreamingPipeline();
      } catch (err) {
        console.error("[twilio/stt/stream] recreate failed:", err?.message);
      }
    }
    return streamingStt;
  }

  // ── Send audio to Twilio ────────────────────────────────────────────────────
  // Google TTS returns raw mulaw 8kHz — send directly, no conversion needed.

  function markBotAudioDone(markName, reason) {
    if (markName) pendingMarks.delete(markName);
    // Only transition to listening when all marks are received
    if (markName && pendingMarks.size > 0) return;
    if (botAudioTimer) clearTimeout(botAudioTimer);
    botAudioTimer = null;
    isBotSpeaking = false;
    pendingMarks.clear();
    if (initialGreetingPending) initialGreetingPending = false;
    console.log(`[twilio] now listening (${reason})`);
    if (STREAMING_PIPELINE && STREAMING_STT && !callEnded) {
      streamingSttPausedForBot = false;
      ensureStreamingStt().catch((err) => {
        console.error("[twilio/stt/stream] resume failed:", err?.message);
      });
    }
  }

  function armBotAudioWatchdog(markName, byteLength) {
    if (botAudioTimer) clearTimeout(botAudioTimer);
    const playbackMs = Math.ceil((byteLength / TWILIO_SAMPLE_RATE) * 1000);
    botAudioTimer = setTimeout(
      () => {
        if (pendingMark === markName) {
          console.warn(`[twilio] mark timeout, listening anyway: ${markName}`);
          markBotAudioDone(markName, "mark-timeout");
        }
      },
      Math.max(playbackMs + 500, 800),
    );
  }

  function sendMulawAudio(mulawBuf) {
    if (!streamSid || ws.readyState !== 1 || !mulawBuf?.length) return;
    if (STREAMING_PIPELINE && STREAMING_STT && streamingStt) {
      streamingSttPausedForBot = true;
      console.log("[twilio/stt/stream] paused for bot audio");
    }
    isBotSpeaking = true;
    const markName = `bot-${++markCounter}`;
    pendingMarks.add(markName);

    const chunks = chunkBuffer(mulawBuf, 640);
    for (const chunk of chunks) {
      if (ws.readyState !== 1) break;
      ws.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: chunk.toString("base64") },
        }),
      );
    }
    ws.send(
      JSON.stringify({
        event: "mark",
        streamSid,
        mark: { name: markName },
      }),
    );
    armBotAudioWatchdog(markName, mulawBuf.length);
    console.log(`[twilio] sent audio, waiting for mark: ${markName}`);
  }

  function sendClear() {
    if (!streamSid || ws.readyState !== 1) return;
    playbackGeneration++;
    activeReplyAbort?.abort();
    activeReplyAbort = null;
    ws.send(JSON.stringify({ event: "clear", streamSid }));
    markBotAudioDone(null, "clear");
  }

  // ── VAD ─────────────────────────────────────────────────────────────────────

  function armVadTimer() {
    if (vadTimer) clearTimeout(vadTimer);
    vadTimer = setTimeout(async () => {
      await finishUtterance("media-gap");
    }, VAD_SILENCE_DURATION);
  }

  async function finishUtterance(reason) {
    if (vadTimer) clearTimeout(vadTimer);
    vadTimer = null;

    console.log(
      `[twilio/vad] finish ${reason}, chunks=${pcmChunks.length} audioMs=${utteranceMs} isProcessing=${isProcessing}`,
    );

    if (STREAMING_PIPELINE && STREAMING_STT && streamingStt) {
      streamingStt.flush();
      if (streamingFallbackTimer) clearTimeout(streamingFallbackTimer);
      const fallbackGen = ++streamingFallbackGeneration;
      streamingFallbackTimer = setTimeout(async () => {
        if (fallbackGen !== streamingFallbackGeneration) return;
        const transcript = latestStreamingInterim?.trim();
        if (!transcript || isProcessing || !agent) return;
        latestStreamingInterim = "";
        console.warn(
          `[twilio/stt/fallback] using interim "${transcript.slice(0, 80)}"`,
        );
        await runReplyPipeline(transcript);
      }, 700);
      pcmChunks = [];
      sttChunks = [];
      utteranceMs = 0;
      silenceMs = 0;
      isSpeaking = false;
      return;
    }

    if (pcmChunks.length === 0 || isProcessing) return;

    const sttBuffer = Buffer.concat(sttChunks.length ? sttChunks : pcmChunks);
    const durationMs = utteranceMs;
    pcmChunks = [];
    sttChunks = [];
    utteranceMs = 0;
    silenceMs = 0;
    isSpeaking = false;

    if (durationMs < MIN_UTTERANCE_MS) {
      console.log(`[twilio/vad] ignored short utterance ${durationMs}ms`);
      return;
    }

    await runPipeline(sttBuffer);
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────────

  function takeReadyTtsChunks(text, force = false, minChars = TTS_MIN_CHARS) {
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

  async function runReplyPipeline(transcript, manageProcessing = true) {
    if (manageProcessing) {
      if (isProcessing || !agent) return;
      isProcessing = true;
    }

    let generation = null;
    let replyAbort = null;
    const t0 = Date.now();
    const activeLang = detectedLang ?? agent.language ?? lang;

    try {
      if (isBotSpeaking) sendClear();
      generation = ++playbackGeneration;
      replyAbort = new AbortController();
      activeReplyAbort = replyAbort;

      history.push({ role: "user", content: transcript });

      let pendingText = "";
      let reply = "";
      let streamedReplyText = "";
      let sentAnyAudio = false;
      let ttsHandled = false;
      let ttsStream = null;
      let ttsStreamFailed = false;
      let ttsQueue = Promise.resolve();

      async function ensureTtsStream() {
        if (ttsStream && !ttsStreamFailed && !ttsStream.isClosed?.())
          return ttsStream;
        if (ttsStreamFailed) return null;
        try {
          ttsStream = await createStreamingTts({
            provider: voiceProvider,
            languageCode: activeLang,
            voiceId: agent.config?.voice_id,
            pace: agent.config?.pace ?? 1.0,
            onMulawAudio: (mulawBuf) => {
              if (
                replyAbort.signal.aborted ||
                generation !== playbackGeneration
              )
                return;
              sentAnyAudio = true;
              console.log(`[twilio/tts/stream] audio bytes=${mulawBuf.length}`);
              sendMulawAudio(mulawBuf);
            },
            onDone: () => console.log("[twilio/tts/stream] done"),
            onError: (err) => {
              ttsStreamFailed = true;
              console.error("[twilio/tts/stream] ERROR:", err?.message);
            },
          });
          console.log(`[twilio/tts/stream] started provider=${voiceProvider}`);
          return ttsStream;
        } catch (err) {
          console.warn("[twilio/tts/stream] unavailable:", err?.message);
          ttsStreamFailed = true;
          return null;
        }
      }

      const enqueueTts = (text) => {
        if (!text?.trim()) return;
        const chunkText = text.trim();

        if (STREAMING_PIPELINE && STREAMING_TTS && !ttsStreamFailed) {
          ttsQueue = ttsQueue.then(async () => {
            if (replyAbort.signal.aborted || generation !== playbackGeneration)
              return;
            const stream = await ensureTtsStream();
            if (stream && !ttsStreamFailed && !stream.isClosed?.()) {
              const accepted = stream.sendText(chunkText);
              if (accepted !== false) {
                ttsHandled = true;
                return;
              }
              ttsStreamFailed = true;
              console.warn(
                "[twilio/tts/stream] rejected, falling back to batch",
              );
            }
            ttsHandled = true;
            console.log(`[twilio/tts/batch] chunk chars=${chunkText.length}`);
            const mulawBuf = await tts({
              text: chunkText,
              languageCode: activeLang,
              voiceId: agent.config?.voice_id,
              pace: agent.config?.pace ?? 1.0,
              sampleRate: TWILIO_SAMPLE_RATE,
              audioEncoding: "MULAW",
              agentConfig: agent.config,
            });
            if (replyAbort.signal.aborted || generation !== playbackGeneration)
              return;
            sentAnyAudio = true;
            sendMulawAudio(mulawBuf);
          });
          return;
        }

        ttsHandled = true;
        ttsQueue = ttsQueue.then(async () => {
          if (replyAbort.signal.aborted || generation !== playbackGeneration)
            return;
          console.log(`[twilio/tts/batch] chunk chars=${chunkText.length}`);
          const mulawBuf = await tts({
            text: chunkText,
            languageCode: activeLang,
            voiceId: agent.config?.voice_id,
            pace: agent.config?.pace ?? 1.0,
            sampleRate: TWILIO_SAMPLE_RATE,
            audioEncoding: "MULAW",
            agentConfig: agent.config,
          });
          if (replyAbort.signal.aborted || generation !== playbackGeneration)
            return;
          sentAnyAudio = true;
          sendMulawAudio(mulawBuf);
        });
      };

      try {
        reply = await streamLLMReply({
          agentId: agent.id,
          history,
          language: activeLang,
          config: agent.config,
          signal: replyAbort.signal,
          onToken: (token) => {
            streamedReplyText += token;
            pendingText += token;
            const ready = takeReadyTtsChunks(
              pendingText,
              false,
              STREAMING_PIPELINE && STREAMING_TTS ? 15 : TTS_MIN_CHARS,
            );
            pendingText = ready.rest;
            ready.chunks.forEach(enqueueTts);
          },
        });

        const finalChunks = takeReadyTtsChunks(pendingText, true);
        finalChunks.chunks.forEach(enqueueTts);
        if (ttsStream) ttsStream.flush();
        await ttsQueue;
        if (!reply?.trim() && streamedReplyText.trim()) {
          reply = streamedReplyText.trim();
        }
      } catch (err) {
        if (err?.name === "AbortError") {
          console.log("[twilio/llm] streamed reply aborted");
          return;
        }
        console.warn(
          "[twilio/llm] streaming failed, falling back:",
          err?.message,
        );
      }

      if (!reply?.trim() && streamedReplyText.trim()) {
        reply = streamedReplyText.trim();
      }

      if (!ttsHandled && !sentAnyAudio) {
        reply = await getLLMReply({
          agentId: agent.id,
          history,
          language: agent.language ?? lang,
          config: agent.config,
        });
        if (!reply?.trim()) throw new Error("LLM returned an empty reply");
        console.log(`[twilio/tts/batch] fallback full chars=${reply.length}`);
        const mulawBuf = await tts({
          text: reply,
          languageCode: activeLang,
          voiceId: agent.config?.voice_id,
          pace: agent.config?.pace ?? 1.0,
          sampleRate: TWILIO_SAMPLE_RATE,
          audioEncoding: "MULAW",
          agentConfig: agent.config,
        });
        sendMulawAudio(mulawBuf);
      }

      console.log(`[twilio/llm] "${reply.slice(0, 80)}"`);
      history = history.slice(-39);
      history.push({ role: "assistant", content: reply });
      console.log(`[twilio/pipeline] reply done in ${Date.now() - t0}ms`);
    } finally {
      if (activeReplyAbort === replyAbort) activeReplyAbort = null;
      if (manageProcessing) isProcessing = false;
    }
  }

  async function runPipeline(sttBuffer) {
    if (isProcessing || !agent) return;
    isProcessing = true;
    const t0 = Date.now();
    const activeLang = detectedLang ?? agent?.language ?? lang;
    console.log(
      `[twilio/pipeline] start, provider=${voiceProvider}, bufSize=${sttBuffer.length}`,
    );

    try {
      if (isBotSpeaking) sendClear();
      // 1. STT
      const sttOptions =
        voiceProvider === "google"
          ? {
              encoding: "MULAW",
              sampleRateHertz: TWILIO_SAMPLE_RATE,
              model: process.env.GOOGLE_STT_MODEL,
            }
          : {};
      const transcript = await stt({
        audioBuffer: sttBuffer,
        languageCode: activeLang,
        mimeType: voiceProvider === "google" ? "audio/basic" : "audio/wav",
        ...sttOptions,
      });
      console.log(`[twilio/stt] "${transcript}"`);

      if (!transcript?.trim()) {
        console.log("[twilio/stt] empty transcript; no LLM turn");
        return;
      }

      await runReplyPipeline(transcript, false);
      console.log(`[twilio/pipeline] stt+reply done in ${Date.now() - t0}ms`);
    } catch (err) {
      console.error("[twilio/pipeline] ERROR:", err?.message);
      try {
        const msg =
          agent?.config?.fallback_message ?? "I am sorry, please try again.";
        const mulawBuf = await tts({
          text: msg,
          languageCode: detectedLang ?? agent?.language ?? lang,
          voiceId: agent?.config?.voice_id,
          sampleRate: TWILIO_SAMPLE_RATE,
          audioEncoding: "MULAW",
          agentConfig: agent?.config,
        });
        sendMulawAudio(mulawBuf);
      } catch (_) {}
    } finally {
      isProcessing = false;
    }
  }

  function appendSpeechFrame(mulawBuf, pcm16k) {
    pcmChunks.push(pcm16k);
    sttChunks.push(voiceProvider === "google" ? mulawBuf : pcm16k);
    utteranceMs += TWILIO_FRAME_MS;
  }

  // ── Message handler ───────────────────────────────────────────────────────────

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        break;

      case "start": {
        streamSid = msg.streamSid ?? msg.start?.streamSid;
        callSid = msg.start?.callSid;
        console.log(
          "[twilio] customParameters:",
          JSON.stringify(msg.start?.customParameters),
        );
        agentId = agentId ?? msg.start?.customParameters?.agent_id;
        callStart = Date.now();

        await loadAgent();
        if (!agent) break;

        console.log(`[twilio] start callSid=${callSid}`);
        initialGreetingPending = true;
        initialGreetingSent = false;

        callLogId = await createCallLog(supabase, {
          callSid,
          agentId,
          clientId: agent.client_id,
          callerNumber: msg.start?.customParameters?.from ?? null,
          direction: "inbound",
        });

        callTimeout = setTimeout(() => {
          handleCallEnd("max_duration").finally(() => {
            if (ws.readyState === 1) ws.close(1000, "max_duration");
          });
        }, MAX_CALL_DURATION_MS);

        // Play greeting — Google TTS returns raw mulaw 8kHz, send directly
        try {
          const istHour = Number(new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            hour12: false
          }).format(new Date()));

          let greetingText = "Good evening";
          if (istHour >= 5 && istHour < 12) {
            greetingText = "Good morning";
          } else if (istHour >= 12 && istHour < 17) {
            greetingText = "Good afternoon";
          }

          const greetingMulaw = await tts({
            text: greetingText,
            languageCode: detectedLang ?? agent.language ?? lang,
            voiceId: agent.config?.voice_id,
            pace: agent.config?.pace ?? 1.0,
            sampleRate: TWILIO_SAMPLE_RATE,
            audioEncoding: "MULAW",
            agentConfig: agent.config,
          });
          isBotSpeaking = true;
          initialGreetingSent = true;
          sendMulawAudio(greetingMulaw);
        } catch (err) {
          console.error("[twilio] greeting error:", err?.message);
          initialGreetingPending = false;
          initialGreetingSent = false;
          isBotSpeaking = false;
          ensureStreamingStt().catch((sttErr) => {
            console.error(
              "[twilio/stt/stream] start after greeting failure failed:",
              sttErr?.message,
            );
          });
        }
        break;
      }

      case "media": {
        const payload = msg.media?.payload;
        if (!payload) break;
        if (!streamSid || !agent) break;
        if (initialGreetingPending && !initialGreetingSent) break;

        // Decode incoming mulaw 8kHz -> PCM for VAD + STT
        const mulawBuf = Buffer.from(payload, "base64");
        const pcm8k = decodeMulaw(mulawBuf);
        const rms = getRMS(pcm8k);
        let sentToStreamingStt = false;

        // Barge-in: caller speech should immediately stop bot playback.
        if (isBotSpeaking) {
          if (rms > BARGE_IN_THRESHOLD) {
            console.log(
              `[twilio/barge-in] caller interrupted, rms=${rms.toFixed(0)}`,
            );
            sendClear();
            pcmChunks = [];
            sttChunks = [];
            utteranceMs = 0;
            silenceMs = 0;
            isSpeaking = true;
            if (STREAMING_PIPELINE && STREAMING_STT) {
              const sttStream = await ensureStreamingStt();
              sttStream?.sendTwilioMulaw(mulawBuf);
              utteranceMs += TWILIO_FRAME_MS;
            } else {
              appendSpeechFrame(mulawBuf, upsample8kTo16k(pcm8k));
            }
            armVadTimer();
          }
          break;
        }

        // Buffer speech frames even while processing so we don't lose utterances
        if (isProcessing) {
          if (STREAMING_PIPELINE && STREAMING_STT) {
            const sttStream = await ensureStreamingStt();
            if (sttStream && !streamingSttPausedForBot) {
              sttStream.sendTwilioMulaw(mulawBuf);
            }
          }
          break;
        }

        if (STREAMING_PIPELINE && STREAMING_STT) {
          const sttStream = await ensureStreamingStt();
          if (sttStream) {
            sentToStreamingStt = sttStream.sendTwilioMulaw(mulawBuf) !== false;
          }

          if (rms > VAD_SILENCE_THRESHOLD) {
            if (!isSpeaking) {
              isSpeaking = true;
              silenceMs = 0;
              console.log(`[twilio/vad] speech started, rms=${rms.toFixed(0)}`);
            }
            silenceMs = 0;
            utteranceMs += TWILIO_FRAME_MS;
            armVadTimer();
          } else if (isSpeaking) {
            utteranceMs += TWILIO_FRAME_MS;
            silenceMs += TWILIO_FRAME_MS;
            if (silenceMs >= VAD_SILENCE_DURATION) {
              await finishUtterance(`silence-${silenceMs}ms`);
            } else {
              armVadTimer();
            }
          }
          if (!sentToStreamingStt)
            console.warn("[twilio/stt/stream] frame not sent");
          break;
        }

        // RMS-based VAD (same as Exotel handler)
        if (rms > VAD_SILENCE_THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            silenceMs = 0;
            console.log(`[twilio/vad] speech started, rms=${rms.toFixed(0)}`);
          }
          silenceMs = 0;
          appendSpeechFrame(mulawBuf, upsample8kTo16k(pcm8k));
          armVadTimer();
        } else if (isSpeaking) {
          appendSpeechFrame(mulawBuf, upsample8kTo16k(pcm8k));
          silenceMs += TWILIO_FRAME_MS;
          if (silenceMs >= VAD_SILENCE_DURATION) {
            await finishUtterance(`silence-${silenceMs}ms`);
          } else {
            armVadTimer();
          }
        }
        break;
      }

      case "dtmf":
        console.log(`[twilio/dtmf] ${msg.dtmf?.digit}`);
        break;

      case "mark":
        if (msg.mark?.name?.startsWith("bot-"))
          markBotAudioDone(msg.mark?.name, `mark:${msg.mark?.name}`);
        break;

      case "stop":
        await handleCallEnd("callended");
        break;
    }
  });

  // ── Call end ──────────────────────────────────────────────────────────────────

  async function handleCallEnd(reason) {
    if (callEnded) return;
    callEnded = true;

    if (callTimeout) clearTimeout(callTimeout);
    if (vadTimer) clearTimeout(vadTimer);
    if (botAudioTimer) clearTimeout(botAudioTimer);
    streamingStt?.close();
    streamingStt = null;
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
