/**
 * telephony-server/src/lib/audio.js
 *
 * Audio utilities shared across pipeline.
 */

/**
 * Strip WAV header from a WAV buffer, returning raw PCM s16le.
 * Scans for "data" marker — handles non-standard chunk orders.
 *
 * @param {Buffer} wavBuffer
 * @returns {Buffer} raw PCM
 */
export function stripWavHeader(wavBuffer) {
  const dataMarker = wavBuffer.indexOf(Buffer.from("data"));
  if (dataMarker === -1) return wavBuffer; // assume already raw PCM
  // After "data": 4 bytes chunk size, then PCM starts
  return wavBuffer.subarray(dataMarker + 8);
}

/**
 * Split PCM buffer into fixed-size chunks.
 * Exotel requires chunks that are multiples of 320 bytes.
 * Default 3200 = 100ms at 16kHz mono s16le.
 *
 * @param {Buffer} pcmBuffer
 * @param {number} chunkSize - must be multiple of 320
 * @returns {Buffer[]}
 */
export function chunkPcm(pcmBuffer, chunkSize = 3200) {
  const chunks = [];
  for (let offset = 0; offset < pcmBuffer.length; offset += chunkSize) {
    chunks.push(pcmBuffer.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

/**
 * Convert PCM from 8kHz to 16kHz by simple upsampling (duplicate each sample).
 * Used if Sarvam TTS is set to 8kHz but Exotel expects 16kHz.
 *
 * @param {Buffer} pcm8k
 * @returns {Buffer} pcm16k
 */
export function upsample8kTo16k(pcm8k) {
  const out = Buffer.alloc(pcm8k.length * 2);
  for (let i = 0; i < pcm8k.length - 1; i += 2) {
    const sample = pcm8k.readInt16LE(i);
    out.writeInt16LE(sample, i * 2);
    out.writeInt16LE(sample, i * 2 + 2);
  }
  return out;
}
