import { getSettings } from "../settings.js";
import { googleTextToSpeech } from "../google/tts.js";
import { googleSpeechToText } from "../google/stt.js";
import {
  textToSpeech as sarvamTTS,
  speechToText as sarvamSTT,
} from "../sarvam/client.js";

/**
 * Unified voice provider facade.
 * Delegates to Google or Sarvam based on settings.voice_provider.
 *
 * Exports:
 *   - tts(text, voiceId, sampleRate)
 *   - stt(audioBuffer, opts)
 */

export async function tts({
  text,
  languageCode,
  voiceId,
  pace = 1.0,
  sampleRate = 16000,
}) {
  const settings = await getSettings();
  const provider = settings.voice_provider || "sarvam";

  if (provider === "google") {
    return googleTextToSpeech({
      text,
      voiceName: voiceId || settings.google_default_voice,
      languageCode: languageCode || settings.google_default_language,
      speakingRate: pace,
    });
  }

  // Sarvam (default)
  return sarvamTTS({
    text,
    languageCode: languageCode || settings.sarvam_default_language,
    speaker: voiceId || settings.sarvam_default_voice,
    pace,
    speechSampleRate: sampleRate,
  });
}

export async function stt({ audioBuffer, languageCode }) {
  const settings = await getSettings();
  const provider = settings.voice_provider || "sarvam";

  if (provider === "google") {
    return googleSpeechToText({
      audioBuffer,
      languageCode: languageCode || settings.google_default_language,
    });
  }

  // Sarvam (default)
  return sarvamSTT({
    audioBuffer,
    mimeType: "audio/webm",
    languageCode: languageCode || settings.sarvam_default_language,
  }).then((r) => r.transcript);
}
