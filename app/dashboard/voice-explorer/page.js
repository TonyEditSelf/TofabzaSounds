"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { BULBUL_V3_SPEAKERS } from "@/lib/sarvam/voices";

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
const STYLES = ["All", "Conversational", "IVR", "Sales", "Newscast"];
const GENDERS = ["All", "Male", "Female"];

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
      ctx.strokeStyle = "#2563EB";
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
              background: playing ? "#2563EB" : "#E2E4EF",
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

function VoiceCard({ voice, previewText, speed, lang, onFavToggle }) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  async function handlePreview() {
    if (loading) return;

    // iOS AudioContext unblock
    let ctx;
    try {
      ctx = await resumeAudioContext();
    } catch {
      setBlocked(true);
      return;
    }

    if (!previewText.trim()) {
      toast.error("Didn't catch that. Please try again.");
      return;
    }

    // Stop current playback
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (_) {}
      setPlaying(false);
    }

    setLoading(true);
    try {
      const res = await fetch("/api/voices/preview", {
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

      if (!res.ok) throw new Error("Sarvam API error");

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Waveform analyser
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 1; // speed applied server-side via Sarvam
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;

      source.onended = () => setPlaying(false);
      source.start();
      setPlaying(true);
    } catch (err) {
      if (err.name === "AbortError" || err.message.includes("Sarvam")) {
        toast.error("Voice preview unavailable. Try again in a moment.", {
          action: { label: "Retry", onClick: handlePreview },
        });
      } else {
        toast.error("Preview failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFav() {
    const next = !voice.is_favourite;
    onFavToggle(voice.id, next);
  }

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
            {voice.style && (
              <span
                style={{
                  ...s.tag,
                  background: "rgba(37,99,235,0.08)",
                  color: "#2563EB",
                }}
              >
                {voice.style}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleFav}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
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

      {/* iOS blocked banner */}
      {blocked && (
        <p style={{ fontSize: "0.78rem", color: "#F97316", margin: "0 0 8px" }}>
          Tap anywhere to enable audio
        </p>
      )}

      {/* Play button */}
      <button
        onClick={handlePreview}
        disabled={loading}
        style={{
          ...s.playBtn,
          background: playing ? "#16A34A" : "#2563EB",
        }}
      >
        {loading ? "Loading…" : playing ? "▶ Playing" : "▶ Preview"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VoiceExplorerPage() {
  const [lang, setLang] = useState("ml-IN");
  const [gender, setGender] = useState("All");
  const [style, setStyle] = useState("All");
  const [speed, setSpeed] = useState(1);
  const [previewText, setPreviewText] = useState(DEFAULT_TEXTS["ml-IN"]);
  const [favOnly, setFavOnly] = useState(false);

  const [allVoices, setAllVoices] = useState(() => {
    const saved =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("fav-voices") || "[]")
        : [];
    return BULBUL_V3_SPEAKERS.map((v) => ({
      ...v,
      voice_id: v.id,
      is_favourite: saved.includes(v.id),
    }));
  });
  const isLoading = false;
  const mutate = () => {};

  // Update preview text placeholder when language changes
  useEffect(() => {
    setPreviewText(DEFAULT_TEXTS[lang] ?? DEFAULT_TEXTS["en-IN"]);
  }, [lang]);

  // iOS AudioContext: resume on any tap
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
    const updated = allVoices.map((v) =>
      v.id === id ? { ...v, is_favourite: val } : v,
    );
    setAllVoices(updated);
    const favIds = updated.filter((v) => v.is_favourite).map((v) => v.id);
    localStorage.setItem("fav-voices", JSON.stringify(favIds));
  }

  const voices = allVoices.filter((v) => {
    // if (gender !== "All" && v.gender !== gender) return false;
    // if (style !== "All" && v.style !== style) return false;
    if (gender !== "All" && v.gender.toLowerCase() !== gender.toLowerCase())
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

      {/* Filters */}
      <div style={s.filterBar}>
        {/* Language */}
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

        {/* Gender */}
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          style={s.select}
        >
          {GENDERS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>

        {/* Style */}
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          style={s.select}
        >
          {STYLES.map((st) => (
            <option key={st}>{st}</option>
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
                background: speed === sp ? "#2563EB" : "transparent",
                color: speed === sp ? "#fff" : "var(--ink-500)",
              }}
            >
              {sp}x
            </button>
          ))}
        </div>
      </div>

      {/* Voice grid */}
      {isLoading ? (
        <div style={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...s.card, gap: "12px" }}>
              <div style={{ ...s.skeleton, height: "16px", width: "60%" }} />
              <div style={{ ...s.skeleton, height: "40px", width: "100%" }} />
              <div style={{ ...s.skeleton, height: "36px", width: "100%" }} />
            </div>
          ))}
        </div>
      ) : voices.length === 0 ? (
        <p
          style={{
            color: "var(--ink-400)",
            fontSize: "0.84rem",
            padding: "2rem 0",
          }}
        >
          No voices found for these filters.{" "}
          {allVoices.length === 0 &&
            "Run the voices sync from Settings to populate voices."}
        </p>
      ) : (
        <div style={s.grid}>
          {voices.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
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
    background: "#fff",
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
    background: "#fff",
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
    background: "#fff",
    border: "1px solid var(--border)",
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
    background: "rgba(0,0,0,0.05)",
    color: "var(--ink-500)",
    borderRadius: "4px",
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
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
