"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { BULBUL_V3_SPEAKERS } from "@/lib/sarvam/voices";
import { GOOGLE_VOICES } from "@/lib/google/voices";
import { useUIStore } from "@/store/ui";

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "ml-IN", label: "Malayalam" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-IN", label: "English (India)" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "kn-IN", label: "Kannada" },
  { code: "mr-IN", label: "Marathi" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "bn-IN", label: "Bengali" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "or-IN", label: "Odia" },
];

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const GENDERS = ["All", "Male", "Female"];

const TIER_LABELS = {
  wavenet: "WaveNet",
  neural2: "Neural2",
  standard: "Standard",
  chirp3: "Chirp 3",
};

const DEFAULT_TEXTS = {
  "ml-IN": "നമസ്കാരം, ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
  "hi-IN": "नमस्ते, मैं आपकी कैसे मदद कर सकता हूँ?",
  "en-IN": "Hello, how can I help you today?",
  "ta-IN": "வணக்கம், நான் உங்களுக்கு எப்படி உதவலாம்?",
  "te-IN": "నమస్కారం, నేను మీకు ఎలా సహాయం చేయగలను?",
  "kn-IN": "ನಮಸ್ಕಾರ, ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
  "mr-IN": "नमस्कार, मी तुम्हाला कसे मदत करू शकतो?",
  "gu-IN": "નમસ્તે, હું તમને કેવી રીતે મદદ કરી શકું?",
  "bn-IN": "নমস্কার, আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
  "od-IN": "ନମସ୍କାର, ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?",
};

// ─── AudioContext singleton ───────────────────────────────────────────────────

let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx)
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
async function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

// ─── Waveform canvas ──────────────────────────────────────────────────────────

