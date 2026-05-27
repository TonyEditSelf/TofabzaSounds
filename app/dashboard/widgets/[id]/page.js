"use client";

/**
 * app/dashboard/widgets/[id]/page.js
 *
 * Sections:
 *  1. Header — name + status toggle + delete
 *  2. Config form — same fields as /new
 *  3. Knowledge Base — upload + list KBs
 *  4. Embed Code — copy-paste snippet
 */

import { useState, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BULBUL_V3_SPEAKERS } from "@/lib/sarvam/voices";
import { TTS_SUPPORTED_LANGUAGES } from "@/lib/sarvam/voices";

const supabase = createClient();

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchWidget(id) {
  const { data, error } = await supabase
    .from("widgets")
    .select("*, clients(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchKBs(id) {
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("id, name, created_at, kb_chunks(count)")
    .eq("owner_id", id)
    .eq("owner_type", "widget")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchClients() {
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  return data ?? [];
}

// ─── Knowledge Base Section ───────────────────────────────────────────────────

function KnowledgeBaseSection({ widgetId, clientId }) {
  const [uploading, setUploading] = useState(false);
  const [kbName, setKbName] = useState("");
  const [deleting, setDeleting] = useState(null);

  const { data: kbs = [], mutate } = useSWR(`kbs:${widgetId}`, () =>
    fetchKBs(widgetId),
  );

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB.");
      return;
    }
    if (!kbName.trim()) {
      toast.error("Enter a name for this knowledge base.");
      return;
    }
    if (kbs.length >= 5) {
      toast.error("Maximum 5 knowledge bases per widget?.");
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("owner_type", "widget");
    form.append("owner_id", widgetId);
    form.append("client_id", clientId);
    form.append("name", kbName.trim());

    const res = await fetch("/api/kb/upload", { method: "POST", body: form });
    const json = await res.json();
    setUploading(false);

    if (!res.ok) {
      toast.error(json?.error?.message ?? "Upload failed.");
      return;
    }
    toast.success(`Uploaded — ${json.chunks_count} chunks indexed.`);
    setKbName("");
    e.target.value = "";
    mutate();
  }

  async function handleDelete(kb) {
    setDeleting(kb.id);
    const res = await fetch(`/api/kb/${kb.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      toast.error("Delete failed.");
      return;
    }
    toast.success(`${kb.name} deleted.`);
    mutate();
  }

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Knowledge Base</h2>
      <p style={s.hint}>
        Upload documents your assistant can reference when answering questions.
        PDF, TXT, MD, DOCX — max 10MB each.
      </p>

      {/* Upload row */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <input
          value={kbName}
          onChange={(e) => setKbName(e.target.value)}
          placeholder="KB name (e.g. Product FAQ)"
          style={{ ...s.input, flex: 1, minWidth: "160px" }}
        />
        <label
          style={{
            ...s.btnGhost,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "44px",
            padding: "8px 16px",
          }}
        >
          {uploading ? "Uploading…" : "+ Upload File"}
          <input
            type="file"
            accept=".pdf,.txt,.md,.docx"
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* KB list */}
      {kbs.length === 0 ? (
        <p style={{ ...s.hint, fontStyle: "italic" }}>
          No knowledge bases yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {kbs.map((kb) => (
            <div key={kb.id} style={s.kbRow}>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 500,
                    fontSize: "0.84rem",
                    color: "var(--ink-900)",
                  }}
                >
                  {kb.name}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.75rem",
                    color: "var(--ink-400)",
                  }}
                >
                  {kb.kb_chunks?.[0]?.count ?? 0} chunks ·{" "}
                  {new Date(kb.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <button
                onClick={() => handleDelete(kb)}
                disabled={deleting === kb.id}
                style={s.btnDelete}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#E11D48";
                  e.currentTarget.style.borderColor = "rgba(225,29,72,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--ink-400)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                {deleting === kb.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Embed Code Section ───────────────────────────────────────────────────────

function EmbedCodeSection({ widgetId }) {
  const snippet = `<!-- Tofabza Sounds Widget -->
<script>
  (function(w,d,s,id){
    w.TofabzaWidgetId = id;
    var js = d.createElement(s);
    js.src = '${typeof window !== "undefined" ? window.location.origin : ""}/widget/v1/embed.js';
    js.async = true;
    d.head.appendChild(js);
  })(window, document, 'script', '${widgetId}');
</script>`;

  function handleCopy() {
    navigator.clipboard.writeText(snippet);
    toast.success("Embed code copied.");
  }

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Embed Code</h2>
      <p style={s.hint}>
        Paste this snippet before the closing <code>&lt;/body&gt;</code> tag on
        your website.
      </p>
      <pre style={s.code}>{snippet}</pre>
      <button onClick={handleCopy} style={s.btnPrimary}>
        Copy Code
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WidgetDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const {
    data: widget,
    isLoading,
    mutate,
  } = useSWR(`widget:${id}`, () => fetchWidget(id));
  const { data: clients = [] } = useSWR("clients-list", fetchClients, {
    revalidateOnFocus: false,
  });

  const [form, setForm] = useState({
    client_id: "",
    name: "",
    voice_id: "anand",
    language: "ml-IN",
    system_prompt: "",
    greeting: "",
    style: "bubble",
    accentColor: "#F97316",
    bgColor: "#ffffff",
    llm_provider: "gemini-flash",
    domains: "",
  });

  // Initialise form once widget loads
  useEffect(() => {
    if (widget) {
      const cfg = widget?.config ?? {};
      setForm({
        client_id: widget?.client_id,
        name: widget?.name,
        voice_id: cfg.voice_id ?? "anand",
        language: cfg.language ?? "ml-IN",
        pace: cfg.pace ?? 1.0,
        system_prompt: cfg.system_prompt ?? "",
        greeting: cfg.greeting ?? "",
        style: cfg.style ?? "bubble",
        accentColor: cfg.accentColor ?? "#F97316",
        bgColor: cfg.bgColor ?? "#ffffff",
        llm_provider: cfg.llm_provider ?? "gemini-flash",
        domains: (widget?.allowed_domains ?? []).join(", "),
        darkMode: cfg.darkMode ?? false,
      });
    }
  }, [widget]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function parseDomains(raw) {
    return raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d && d !== "*");
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Widget name is required.");
      return;
    }
    const domains = parseDomains(form.domains);
    if (domains.length === 0) {
      toast.error("Add at least one allowed domain.");
      return;
    }
    if (form.system_prompt.length > 8000) {
      toast.error("System prompt must be under 8000 characters.");
      return;
    }

    const isComplete = !!(
      form.system_prompt.trim() &&
      domains.length > 0 &&
      form.voice_id &&
      form.language
    );

    setSaving(true);
    const { error } = await supabase
      .from("widgets")
      .update({
        client_id: form.client_id,
        name: form.name.trim(),
        allowed_domains: domains,
        status: isComplete ? "active" : "inactive",
        config: {
          voice_id: form.voice_id,
          language: form.language,
          system_prompt: form.system_prompt.trim(),
          greeting: form.greeting.trim(),
          style: form.style,
          accentColor: form.accentColor,
          bgColor: form.bgColor ?? "#ffffff",
          llm_provider: form.llm_provider,
          darkMode: form.darkMode,
          pace: form.pace ?? 1.0,
        },
      })
      .eq("id", id);
    setSaving(false);

    if (error) {
      toast.error("Save failed.");
      return;
    }
    toast.success(
      isComplete
        ? "Widget saved and activated!"
        : "Widget saved. Add system prompt and domain to activate.",
    );
    mutate();
  }

  async function handleDelete() {
    if (confirmName !== widget?.name) {
      toast.error("Name doesn't match.");
      return;
    }
    setDeleting(true);
    const { error } = await supabase.from("widgets").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      toast.error("Delete failed.");
      return;
    }
    toast.success("Widget deleted.");
    router.push("/dashboard/widgets");
  }

  if (isLoading || !widget || !form || !form.accentColor) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ ...s.skeleton, width: "200px", height: "32px" }} />
        <div style={{ ...s.skeleton, width: "100%", height: "200px" }} />
      </div>
    );
  }

  if (!widget) return <p style={s.hint}>Widget not found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Setup banner */}
      {widget?.status === "inactive" && !form.system_prompt && (
        <div
          style={{
            background: "rgba(249,115,22,0.08)",
            border: "1px solid rgba(249,115,22,0.2)",
            borderRadius: "10px",
            padding: "1rem 1.25rem",
            fontSize: "0.84rem",
            color: "var(--saffron-500)",
          }}
        >
          👋 Widget created! Add instructions below, upload a knowledge base,
          set your domain, then click <strong>Save</strong> and toggle to{" "}
          <strong>Active</strong>.
        </div>
      )}

      {/* Header */}
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={s.pageTitle}>{widget?.name}</h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--ink-400)",
              margin: "2px 0 0",
              letterSpacing: "0.05em",
            }}
          >
            ID: {id}
          </p>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: "20px",
            background:
              widget?.status === "active"
                ? "rgba(22,163,74,0.1)"
                : "rgba(0,0,0,0.05)",
            color: widget?.status === "active" ? "#16A34A" : "#9CA3AF",
            border:
              widget?.status === "active"
                ? "1px solid rgba(22,163,74,0.3)"
                : "1px solid #E5E7EB",
          }}
        >
          {widget?.status === "active" ? "● Active" : "○ Inactive"}
        </span>

        <button
          onClick={() =>
            window.open(`/widget-test.html?widget_id=${id}`, "_blank")
          }
          style={{ ...s.btnGhost, minHeight: "44px" }}
        >
          Test
        </button>
        <button onClick={handleSave} disabled={saving} style={s.btnPrimary}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Config form */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Configuration</h2>

        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          {/* Client */}
          <div style={s.field}>
            <label style={s.label}>Client</label>
            <select
              value={form.client_id}
              onChange={(e) => set("client_id", e.target.value)}
              style={s.select}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div style={s.field}>
            <label style={s.label}>Widget Name *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              style={s.input}
            />
          </div>

          {/* Language + Voice */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
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
            <div style={s.field}>
              <label style={s.label}>Voice</label>
              <select
                value={form.voice_id}
                onChange={(e) => set("voice_id", e.target.value)}
                style={s.select}
              >
                {BULBUL_V3_SPEAKERS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* LLM Provider */}
          <div style={s.field}>
            <label style={s.label}>AI Model</label>
            <select
              value={form.llm_provider}
              onChange={(e) => set("llm_provider", e.target.value)}
              style={s.select}
            >
              <option value="gemini-flash">
                Gemini 2.5 Flash — Fast, Cheap
              </option>
              <option value="gemini-pro">
                Gemini 2.5 Pro — Smarter, Costlier
              </option>
            </select>
          </div>

          {/* System prompt */}
          <div style={s.field}>
            <label style={s.label}>
              What should your assistant do?
              <span style={{ float: "right", fontWeight: 400 }}>
                {form.system_prompt.length}/8000
              </span>
            </label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => set("system_prompt", e.target.value)}
              maxLength={8000}
              rows={6}
              style={{
                ...s.input,
                resize: "vertical",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Voice Speed */}
          <div style={s.field}>
            <label style={s.label}>Voice Speed</label>
            <select
              value={form.pace}
              onChange={(e) => set("pace", parseFloat(e.target.value))}
              style={s.select}
            >
              <option value={0.75}>0.75× — Slow</option>
              <option value={1.0}>1.0× — Normal</option>
              <option value={1.25}>1.25× — Fast</option>
              <option value={1.5}>1.5× — Faster</option>
              <option value={2.0}>2.0× — Fastest</option>
            </select>
          </div>

          {/* Greeting */}
          <div style={s.field}>
            <label style={s.label}>Greeting Message</label>
            <input
              value={form.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              style={s.input}
            />
          </div>

          {/* Style */}
          <div style={s.field}>
            <label style={s.label}>Widget Style</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {["bubble", "bar", "inline"].map((st) => (
                <button
                  key={st}
                  onClick={() => set("style", st)}
                  style={{
                    ...s.styleBtn,
                    background: form.style === st ? "#F97316" : "#fff",
                    color: form.style === st ? "#fff" : "var(--ink-600)",
                    borderColor:
                      form.style === st ? "#F97316" : "var(--border)",
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Accent + Background colour */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div style={s.field}>
              <label style={s.label}>Accent Colour</label>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  style={{
                    width: "44px",
                    height: "44px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
                <input
                  value={form.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  style={{ ...s.input, width: "110px" }}
                />
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Background Colour</label>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <input
                  type="color"
                  value={form.bgColor ?? "#ffffff"}
                  onChange={(e) => set("bgColor", e.target.value)}
                  style={{
                    width: "44px",
                    height: "44px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
                <input
                  value={form.bgColor ?? "#ffffff"}
                  onChange={(e) => set("bgColor", e.target.value)}
                  style={{ ...s.input, width: "110px" }}
                />
              </div>
            </div>
          </div>

          {/* Dark Mode */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={s.label}>Dark Mode</div>
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "var(--ink-400)",
                  marginTop: 3,
                }}
              >
                Chat window uses dark background
              </div>
            </div>
            <button
              onClick={() => set("darkMode", !form.darkMode)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                border: "none",
                background: form.darkMode
                  ? "var(--cobalt-600)"
                  : "var(--surface-3)",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: form.darkMode ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                  display: "block",
                }}
              />
            </button>
          </div>

          {/* Domains */}
          <div style={s.field}>
            <label style={s.label}>
              Allowed Domains *{" "}
              <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
                (comma-separated)
              </span>
            </label>
            <input
              value={form.domains}
              onChange={(e) => set("domains", e.target.value)}
              placeholder="example.com, app.example.com"
              style={s.input}
            />
          </div>
        </div>
      </div>

      {/* Knowledge Base */}
      <KnowledgeBaseSection widgetId={id} clientId={widget?.client_id} />

      {/* Embed Code */}
      <EmbedCodeSection widgetId={id} />

      {/* Danger zone */}
      <div style={{ ...s.section, borderColor: "rgba(225,29,72,0.2)" }}>
        <h2 style={{ ...s.sectionTitle, color: "#E11D48" }}>Danger Zone</h2>
        <p style={s.hint}>
          Type the widget name to confirm deletion. This will delete all
          sessions and knowledge bases.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={widget?.name}
            style={{ ...s.input, width: "220px" }}
          />
          <button
            onClick={handleDelete}
            disabled={deleting || confirmName !== widget?.name}
            style={{
              ...s.btnPrimary,
              background: "#E11D48",
              opacity: confirmName !== widget?.name ? 0.4 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete Widget"}
          </button>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
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
    margin: 0,
  },
  section: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.5rem",
  },
  sectionTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "var(--ink-700)",
    margin: "0 0 1rem",
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
    background: "var(--surface)",
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
  hint: { fontSize: "0.78rem", color: "var(--ink-400)", margin: "0 0 0.75rem" },
  code: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "1rem",
    fontSize: "0.78rem",
    fontFamily: "var(--font-mono)",
    color: "var(--ink-900)",
    lineHeight: 1.6,
    overflowX: "auto",
    margin: "0 0 1rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  kbRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "10px 14px",
  },
  btnPrimary: {
    background: "#F97316",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    padding: "8px 18px",
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
    padding: "8px 14px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: "44px",
    fontFamily: "var(--font-sans)",
  },
  btnDelete: {
    background: "transparent",
    color: "var(--ink-400)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "0.78rem",
    cursor: "pointer",
    minHeight: "32px",
    fontFamily: "var(--font-sans)",
    transition: "all 0.15s",
  },
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
