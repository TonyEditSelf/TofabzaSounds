import WebSocket from "ws";
import speech from "@google-cloud/speech";
import textToSpeech from "@google-cloud/text-to-speech";
import { normalizeLanguageCode } from "./provider.js";

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const SARVAM_STT_SAMPLE_RATE =
  Number.parseInt(process.env.SARVAM_STT_SAMPLE_RATE ?? "8000", 10) || 8000;
const SARVAM_TTS_DONE_TIMEOUT_MS =
  Number.parseInt(process.env.SARVAM_TTS_DONE_TIMEOUT_MS ?? "3000", 10) ||
  3000;

const _parsedGoogleCredentials = (() => {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) return undefined;
  const parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key?.replace(/\\n/g, "\n"),
  };
})();

function googleCredentials() {
  return _parsedGoogleCredentials;
}

let _speechClient = null;
function getSpeechClient() {
  if (!_speechClient) {
    _speechClient = new speech.SpeechClient({
      credentials: googleCredentials(),
    });
  }
  return _speechClient;
}

let _ttsClient = null;
function getTextToSpeechClient() {
  if (!_ttsClient) {
    _ttsClient = new textToSpeech.v1.TextToSpeechClient({
      credentials: googleCredentials(),
    });
  }
  return _ttsClient;
}

function mulawToLinear(mulaw) {
  mulaw = ~mulaw;
  const sign = mulaw & 0x80;
  const exp = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exp;
  return sign ? 0x84 - sample : sample - 0x84;
}

function decodeMulaw(buf) {
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    pcm.writeInt16LE(mulawToLinear(buf[i]), i * 2);
  }
  return pcm;
}

function linearToMulaw(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = 0;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  sample = Math.min(sample, CLIP) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent--;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function downsampleLinear16(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm;
  const inSamples = Math.floor(pcm.length / 2);
  const outSamples = Math.floor((inSamples * toRate) / fromRate);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const src = Math.min(inSamples - 1, Math.floor((i * fromRate) / toRate));
    out.writeInt16LE(pcm.readInt16LE(src * 2), i * 2);
  }
  return out;
}

function linear16ToMulaw(pcm, sampleRate = 8000) {
  const pcm8k = downsampleLinear16(pcm, sampleRate, 8000);
  const out = Buffer.alloc(Math.floor(pcm8k.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = linearToMulaw(pcm8k.readInt16LE(i * 2));
  }
  return out;
}

function openWs(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function sendJson(socket, payload, onError) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload), (err) => {
      if (err) onError?.(err);
    });
    return true;
  } catch (err) {
    onError?.(err);
    return false;
  }
}

function resolveGoogleStreamingVoice(languageCode, voiceId) {
  const language = normalizeLanguageCode(languageCode);
  if (voiceId?.startsWith(`${language}-Chirp3-HD-`)) {
    return voiceId;
  }
  throw new Error(`Google streaming TTS unavailable for voice "${voiceId}"`);
}

export async function createStreamingStt({
  provider,
  languageCode,
  onFinalTranscript,
  onInterimTranscript,
  onError,
}) {
  const language = normalizeLanguageCode(languageCode);
  if (provider === "google") {
    const client = getSpeechClient();
    let closed = false;
    const stream = client
      .streamingRecognize({
        config: {
          encoding: "MULAW",
          sampleRateHertz: 8000,
          languageCode: language,
          alternativeLanguageCodes: [
            "en-IN",
            "hi-IN",
            "ml-IN",
            "ta-IN",
            "kn-IN",
            "te-IN",
            "mr-IN",
          ].filter((l) => l !== language),
          enableAutomaticPunctuation: true,
          model: process.env.GOOGLE_STT_MODEL,
        },
        interimResults: true,
        singleUtterance: false,
      })
      .on("error", (err) => {
        closed = true;
        onError?.(err);
      })
      .on("close", () => {
        closed = true;
      })
      .on("data", (data) => {
        const result = data.results?.[0];
        const transcript = result?.alternatives?.[0]?.transcript ?? "";
        if (!transcript.trim()) return;
        const detectedLanguage = result?.languageCode ?? null;
        if (result.isFinal) onFinalTranscript?.(transcript, detectedLanguage);
        else onInterimTranscript?.(transcript, detectedLanguage);
      });

    return {
      sendTwilioMulaw: (mulawBuf) => {
        if (closed || stream.destroyed) return false;
        try {
          stream.write(mulawBuf);
          return true;
        } catch (err) {
          closed = true;
          onError?.(err);
          return false;
        }
      },
      flush: () => {},
      isClosed: () => closed || stream.destroyed,
      close: () => {
        closed = true;
        stream.destroy();
      },
    };
  }

  if (provider === "sarvam") {
    if (!SARVAM_API_KEY) throw new Error("SARVAM_API_KEY is not set");
    const params = new URLSearchParams({
      "language-code": language,
      model: process.env.SARVAM_STT_MODEL ?? "saaras:v3",
      mode: process.env.SARVAM_STT_MODE ?? "transcribe",
      sample_rate: String(SARVAM_STT_SAMPLE_RATE),
      input_audio_codec: "pcm_s16le",
      high_vad_sensitivity: "true",
      vad_signals: "true",
      flush_signal: "true",
    });
    const socket = await openWs(
      `wss://api.sarvam.ai/speech-to-text/ws?${params.toString()}`,
      { "Api-Subscription-Key": SARVAM_API_KEY },
    );

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      const transcript =
        msg?.data?.transcript ??
        msg?.data?.translation ??
        msg?.transcript ??
        msg?.translation ??
        "";
      const detectedLanguage =
        msg?.data?.language_code ??
        msg?.data?.languageCode ??
        msg?.language_code ??
        msg?.languageCode ??
        null;
      const type = String(msg?.type ?? "").toLowerCase();
      if (type === "error" || msg?.error) {
        onError?.(new Error(msg?.error?.message ?? msg?.message ?? "Sarvam STT error"));
        return;
      }
      if (transcript.trim()) {
        onFinalTranscript?.(
          transcript,
          detectedLanguage ? normalizeLanguageCode(detectedLanguage) : null,
        );
      }
    });
    socket.on("error", (err) => onError?.(err));

    return {
      sendTwilioMulaw: (mulawBuf) => {
        const pcm = decodeMulaw(mulawBuf);
        return sendJson(
          socket,
          {
            audio: {
              data: pcm.toString("base64"),
              sample_rate: SARVAM_STT_SAMPLE_RATE,
              encoding: "pcm_s16le",
            },
          },
          onError,
        );
      },
      flush: () => {
        sendJson(socket, { type: "flush" }, onError);
      },
      isClosed: () => socket.readyState !== WebSocket.OPEN,
      close: () => socket.close(),
    };
  }

  throw new Error(`Unsupported streaming STT provider: ${provider}`);
}

