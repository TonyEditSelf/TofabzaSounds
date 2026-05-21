export const BULBUL_V3_SPEAKERS = [
  // Female
  { id: "ritu", name: "Ritu", gender: "female" },
  { id: "priya", name: "Priya", gender: "female" },
  { id: "neha", name: "Neha", gender: "female" },
  { id: "pooja", name: "Pooja", gender: "female" },
  { id: "simran", name: "Simran", gender: "female" },
  { id: "kavya", name: "Kavya", gender: "female" },
  { id: "ishita", name: "Ishita", gender: "female" },
  { id: "shreya", name: "Shreya", gender: "female" },
  { id: "roopa", name: "Roopa", gender: "female" },
  { id: "tanya", name: "Tanya", gender: "female" },
  { id: "shruti", name: "Shruti", gender: "female" },
  { id: "suhani", name: "Suhani", gender: "female" },
  { id: "kavitha", name: "Kavitha", gender: "female" },
  { id: "rupali", name: "Rupali", gender: "female" },
  // Male
  { id: "shubh", name: "Shubh", gender: "male" },
  { id: "aditya", name: "Aditya", gender: "male" },
  { id: "rahul", name: "Rahul", gender: "male" },
  { id: "rohan", name: "Rohan", gender: "male" },
  { id: "amit", name: "Amit", gender: "male" },
  { id: "dev", name: "Dev", gender: "male" },
  { id: "ratan", name: "Ratan", gender: "male" },
  { id: "varun", name: "Varun", gender: "male" },
  { id: "manan", name: "Manan", gender: "male" },
  { id: "sumit", name: "Sumit", gender: "male" },
  { id: "kabir", name: "Kabir", gender: "male" },
  { id: "aayan", name: "Aayan", gender: "male" },
  { id: "ashutosh", name: "Ashutosh", gender: "male" },
  { id: "advait", name: "Advait", gender: "male" },
  { id: "anand", name: "Anand", gender: "male" },
  { id: "tarun", name: "Tarun", gender: "male" },
  { id: "sunny", name: "Sunny", gender: "male" },
  { id: "mani", name: "Mani", gender: "male" },
  { id: "gokul", name: "Gokul", gender: "male" },
  { id: "vijay", name: "Vijay", gender: "male" },
  { id: "mohit", name: "Mohit", gender: "male" },
  { id: "rehan", name: "Rehan", gender: "male" },
  { id: "soham", name: "Soham", gender: "male" },
];

/**
 * Languages supported by Bulbul v3 TTS.
 * 11 languages — a subset of Saaras v3 STT (which supports 23).
 * Only create agents/widgets in these languages.
 */
export const TTS_SUPPORTED_LANGUAGES = [
  { code: "ml-IN", name: "Malayalam" }, // ← list first (priority for this platform)
  { code: "hi-IN", name: "Hindi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
  { code: "kn-IN", name: "Kannada" },
  { code: "bn-IN", name: "Bengali" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "mr-IN", name: "Marathi" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "od-IN", name: "Odia" },
  { code: "en-IN", name: "English (India)" },
];

/**
 * All languages supported by Saaras v3 STT (23 total).
 * Used only for STT-only features (transcript display, analytics).
 */
export const STT_SUPPORTED_LANGUAGES = [
  ...TTS_SUPPORTED_LANGUAGES,
  { code: "as-IN", name: "Assamese" },
  { code: "ur-IN", name: "Urdu" },
  { code: "ne-IN", name: "Nepali" },
  { code: "kok-IN", name: "Konkani" },
  { code: "ks-IN", name: "Kashmiri" },
  { code: "sd-IN", name: "Sindhi" },
  { code: "sa-IN", name: "Sanskrit" },
  { code: "sat-IN", name: "Santali" },
  { code: "mni-IN", name: "Manipuri" },
  { code: "brx-IN", name: "Bodo" },
  { code: "mai-IN", name: "Maithili" },
  { code: "doi-IN", name: "Dogri" },
];

/**
 * Pace values for Bulbul v3.
 * Range: 0.5–2.0. Values outside this range are rejected by the API.
 */
export const PACE_OPTIONS = [
  { label: "0.5×", value: 0.5 },
  { label: "0.75×", value: 0.75 },
  { label: "1× (Normal)", value: 1.0 },
  { label: "1.25×", value: 1.25 },
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2.0 },
];

/** Returns speakers filtered by gender. */
export function getSpeakersByGender(gender) {
  return BULBUL_V3_SPEAKERS.filter((s) => s.gender === gender);
}

/** Returns speaker by ID, or null if not found. */
export function getSpeakerById(id) {
  return BULBUL_V3_SPEAKERS.find((s) => s.id === id) || null;
}

/** Default speaker used when none is specified. */
export const DEFAULT_SPEAKER = "shubh";
