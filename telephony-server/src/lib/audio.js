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
  // Only scan the first 200 bytes — WAV headers are at most 100 bytes.
  // Scanning the whole buffer risks false-matching PCM data that contains 0x64617461.
  const dataMarker = wavBuffer.subarray(0, 200).indexOf(Buffer.from("data"));
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

/**
 * Create a WAV file (with header) from a raw PCM s16le buffer.
 */
export function addWavHeader(pcmBuffer, sampleRate = 8000, numChannels = 1) {
  const wavHeader = Buffer.alloc(44);
  const totalDataLen = pcmBuffer.length;
  const totalAudioLen = totalDataLen + 36;
  const byteRate = sampleRate * numChannels * 2;

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(totalAudioLen, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
  wavHeader.writeUInt16LE(1, 20); // AudioFormat (PCM)
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(numChannels * 2, 32); // BlockAlign
  wavHeader.writeUInt16LE(16, 34); // BitsPerSample
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(totalDataLen, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}
