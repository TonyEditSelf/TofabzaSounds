"use client";

/**
 * app/dashboard/widgets/new/page.js
 *
 * Widget builder — two-column layout (form left, live preview right)
 * Mobile: full-width form + Preview tab toggle
 *
 * Fields:
 *  - Client (required)
 *  - Name (required)
 *  - Voice (from BULBUL_V3_SPEAKERS)
 *  - Language
 *  - System prompt (max 2000 chars)
 *  - Greeting message
 *  - Widget style: bubble | bar | inline
 *  - Accent colour
 *  - Allowed domains (comma-separated, no wildcard *)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BULBUL_V3_SPEAKERS } from "@/lib/sarvam/voices";
import { TTS_SUPPORTED_LANGUAGES } from "@/lib/sarvam/voices";

const supabase = createClient();

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

function WidgetPreview({ config }) {
  const { style, accentColor, greeting, name } = config;

  if (style === "bubble") {
    return (
      <div
        style={{
          position: "relative",
          height: "420px",
          background: "#F4F5FA",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {/* Chat window */}
        <div
          style={{
            position: "absolute",
            bottom: "80px",
            right: "16px",
            width: "300px",
            background: "#fff",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ background: accentColor, padding: "14px 16px" }}>
            <p
              style={{
                margin: 0,
                color: "#fff",
                fontWeight: 500,
                fontSize: "0.9rem",
              }}
            >
              {name || "Assistant"}
            </p>
          </div>
          {/* Message */}
          <div style={{ padding: "16px" }}>
            <div
              style={{
                background: "#F4F5FA",
                borderRadius: "12px 12px 12px 0",
                padding: "10px 14px",
                fontSize: "0.84rem",
                color: "#0A0B0F",
                maxWidth: "80%",
                lineHeight: 1.5,
              }}
            >
              {greeting || "Hello! How can I help you today?"}
            </div>
          </div>
          {/* Input bar */}
          <div
            style={{
              borderTop: "1px solid #E2E4EF",
              padding: "10px 12px",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <div
              style={{
                flex: 1,
                background: "#F4F5FA",
                borderRadius: "20px",
                padding: "8px 14px",
                fontSize: "0.8rem",
                color: "#9CA3AF",
              }}
            >
              Type a message…
            </div>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: accentColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "14px",
              }}
            >
              🎤
            </div>
          </div>
        </div>
        {/* Bubble button */}
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: accentColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          💬
        </div>
      </div>
    );
  }

  if (style === "bar") {
    return (
      <div
        style={{
          background: "#F4F5FA",
          borderRadius: "12px",
          overflow: "hidden",
          height: "420px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: accentColor,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              color: "#fff",
              fontWeight: 500,
              fontSize: "0.9rem",
              flex: 1,
            }}
          >
            {name || "Assistant"}
          </span>
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              borderRadius: "20px",
              padding: "8px 16px",
              color: "#fff",
              fontSize: "0.8rem",
            }}
          >
            {greeting || "Hello! How can I help?"}
          </div>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            🎤
          </div>
        </div>
      </div>
    );
  }

  // inline
  return (
    <div
      style={{
        background: "#F4F5FA",
        borderRadius: "12px",
        padding: "16px",
        height: "420px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ background: accentColor, padding: "14px 16px" }}>
          <p style={{ margin: 0, color: "#fff", fontWeight: 500 }}>
            {name || "Assistant"}
          </p>
        </div>
        <div style={{ padding: "16px", minHeight: "200px" }}>
          <div
            style={{
              background: "#F4F5FA",
              borderRadius: "12px 12px 12px 0",
              padding: "10px 14px",
              fontSize: "0.84rem",
              maxWidth: "80%",
            }}
          >
            {greeting || "Hello! How can I help you today?"}
          </div>
        </div>
        <div
          style={{
            borderTop: "1px solid #E2E4EF",
            padding: "10px 12px",
            display: "flex",
            gap: "8px",
          }}
        >
          <div
            style={{
              flex: 1,
              background: "#F4F5FA",
              borderRadius: "20px",
              padding: "8px 14px",
              fontSize: "0.8rem",
              color: "#9CA3AF",
            }}
          >
            Type a message…
          </div>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            🎤
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STYLES = ["bubble", "bar", "inline"];

const DEFAULTS = {
  client_id: "",
  name: "",
  language: "ml-IN",
  style: "bubble",
  accentColor: "#2563EB",
  greeting: "",
};

export default function NewWidgetPage() {
  const router = useRouter();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState("form"); // "form" | "preview"

  const { data: clients = [] } = useSWR("clients-list", fetchClients, {
    revalidateOnFocus: false,
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function parseDomains(raw) {
    return raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d && d !== "*" && d.length > 0);
  }

  async function handleSave() {
    if (!form.client_id) {
      toast.error("Select a client.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Widget name is required.");
      return;
    }

    setSaving(true);
    const { data: newWidget, error } = await supabase
      .from("widgets")
      .insert({
        client_id: form.client_id,
        name: form.name.trim(),
        status: "inactive",
        config: { language: form.language, llm_provider: "gemini-flash" },
      })
      .select("id")
      .single();
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("A widget with this name already exists for this client.");
      } else {
        toast.error(error.message ?? "Failed to create widget.");
      }
      return;
    }
    toast.success("Widget created! Now configure your assistant below.");
    router.push(`/dashboard/widgets/${newWidget.id}`);
  }

  const previewConfig = {
    style: form.style ?? "bubble",
    accentColor: form.accentColor ?? "#2563EB",
    greeting: form.greeting ?? "",
    name: form.name ?? "",
  };

  const FormPanel = (
    <div style={s.formPanel}>
      <div style={s.field}>
        <label style={s.label}>Client *</label>
        <select
          value={form.client_id}
          onChange={(e) => set("client_id", e.target.value)}
          style={s.select}
        >
          <option value="">Select client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div style={s.field}>
        <label style={s.label}>Widget Name *</label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Homepage Assistant"
          style={s.input}
        />
      </div>

      <div style={s.field}>
        <label style={s.label}>Language</label>
        <select
          value={form.language}
          onChange={(e) => set("language", e.target.value)}
          style={s.select}
        >
          {TTS_SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "10px", paddingTop: "0.5rem" }}>
        <button onClick={handleSave} disabled={saving} style={s.btnPrimary}>
          {saving ? "Creating…" : "Create Widget"}
        </button>
        <button onClick={() => router.back()} style={s.btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  );

  const PreviewPanel = (
    <div style={s.previewPanel}>
      <p style={s.previewLabel}>Live Preview</p>
      <WidgetPreview config={previewConfig} />
      <p style={s.previewNote}>
        Preview is approximate. Actual widget renders in Shadow DOM.
      </p>
    </div>
  );

  return (
    <div>
      <h1 style={s.pageTitle}>New Widget</h1>

      {/* Mobile tab toggle */}
      <div className="mobile-tabs" style={s.mobileTabs}>
        {["form", "preview"].map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            style={{
              ...s.mobileTabBtn,
              borderBottom:
                mobileTab === tab
                  ? "2px solid #2563EB"
                  : "2px solid transparent",
              color: mobileTab === tab ? "#2563EB" : "var(--ink-400)",
            }}
          >
            {tab === "form" ? "Configure" : "Preview"}
          </button>
        ))}
      </div>

      {/* Desktop: two columns. Mobile: tabs */}
      <div style={s.layout} className="widget-layout">
        <div
          className={`widget-form-col ${mobileTab === "preview" ? "mobile-hidden" : ""}`}
        >
          {FormPanel}
        </div>
        <div
          className={`widget-preview-col ${mobileTab === "form" ? "mobile-hidden" : ""}`}
        >
          {PreviewPanel}
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .mobile-tabs { display: none; }
        .mobile-hidden { display: none; }
        @media (max-width: 767px) {
          .mobile-tabs { display: flex !important; }
          .widget-layout { display: block !important; }
          .widget-form-col, .widget-preview-col { display: block !important; width: 100% !important; }
          .mobile-hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: "0 0 1.5rem",
  },
  mobileTabs: {
    borderBottom: "1px solid var(--border)",
    marginBottom: "1rem",
  },
  mobileTabBtn: {
    background: "transparent",
    border: "none",
    padding: "10px 20px",
    fontSize: "0.84rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    minHeight: "44px",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "2rem",
    alignItems: "start",
  },
  formPanel: {
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  previewPanel: {
    position: "sticky",
    top: "1rem",
  },
  previewLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-400)",
    margin: "0 0 0.75rem",
  },
  previewNote: {
    fontSize: "0.75rem",
    color: "var(--ink-400)",
    margin: "0.75rem 0 0",
    textAlign: "center",
  },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-500)",
    fontWeight: 500,
  },
  input: {
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: "36px",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: "36px",
    background: "#fff",
    cursor: "pointer",
    width: "100%",
  },
  styleBtn: {
    border: "1px solid",
    borderRadius: "7px",
    padding: "8px 16px",
    fontSize: "0.84rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    minHeight: "40px",
    textTransform: "capitalize",
    transition: "all 0.1s",
  },
  hint: { fontSize: "0.75rem", color: "var(--ink-400)", margin: 0 },
  btnPrimary: {
    background: "#2563EB",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    padding: "10px 22px",
    fontSize: "0.84rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "44px",
    fontFamily: "var(--font-sans)",
  },
  btnGhost: {
    background: "transparent",
    color: "var(--ink-500)",
    border: "1px solid var(--border)",
    borderRadius: "7px",
    padding: "10px 16px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: "44px",
    fontFamily: "var(--font-sans)",
  },
};
