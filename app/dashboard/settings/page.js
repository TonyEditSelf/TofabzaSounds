"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((r) => r.json());

const LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "or-IN", label: "Odia" },
];

const GEMINI_CHAT_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
];
const GEMINI_EMBEDDING_MODELS = [
  "text-embedding-004",
  "text-multilingual-embedding-002",
];

export default function SettingsPage() {
  const { data, isLoading, mutate } = useSWR("/api/settings", fetcher);
  const [form, setForm] = useState({});
  const [revealed, setRevealed] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleReveal(key) {
    setRevealed((r) => ({ ...r, [key]: !r[key] }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSavedAt(Date.now());
      mutate();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: "var(--ink-500)" }}>
        Loading settings…
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "32px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            margin: 0,
            fontFamily: "var(--font-serif)",
            color: "var(--ink-900)",
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>
          Global defaults and API credentials. Agent/widget configs override
          these individually.
        </p>
      </div>

      <Section title="Sarvam" subtitle="Voice & STT" icon="🎙️">
        <SecretField
          label="API key"
          value={form.sarvam_api_key ?? ""}
          revealed={revealed.sarvam_api_key}
          onToggle={() => toggleReveal("sarvam_api_key")}
          onChange={(v) => set("sarvam_api_key", v)}
          placeholder="sk-sarv-…"
        />
        <SelectField
          label="Default language"
          value={form.sarvam_default_language ?? "en-IN"}
          onChange={(v) => set("sarvam_default_language", v)}
          options={LANGUAGES.map((l) => ({
            value: l.code,
            label: `${l.code} — ${l.label}`,
          }))}
        />
        <TextField
          label="Default voice"
          value={form.sarvam_default_voice ?? ""}
          onChange={(v) => set("sarvam_default_voice", v)}
          placeholder="meera"
        />
      </Section>

      <Section title="Gemini" subtitle="LLM & embeddings" icon="✦">
        <SecretField
          label="API key"
          value={form.gemini_api_key ?? ""}
          revealed={revealed.gemini_api_key}
          onToggle={() => toggleReveal("gemini_api_key")}
          onChange={(v) => set("gemini_api_key", v)}
          placeholder="AIzaSy…"
        />
        <SelectField
          label="Chat model"
          value={form.gemini_chat_model ?? "gemini-1.5-flash"}
          onChange={(v) => set("gemini_chat_model", v)}
          options={GEMINI_CHAT_MODELS.map((m) => ({ value: m, label: m }))}
        />
        <SelectField
          label="Embedding model"
          value={form.gemini_embedding_model ?? "text-embedding-004"}
          onChange={(v) => set("gemini_embedding_model", v)}
          options={GEMINI_EMBEDDING_MODELS.map((m) => ({ value: m, label: m }))}
        />
      </Section>

      <Section title="Exotel" subtitle="Telephony" icon="📞">
        <SecretField
          label="API key"
          value={form.exotel_api_key ?? ""}
          revealed={revealed.exotel_api_key}
          onToggle={() => toggleReveal("exotel_api_key")}
          onChange={(v) => set("exotel_api_key", v)}
          placeholder="API key"
        />
        <SecretField
          label="API token"
          value={form.exotel_api_token ?? ""}
          revealed={revealed.exotel_api_token}
          onToggle={() => toggleReveal("exotel_api_token")}
          onChange={(v) => set("exotel_api_token", v)}
          placeholder="API token"
        />
        <TextField
          label="Account SID"
          value={form.exotel_account_sid ?? ""}
          onChange={(v) => set("exotel_account_sid", v)}
          placeholder="your-account-sid"
        />
        <ToggleField
          label="Use India host"
          hint="api.in.exotel.com"
          value={
            form.exotel_use_india_host === "true" ||
            form.exotel_use_india_host === true
          }
          onChange={(v) => set("exotel_use_india_host", v ? "true" : "false")}
        />
      </Section>

      <Section title="Upstash Redis" subtitle="Rate limiting" icon="⚡">
        <SecretField
          label="Redis URL"
          value={form.upstash_redis_url ?? ""}
          revealed={revealed.upstash_redis_url}
          onToggle={() => toggleReveal("upstash_redis_url")}
          onChange={(v) => set("upstash_redis_url", v)}
          placeholder="https://…upstash.io"
        />
        <SecretField
          label="Token"
          value={form.upstash_redis_token ?? ""}
          revealed={revealed.upstash_redis_token}
          onToggle={() => toggleReveal("upstash_redis_token")}
          onChange={(v) => set("upstash_redis_token", v)}
          placeholder="AX…"
        />
      </Section>

      <Section title="Resend" subtitle="Transactional email" icon="✉️">
        <SecretField
          label="API key"
          value={form.resend_api_key ?? ""}
          revealed={revealed.resend_api_key}
          onToggle={() => toggleReveal("resend_api_key")}
          onChange={(v) => set("resend_api_key", v)}
          placeholder="re_…"
        />
        <TextField
          label="From address"
          value={form.resend_from_address ?? ""}
          onChange={(v) => set("resend_from_address", v)}
          placeholder="no-reply@yourdomain.com"
        />
      </Section>

      <Section
        title="AI & call defaults"
        subtitle="Pre-filled when creating a new agent or widget"
        icon="🤖"
      >
        <TextareaField
          label="System prompt"
          value={form.default_system_prompt ?? ""}
          onChange={(v) => set("default_system_prompt", v)}
          placeholder="You are a helpful voice assistant…"
        />
        <NumberField
          label="Max call duration"
          value={form.default_max_call_duration ?? "300"}
          onChange={(v) => set("default_max_call_duration", v)}
          unit="seconds"
          min={30}
          max={3600}
          step={30}
        />
        <NumberField
          label="Silence threshold"
          value={form.default_silence_threshold ?? "2.0"}
          onChange={(v) => set("default_silence_threshold", v)}
          unit="seconds"
          min={0.5}
          max={10}
          step={0.5}
        />
        <NumberField
          label="Cost markup"
          value={form.cost_markup_multiplier ?? "2.5"}
          onChange={(v) => set("cost_markup_multiplier", v)}
          unit="× multiplier"
          min={1}
          max={10}
          step={0.1}
        />
        <NumberField
          label="Exotel rate"
          value={form.exotel_cost_per_minute_inr ?? "1.00"}
          onChange={(v) => set("exotel_cost_per_minute_inr", v)}
          unit="₹ / min"
          min={0.1}
          max={100}
          step={0.1}
        />
        <NumberField
          label="RAG top-k"
          value={form.rag_top_k ?? "5"}
          onChange={(v) => set("rag_top_k", v)}
          unit="chunks"
          min={1}
          max={20}
          step={1}
        />
      </Section>

      <Section title="App" subtitle="Branding & support" icon="🏢">
        <TextField
          label="Agency name"
          value={form.agency_name ?? ""}
          onChange={(v) => set("agency_name", v)}
          placeholder="Tofabza Sounds"
        />
        <TextField
          label="Support email"
          value={form.support_email ?? ""}
          onChange={(v) => set("support_email", v)}
          placeholder="support@yourdomain.com"
        />
        <TextField
          label="Widget base URL"
          value={form.widget_base_url ?? ""}
          onChange={(v) => set("widget_base_url", v)}
          placeholder="https://capsule.yourdomain.com"
        />
        <p className="text-xs text-muted-foreground pl-[172px]">
          Widget base URL fixes the hardcoded localhost in embed.js.
        </p>
      </Section>

      {error && (
        <p style={{ fontSize: 13, color: "var(--crimson-500)" }}>{error}</p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 12,
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
        }}
      >
        {savedAt && (
          <span style={{ fontSize: 12, color: "var(--emerald-600)" }}>
            ✓ Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: "none",
            background: "var(--cobalt-600)",
            color: "#fff",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Field components ────────────────────────────────────────────────────────

function Section({ title, subtitle, icon, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span
          style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "var(--ink-500)",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "right" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SecretField({
  label,
  value,
  revealed,
  onToggle,
  onChange,
  placeholder,
}) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            height: 32,
            padding: "0 12px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--ink-900)",
            outline: "none",
          }}
        />
        <button
          onClick={onToggle}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            color: "var(--ink-500)",
          }}
          aria-label={revealed ? "Hide" : "Show"}
        >
          {revealed ? "🙈" : "👁"}
        </button>
      </div>
    </Row>
  );
}