function Waveform({ analyserRef, playing }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    if (!playing || reducedMotion || isMobile || !analyserRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.strokeStyle = "var(--saffron-500)";
      ctx.lineWidth = 2;
      const sliceW = canvas.width / bufLen;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0;
        const y = (v * canvas.height) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.stroke();
    }
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  if (reducedMotion || isMobile) {
    return (
      <div
        style={{
          height: "40px",
          display: "flex",
          alignItems: "center",
          gap: "2px",
        }}
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: "3px",
              borderRadius: "2px",
              height: `${8 + Math.random() * 24}px`,
              background: playing ? "var(--saffron-500)" : "var(--border)",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      style={{ display: "block", borderRadius: "4px" }}
    />
  );
}

// ─── Voice Card ───────────────────────────────────────────────────────────────

function VoiceCard({ voice, provider, previewText, speed, lang, onFavToggle }) {
  const themeMode = useUIStore((s) => s.themeMode);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  async function handlePreview() {
    if (loading) return;
    let ctx;
    try {
      ctx = await resumeAudioContext();
    } catch {
      setBlocked(true);
      return;
    }
    if (!previewText.trim()) {
      toast.error("Enter preview text first.");
      return;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (_) {}
      setPlaying(false);
    }

    setLoading(true);
    try {
      const endpoint =
        provider === "google"
          ? "/api/voices/google-preview"
          : "/api/voices/preview";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voice.voice_id,
          text: previewText,
          speed,
          languageCode: lang,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) throw new Error(`${provider} TTS error`);

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      source.onended = () => setPlaying(false);
      source.start();
      setPlaying(true);
    } catch (err) {
      toast.error("Voice preview failed. Try again.", {
        action: { label: "Retry", onClick: handlePreview },
      });
    } finally {
      setLoading(false);
    }
  }

  // Google voices use voice_id as id; Sarvam uses id
  const voiceKey = voice.id ?? voice.voice_id;

  return (
    <div style={s.card}>
      {/* Top row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p style={s.voiceName}>{voice.name}</p>
          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              marginTop: "4px",
            }}
          >
            {voice.gender && <span style={s.tag}>{voice.gender}</span>}
            {/* Google: show tier. Sarvam: show style */}
            {voice.tier && (
              <span
                style={{
                  ...s.tag,
                  background: "#0f2744",
                  border: "1px solid #1e3a5f",
                  color: "#60a5fa",
                }}
              >
                {TIER_LABELS[voice.tier] ?? voice.tier}
              </span>
            )}
            {voice.style && (
              <span
                style={{
                  ...s.tag,
                  background: "#1A1A1A",
                  border: "1px solid #2a2a2a",
                  color: "var(--saffron-500)",
                }}
              >
                {voice.style}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onFavToggle(voiceKey, !voice.is_favourite)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
            color: voice.is_favourite
              ? "var(--saffron-500)"
              : themeMode === "dark"
                ? "var(--ink-200)"
                : "var(--ink-500)",
            textShadow:
              voice.is_favourite && themeMode === "dark"
                ? "0 0 8px rgba(249,115,22,0.35)"
                : "none",
          }}
          title={voice.is_favourite ? "Remove favourite" : "Add favourite"}
        >
          {voice.is_favourite ? "★" : "☆"}
        </button>
      </div>

      {/* Waveform */}
      <div style={{ margin: "12px 0 8px" }}>
        <Waveform analyserRef={analyserRef} playing={playing} />
      </div>

      {blocked && (
        <p style={{ fontSize: "0.78rem", color: "#F97316", margin: "0 0 8px" }}>
          Tap anywhere to enable audio
        </p>
      )}

      <button
        onClick={handlePreview}
        disabled={loading}
        style={{ ...s.playBtn, background: playing ? "#16A34A" : "#F97316" }}
      >
        {loading ? "Loading…" : playing ? "▶ Playing" : "▶ Preview"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FAV_KEY_SARVAM = "fav-voices";
const FAV_KEY_GOOGLE = "fav-voices-google";

export default function VoiceExplorerPage() {
  const [provider, setProvider] = useState("sarvam"); // "sarvam" | "google"
  const [lang, setLang] = useState("ml-IN");
  const [gender, setGender] = useState("All");
  const [speed, setSpeed] = useState(1);
  const [previewText, setPreviewText] = useState(DEFAULT_TEXTS["ml-IN"]);
  const [favOnly, setFavOnly] = useState(false);

  // ── Sarvam voices (localStorage fav) ──────────────────────────────────────
  const [sarvamVoices, setSarvamVoices] = useState(() => {
    const saved =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem(FAV_KEY_SARVAM) || "[]")
        : [];
    return BULBUL_V3_SPEAKERS.map((v) => ({
      ...v,
      voice_id: v.id,
      is_favourite: saved.includes(v.id),
    }));
  });

  // ── Google voices (localStorage fav) ──────────────────────────────────────
  const [googleVoices, setGoogleVoices] = useState(() => {
    const saved =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem(FAV_KEY_GOOGLE) || "[]")
        : [];
    return GOOGLE_VOICES.map((v) => ({
      ...v,
      voice_id: v.id,
      is_favourite: saved.includes(v.id),
    }));
  });

  useEffect(() => {
    setPreviewText(DEFAULT_TEXTS[lang] ?? DEFAULT_TEXTS["en-IN"]);
  }, [lang]);

  useEffect(() => {
    async function unlock() {
      try {
        await resumeAudioContext();
      } catch (_) {}
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function handleFavToggle(id, val) {
    if (provider === "sarvam") {
      const updated = sarvamVoices.map((v) =>
        v.id === id ? { ...v, is_favourite: val } : v,
      );
      setSarvamVoices(updated);
      localStorage.setItem(
        FAV_KEY_SARVAM,
        JSON.stringify(updated.filter((v) => v.is_favourite).map((v) => v.id)),
      );
    } else {
      const updated = googleVoices.map((v) =>
        v.id === id ? { ...v, is_favourite: val } : v,
      );
      setGoogleVoices(updated);
      localStorage.setItem(
        FAV_KEY_GOOGLE,
        JSON.stringify(updated.filter((v) => v.is_favourite).map((v) => v.id)),
      );
    }
  }

  const allVoices = provider === "sarvam" ? sarvamVoices : googleVoices;

  const voices = allVoices.filter((v) => {
    if (provider === "google" && v.language !== lang) return false;
    if (gender !== "All" && v.gender?.toLowerCase() !== gender.toLowerCase())
      return false;
    if (favOnly && !v.is_favourite) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Voice Explorer</h1>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.84rem",
            color: "var(--ink-500)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={favOnly}
            onChange={(e) => setFavOnly(e.target.checked)}
          />
          Favourites only
        </label>
      </div>

      {/* Provider toggle */}
      <div style={s.providerToggle}>
        {[
          { value: "sarvam", label: "Sarvam", sub: "Bulbul v3" },
          { value: "google", label: "Google", sub: "Cloud TTS" },
        ].map((p) => (
          <button
            key={p.value}
            onClick={() => setProvider(p.value)}
            style={{
              ...s.providerBtn,
              background:
                provider === p.value
                  ? "var(--saffron-500)"
                  : "var(--surface-2)",
              color: provider === p.value ? "#fff" : "var(--ink-500)",
              border:
                provider === p.value
                  ? "1px solid var(--saffron-500)"
                  : "1px solid var(--border)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
              {p.label}
            </span>
            <span
              style={{ fontSize: "0.72rem", opacity: 0.75, marginLeft: "6px" }}
            >
              {p.sub}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          style={s.select}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          style={s.select}
        >
          {GENDERS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Preview text + speed */}
      <div style={s.previewBar}>
        <input
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="Type preview text…"
          style={{ ...s.input, flex: 1 }}
          maxLength={200}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              style={{
                ...s.speedBtn,
                background: speed === sp ? "#F97316" : "transparent",
                color: speed === sp ? "#fff" : "var(--ink-500)",
              }}
            >
              {sp}x
            </button>
          ))}
        </div>
      </div>

      {/* No voices for this lang/provider */}
      {voices.length === 0 ? (
        <p
          style={{
            color: "var(--ink-400)",
            fontSize: "0.84rem",
            padding: "2rem 0",
          }}
        >
          No voices found for these filters.
          {provider === "google" &&
            " Google may not have voices for this language yet."}
        </p>
      ) : (
        <div style={s.grid}>
          {voices.map((v) => (
            <VoiceCard
              key={v.voice_id}
              voice={v}
              provider={provider}
              previewText={previewText}
              speed={speed}
              lang={lang}
              onFavToggle={handleFavToggle}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.25rem",
  },
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: 0,
  },
  providerToggle: {
    display: "flex",
    gap: "8px",
    marginBottom: "1rem",
  },
  providerBtn: {
    display: "flex",
    alignItems: "center",
    borderRadius: "8px",
    padding: "8px 18px",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    transition: "all 0.15s",
    minHeight: "40px",
  },
  filterBar: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "1rem",
  },
  select: {
    border: "1px solid var(--border)",
    borderRadius: "7px",
    padding: "7px 12px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-700)",
    background: "var(--surface)",
    cursor: "pointer",
    outline: "none",
    minHeight: "40px",
  },
  previewBar: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: "1.5rem",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "0.75rem 1rem",
  },
  input: {
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: "36px",
    background: "var(--surface)",
  },
  speedBtn: {
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "0.78rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    minHeight: "32px",
    transition: "all 0.1s",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "#15161A",
    border: "1px solid #2a2a2a",
    borderRadius: "10px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
  },
  voiceName: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "var(--ink-900)",
    margin: 0,
  },
  tag: {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    background: "#1A1A1A",
    color: "var(--ink-400)",
    borderRadius: "4px",
    border: "1px solid #2a2a2a",
    padding: "2px 6px",
  },
  playBtn: {
    width: "100%",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    padding: "9px",
    fontSize: "0.84rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "44px",
    fontFamily: "var(--font-sans)",
    transition: "background 0.15s",
    marginTop: "auto",
  },
};
