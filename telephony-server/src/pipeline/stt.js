/**
 * telephony-server/src/pipeline/stt.js
 *
 * Sends raw PCM buffer to Sarvam Saaras v3 REST STT.
 * Input: raw s16le PCM at 16kHz mono (from Exotel)
 * Output: transcript string
 */

import FormData from "form-data";
import axios from "axios";

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const TIMEOUT_MS = 8000;

/**
 * Convert raw PCM s16le to WAV buffer (adds 44-byte header).
 * Sarvam accepts WAV — this avoids needing ffmpeg.
 *
 * @param {Buffer} pcm       - Raw s16le samples
 * @param {number} sampleRate - Default 16000
 * @returns {Buffer} WAV buffer
 */
function pcmToWav(pcm, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * @param {Buffer} pcmBuffer  - Raw PCM s16le 16kHz mono
 * @param {string} languageCode - BCP-47 e.g. "ml-IN"
 * @returns {Promise<string>} transcript
 */
export async function transcribeAudio(pcmBuffer, languageCode = "ml-IN") {
  if (!pcmBuffer || pcmBuffer.length < 3200) return ""; // too short

  const wavBuffer = pcmToWav(pcmBuffer);

  const form = new FormData();
  form.append("file", wavBuffer, {
    filename: "audio.wav",
    contentType: "audio/wav",
  });
  form.append("model", "saaras:v3");
  form.append("mode", "transcribe");
  // Don't lock language — let Sarvam auto-detect for multilingual support
  // form.append("language_code", languageCode);

  try {
    const res = await axios.post(SARVAM_STT_URL, form, {
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        ...form.getHeaders(),
      },
      timeout: TIMEOUT_MS,
    });

    return res.data?.transcript ?? "";
  } catch (err) {
    console.error("[stt] Failed:", err?.response?.data ?? err?.message);
    return "";
  }
}
