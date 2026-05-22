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
      <div className="p-8 text-sm text-muted-foreground animate-pulse">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-10">
      <div>
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {savedAt && (
          <span className="text-xs text-green-600">
            ✓ Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="ml-auto text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div
      className="grid items-center gap-3"
      style={{ gridTemplateColumns: "160px 1fr" }}
    >
      <span className="text-sm text-muted-foreground text-right">{label}</span>
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
          className="flex-1 h-8 px-3 text-xs font-mono rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground transition-colors text-sm"
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
        className="h-8 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
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
        className="h-8 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
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
          className="w-24 h-8 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
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
        className="px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-y"
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
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            value ? "bg-primary" : "bg-input"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </Row>
  );
}
