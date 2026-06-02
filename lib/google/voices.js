/**
 * lib/google/voices.js
 *
 * Google Cloud TTS voices for Indian languages.
 * Only WaveNet, Neural2, and Chirp3-HD included — best quality/latency balance.
 * Standard voices omitted (robotic, not useful for voice AI).
 */

export const GOOGLE_VOICES = [
  // ── Malayalam ──────────────────────────────────────────────────────────────
  {
    id: "ml-IN-Wavenet-A",
    name: "Priya (WaveNet)",
    gender: "Female",
    language: "ml-IN",
    tier: "wavenet",
  },
  {
    id: "ml-IN-Wavenet-B",
    name: "Arjun (WaveNet)",
    gender: "Male",
    language: "ml-IN",
    tier: "wavenet",
  },
  {
    id: "ml-IN-Wavenet-C",
    name: "Kiran (WaveNet)",
    gender: "Male",
    language: "ml-IN",
    tier: "wavenet",
  },
  {
    id: "ml-IN-Wavenet-D",
    name: "Nila (WaveNet)",
    gender: "Female",
    language: "ml-IN",
    tier: "wavenet",
  },

  // ── Hindi ──────────────────────────────────────────────────────────────────
  {
    id: "hi-IN-Wavenet-A",
    name: "Asha (WaveNet)",
    gender: "Female",
    language: "hi-IN",
    tier: "wavenet",
  },
  {
    id: "hi-IN-Wavenet-B",
    name: "Raj (WaveNet)",
    gender: "Male",
    language: "hi-IN",
    tier: "wavenet",
  },
  {
    id: "hi-IN-Wavenet-C",
    name: "Vikram (WaveNet)",
    gender: "Male",
    language: "hi-IN",
    tier: "wavenet",
  },
  {
    id: "hi-IN-Wavenet-D",
    name: "Meera (WaveNet)",
    gender: "Female",
    language: "hi-IN",
    tier: "wavenet",
  },
  {
    id: "hi-IN-Neural2-A",
    name: "Asha (Neural2)",
    gender: "Female",
    language: "hi-IN",
    tier: "neural2",
  },
  {
    id: "hi-IN-Neural2-B",
    name: "Raj (Neural2)",
    gender: "Male",
    language: "hi-IN",
    tier: "neural2",
  },
  {
    id: "hi-IN-Neural2-C",
    name: "Vikram (Neural2)",
    gender: "Male",
    language: "hi-IN",
    tier: "neural2",
  },
  {
    id: "hi-IN-Neural2-D",
    name: "Meera (Neural2)",
    gender: "Female",
    language: "hi-IN",
    tier: "neural2",
  },

  // ── English India ──────────────────────────────────────────────────────────
  {
    id: "en-IN-Wavenet-A",
    name: "Ananya (WaveNet)",
    gender: "Female",
    language: "en-IN",
    tier: "wavenet",
  },
  {
    id: "en-IN-Wavenet-B",
    name: "Rohan (WaveNet)",
    gender: "Male",
    language: "en-IN",
    tier: "wavenet",
  },
  {
    id: "en-IN-Wavenet-C",
    name: "Dev (WaveNet)",
    gender: "Male",
    language: "en-IN",
    tier: "wavenet",
  },
  {
    id: "en-IN-Wavenet-D",
    name: "Kavya (WaveNet)",
    gender: "Female",
    language: "en-IN",
    tier: "wavenet",
  },
  {
    id: "en-IN-Neural2-A",
    name: "Ananya (Neural2)",
    gender: "Female",
    language: "en-IN",
    tier: "neural2",
  },
  {
    id: "en-IN-Neural2-B",
    name: "Rohan (Neural2)",
    gender: "Male",
    language: "en-IN",
    tier: "neural2",
  },
  {
    id: "en-IN-Neural2-C",
    name: "Dev (Neural2)",
    gender: "Male",
    language: "en-IN",
    tier: "neural2",
  },
  {
    id: "en-IN-Neural2-D",
    name: "Kavya (Neural2)",
    gender: "Female",
    language: "en-IN",
    tier: "neural2",
  },

  // ── Tamil ──────────────────────────────────────────────────────────────────
  {
    id: "ta-IN-Wavenet-A",
    name: "Kavitha (WaveNet)",
    gender: "Female",
    language: "ta-IN",
    tier: "wavenet",
  },
  {
    id: "ta-IN-Wavenet-B",
    name: "Surya (WaveNet)",
    gender: "Male",
    language: "ta-IN",
    tier: "wavenet",
  },
  {
    id: "ta-IN-Wavenet-C",
    name: "Arun (WaveNet)",
    gender: "Male",
    language: "ta-IN",
    tier: "wavenet",
  },
  {
    id: "ta-IN-Wavenet-D",
    name: "Divya (WaveNet)",
    gender: "Female",
    language: "ta-IN",
    tier: "wavenet",
  },

  // ── Telugu ─────────────────────────────────────────────────────────────────
  {
    id: "te-IN-Standard-A",
    name: "Sita (Standard)",
    gender: "Female",
    language: "te-IN",
    tier: "standard",
  },
  {
    id: "te-IN-Standard-B",
    name: "Ravi (Standard)",
    gender: "Male",
    language: "te-IN",
    tier: "standard",
  },

  // ── Kannada ────────────────────────────────────────────────────────────────
  {
    id: "kn-IN-Wavenet-A",
    name: "Geetha (WaveNet)",
    gender: "Female",
    language: "kn-IN",
    tier: "wavenet",
  },
  {
    id: "kn-IN-Wavenet-B",
    name: "Suresh (WaveNet)",
    gender: "Male",
    language: "kn-IN",
    tier: "wavenet",
  },
  {
    id: "kn-IN-Wavenet-C",
    name: "Mohan (WaveNet)",
    gender: "Male",
    language: "kn-IN",
    tier: "wavenet",
  },
  {
    id: "kn-IN-Wavenet-D",
    name: "Lakshmi (WaveNet)",
    gender: "Female",
    language: "kn-IN",
    tier: "wavenet",
  },

  // ── Bengali ────────────────────────────────────────────────────────────────
  {
    id: "bn-IN-Wavenet-A",
    name: "Puja (WaveNet)",
    gender: "Female",
    language: "bn-IN",
    tier: "wavenet",
  },
  {
    id: "bn-IN-Wavenet-B",
    name: "Arnab (WaveNet)",
    gender: "Male",
    language: "bn-IN",
    tier: "wavenet",
  },

  // ── Gujarati ───────────────────────────────────────────────────────────────
  {
    id: "gu-IN-Wavenet-A",
    name: "Isha (WaveNet)",
    gender: "Female",
    language: "gu-IN",
    tier: "wavenet",
  },
  {
    id: "gu-IN-Wavenet-B",
    name: "Nikhil (WaveNet)",
    gender: "Male",
    language: "gu-IN",
    tier: "wavenet",
  },
  {
    id: "gu-IN-Wavenet-C",
    name: "Vivek (WaveNet)",
    gender: "Male",
    language: "gu-IN",
    tier: "wavenet",
  },
  {
    id: "gu-IN-Wavenet-D",
    name: "Pooja (WaveNet)",
    gender: "Female",
    language: "gu-IN",
    tier: "wavenet",
  },

  // ── Marathi ────────────────────────────────────────────────────────────────
  {
    id: "mr-IN-Wavenet-A",
    name: "Sunita (WaveNet)",
    gender: "Female",
    language: "mr-IN",
    tier: "wavenet",
  },
  {
    id: "mr-IN-Wavenet-B",
    name: "Prakash (WaveNet)",
    gender: "Male",
    language: "mr-IN",
    tier: "wavenet",
  },
  {
    id: "mr-IN-Wavenet-C",
    name: "Santosh (WaveNet)",
    gender: "Male",
    language: "mr-IN",
    tier: "wavenet",
  },
];

/** Get voices filtered by language code */
export function getGoogleVoices(languageCode) {
  return GOOGLE_VOICES.filter((v) => v.language === languageCode);
}