export async function createStreamingTts({
  provider,
  languageCode,
  voiceId,
  pace = 1.0,
  onMulawAudio,
  onDone,
  onError,
}) {
  const language = normalizeLanguageCode(languageCode);
  if (provider === "google") {
    const client = getTextToSpeechClient();
    const streamingVoice = resolveGoogleStreamingVoice(language, voiceId);
    console.log(`[google/tts/stream] voice=${streamingVoice}`);

    let stream = null;
    let closed = false;
    let configSent = false;

    function openStream() {
      if (stream) return stream;
      stream = client.streamingSynthesize();
      stream.on("data", (data) => {
        if (data.audioContent?.length) {
          onMulawAudio?.(
            linear16ToMulaw(Buffer.from(data.audioContent), 24000),
          );
        }
      });
      stream.on("end", () => {
        closed = true;
        onDone?.();
      });
      stream.on("close", () => {
        closed = true;
      });
      stream.on("error", (err) => {
        closed = true;
        onError?.(err);
      });
      return stream;
    }

    return {
      sendText: (text) => {
        if (closed) return false;
        try {
          const s = openStream();
          if (s.destroyed) {
            closed = true;
            return false;
          }
          if (!configSent) {
            configSent = true;
            s.write({
              streamingConfig: {
                voice: { languageCode: language, name: streamingVoice },
                streamingAudioConfig: {
                  audioEncoding: "PCM",
                  sampleRateHertz: 24000,
                },
              },
            });
          }
          s.write({ input: { text } });
          return true;
        } catch (err) {
          closed = true;
          onError?.(err);
          return false;
        }
      },
      flush: () => {
        if (stream && !closed && !stream.destroyed) stream.end();
      },
      isClosed: () => closed || (stream ? stream.destroyed : false),
      close: () => {
        closed = true;
        stream?.destroy();
      },
    };
  }

  if (provider === "sarvam") {
    if (!SARVAM_API_KEY) throw new Error("SARVAM_API_KEY is not set");
    const params = new URLSearchParams({
      model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
      send_completion_event: "true",
    });
    const socket = await openWs(
      `wss://api.sarvam.ai/text-to-speech/ws?${params.toString()}`,
      { "Api-Subscription-Key": SARVAM_API_KEY },
    );
    let doneResolved = false;
    let doneResolver = null;
    let doneTimer = null;

    function resolveDone() {
      if (doneResolved) return;
      doneResolved = true;
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = null;
      doneResolver?.();
      onDone?.();
    }

    function waitForDone() {
      if (doneResolved) return Promise.resolve();
      return new Promise((resolve) => {
        doneResolver = resolve;
        if (doneTimer) clearTimeout(doneTimer);
        doneTimer = setTimeout(resolveDone, SARVAM_TTS_DONE_TIMEOUT_MS);
      });
    }

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      const audio = msg?.data?.audio ?? msg?.audio ?? msg?.data?.audio_base64;
      if (audio) onMulawAudio?.(Buffer.from(audio, "base64"));
      const eventType = msg?.data?.event_type ?? msg?.event_type;
      if (eventType === "final") resolveDone();
    });
    socket.on("error", (err) => onError?.(err));
    socket.on("close", resolveDone);

    sendJson(
      socket,
      {
        type: "config",
        data: {
          speaker: voiceId,
          target_language_code: language,
          pace,
          min_buffer_size: 35,
          max_chunk_length: 140,
          output_audio_codec: "mulaw",
        },
      },
      onError,
    );

    return {
      sendText: (text) => {
        return sendJson(socket, { type: "text", data: { text } }, onError);
      },
      flush: () => {
        sendJson(socket, { type: "flush" }, onError);
        return waitForDone();
      },
      isClosed: () => socket.readyState !== WebSocket.OPEN,
      close: () => socket.close(),
    };
  }

  throw new Error(`Unsupported streaming TTS provider: ${provider}`);
}