function TextField({ label, value, onChange, placeholder }) {
  return (
    <Row label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 32,
          padding: "0 12px",
          fontSize: 13,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--ink-900)",
          outline: "none",
          width: "100%",
        }}
      />
    </Row>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <Row label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 32,
          padding: "0 12px",
          fontSize: 13,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--ink-900)",
          outline: "none",
          width: "100%",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

function NumberField({ label, value, onChange, unit, min, max, step }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          style={{
            width: 96,
            height: 32,
            padding: "0 12px",
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--ink-900)",
            outline: "none",
          }}
        />
        {unit && (
          <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{unit}</span>
        )}
      </div>
    </Row>
  );
}

function TextareaField({ label, value, onChange, placeholder }) {
  return (
    <Row label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          padding: "8px 12px",
          fontSize: 13,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--ink-900)",
          outline: "none",
          resize: "vertical",
          width: "100%",
          boxSizing: "border-box",
          fontFamily: "var(--font-sans)",
        }}
      />
    </Row>
  );
}

function ToggleField({ label, hint, value, onChange }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-3">
        <button
          role="switch"
          aria-checked={value}
          onClick={() => onChange(!value)}
          style={{
            position: "relative",
            display: "inline-flex",
            height: 20,
            width: 36,
            borderRadius: 9999,
            border: "none",
            cursor: "pointer",
            background: value ? "var(--cobalt-600)" : "var(--surface-3)",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: value ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              transition: "left 0.2s",
            }}
          />
        </button>
        {hint && (
          <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{hint}</span>
        )}
      </div>
    </Row>
  );
}
