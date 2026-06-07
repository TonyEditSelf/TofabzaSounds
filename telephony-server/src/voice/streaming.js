import WebSocket from "ws";

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function googleCredentials() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) return undefined;
  const parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key?.replace(/\\n/g, "\n"),
  };
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

export async function createStreamingStt({
  provider,
  languageCode,
  onFinalTranscript,
  onInterimTranscript,
  onError,
}) {
  if (provider === "google") {
    const speech = await import("@google-cloud/speech");
    const client = new speech.SpeechClient({ credentials: googleCredentials() });
    let closed = false;
    const stream = client
      .streamingRecognize({
        config: {
          encoding: "MULAW",
          sampleRateHertz: 8000,
          languageCode,
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
        if (result.isFinal) onFinalTranscript?.(transcript);
        else onInterimTranscript?.(transcript);
      });

    return {
      sendTwilioMulaw: (mulawBuf) => {
        if (closed || stream.destroyed || !stream.writable) return false;
        try {
          return stream.write(mulawBuf);
        } catch (err) {
          closed = true;
          onError?.(err);
          return false;
        }
      },
      flush: () => {},
      isClosed: () => closed || stream.destroyed || !stream.writable,
      close: () => {
        closed = true;
        stream.destroy();
      },
    };
  }

  if (provider === "sarvam") {
    const params = new URLSearchParams({
      "language-code": languageCode,
      model: process.env.SARVAM_STT_MODEL ?? "saaras:v3",
      mode: process.env.SARVAM_STT_MODE ?? "transcribe",
      sample_rate: "8000",
      input_audio_codec: "pcm_s16le",
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
      const transcript = msg?.data?.transcript ?? msg?.transcript ?? "";
      if (transcript.trim()) onFinalTranscript?.(transcript);
    });
    socket.on("error", (err) => onError?.(err));

    return {
      sendTwilioMulaw: (mulawBuf) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            audio: {
              data: decodeMulaw(mulawBuf).toString("base64"),
              sample_rate: 8000,
              encoding: "pcm_s16le",
            },
          }),
        );
      },
      flush: () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "flush" }));
        }
      },
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
  if (provider === "google") {
    const textToSpeech = await import("@google-cloud/text-to-speech");
    const client = new textToSpeech.v1.TextToSpeechClient({
      credentials: googleCredentials(),
    });
    const stream = await client.streamingSynthesize();
    stream.on("data", (data) => {
      if (data.audioContent?.length) {
        onMulawAudio?.(linear16ToMulaw(Buffer.from(data.audioContent), 24000));
      }
    });
    stream.on("end", () => onDone?.());
    stream.on("error", (err) => onError?.(err));
    stream.write({
      streamingConfig: {
        voice: {
          languageCode,
          name: voiceId ?? process.env.GOOGLE_STREAMING_VOICE ?? "ml-IN-Chirp3-HD-Aoede",
        },
        streamingAudioConfig: {
          audioEncoding: "LINEAR16",
        },
      },
    });

    return {
      sendText: (text) => stream.write({ input: { text } }),
      flush: () => stream.end(),
      close: () => stream.destroy(),
    };
  }

  if (provider === "sarvam") {
    const params = new URLSearchParams({
      model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
      send_completion_event: "true",
    });
    const socket = await openWs(
      `wss://api.sarvam.ai/text-to-speech/ws?${params.toString()}`,
      { "Api-Subscription-Key": SARVAM_API_KEY },
    );
    socket.send(
      JSON.stringify({
        type: "config",
        data: {
          speaker: voiceId ?? process.env.SARVAM_DEFAULT_VOICE ?? "anand",
          target_language_code: languageCode,
          pace,
          min_buffer_size: 35,
          max_chunk_length: 140,
          output_audio_codec: "mulaw",
        },
      }),
    );

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
      if (eventType === "final") onDone?.();
    });
    socket.on("error", (err) => onError?.(err));

    return {
      sendText: (text) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "text", data: { text } }));
        }
      },
      flush: () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "flush" }));
        }
      },
      close: () => socket.close(),
    };
  }

  throw new Error(`Unsupported streaming TTS provider: ${provider}`);
}
