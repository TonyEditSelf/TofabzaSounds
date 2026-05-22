"use client";

/**
 * app/dashboard/agents/[id]/page.js
 *
 * Sections:
 *  1. Header — name + type badge + status badge + save
 *  2. Config — language, voice, LLM, Exotel number, system prompt (8000 chars)
 *  3. Knowledge Base
 *  4. Webhook URL — copy for Exotel
 *  5. Danger zone — delete
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

async function fetchAgent(id) {
  const { data, error } = await supabase
    .from("agents")
    .select("*, clients(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchClients() {
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  return data ?? [];
}

async function fetchKBs(id) {
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("id, name, created_at, kb_chunks(count)")
    .eq("owner_id", id)
    .eq("owner_type", "agent")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Knowledge Base Section ───────────────────────────────────────────────────

function KnowledgeBaseSection({ agentId, clientId }) {
  const [uploading, setUploading] = useState(false);
  const [kbName, setKbName] = useState("");
  const [deleting, setDeleting] = useState(null);
  const { data: kbs = [], mutate } = useSWR(`kbs-agent:${agentId}`, () =>
    fetchKBs(agentId),
  );

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB.");
      return;
    }
    if (!kbName.trim()) {
      toast.error("Enter a KB name first.");
      return;
    }
    if (kbs.length >= 5) {
      toast.error("Maximum 5 knowledge bases per agent.");
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("owner_type", "agent");
    form.append("owner_id", agentId);
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
        Upload documents the agent can reference during calls. PDF, TXT, MD,
        DOCX — max 10MB.
      </p>
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
          placeholder="KB name"
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

// ─── Webhook Section ──────────────────────────────────────────────────────────

function WebhookSection({ agentId, agentType }) {
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/exotel/${agentId}`;

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied.");
  }

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Exotel Webhook</h2>
      <p style={s.hint}>
        {agentType === "inbound"
          ? "Set this URL in Exotel → App → Passthru App → URL field for your inbound number."
          : "Set this URL in Exotel → Campaigns → Webhook URL field."}
      </p>
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <code style={s.code}>{webhookUrl}</code>
        <button onClick={handleCopy} style={s.btnPrimary}>
          Copy
        </button>
      </div>
      <p style={{ ...s.hint, marginTop: "0.75rem" }}>
        ⚠️ Railway telephony server must be running and NEXTJS_URL env var set
        for webhooks to work.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const {
    data: agent,
    isLoading,
    mutate,
  } = useSWR(`agent:${id}`, () => fetchAgent(id));
  const { data: clients = [] } = useSWR("clients-list", fetchClients, {
    revalidateOnFocus: false,
  });

  const [form, setForm] = useState({
    client_id: "",
    name: "",
    language: "ml-IN",
    voice_id: "anand",
    llm_provider: "gemini-flash",
    system_prompt: "",
    greeting: "",
    exotel_number: "",
    max_call_duration: 300,
  });

  useEffect(() => {
    if (agent) {
      const cfg = agent.config ?? {};
      setForm({
        client_id: agent.client_id ?? "",
        name: agent.name ?? "",
        language: agent.language ?? "ml-IN",
        voice_id: cfg.voice_id ?? "anand",
        llm_provider: cfg.llm_provider ?? "gemini-flash",
        system_prompt: cfg.system_prompt ?? "",
        greeting: cfg.greeting ?? "",
        exotel_number: cfg.exotel_number ?? "",
        max_call_duration: cfg.max_call_duration ?? 300,
      });
    }
  }, [agent]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Agent name is required.");
      return;
    }
    if (!form.system_prompt.trim()) {
      toast.error("System prompt is required.");
      return;
    }
    if (form.system_prompt.length > 8000) {
      toast.error("System prompt must be under 8000 characters.");
      return;
    }

    const isComplete = !!(
      form.system_prompt.trim() &&
      form.language &&
      form.voice_id
    );

    setSaving(true);
    const { error } = await supabase
      .from("agents")
      .update({
        client_id: form.client_id,
        name: form.name.trim(),
        language: form.language,
        status: isComplete ? "active" : "inactive",
        config: {
          voice_id: form.voice_id,
          llm_provider: form.llm_provider,
          system_prompt: form.system_prompt.trim(),
          greeting: form.greeting.trim(),
          exotel_number: form.exotel_number.trim(),
          max_call_duration: Number(form.max_call_duration),
        },
      })
      .eq("id", id);
    setSaving(false);

    if (error) {
      toast.error(error.message ?? "Save failed.");
      return;
    }
    toast.success(
      isComplete
        ? "Agent saved and activated!"
        : "Agent saved. Add system prompt to activate.",
    );
    mutate();
  }

  async function handleDelete() {
    if (confirmName !== agent?.name) {
      toast.error("Name doesn't match.");
      return;
    }
    setDeleting(true);
    const { error } = await supabase.from("agents").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      toast.error("Delete failed.");
      return;
    }
    toast.success("Agent deleted.");
    router.push("/dashboard/agents");
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ ...s.skeleton, width: "200px", height: "32px" }} />
        <div style={{ ...s.skeleton, width: "100%", height: "300px" }} />
      </div>
    );
  }

  if (!agent) return <p style={s.hint}>Agent not found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
          <h1 style={s.pageTitle}>{agent.name}</h1>
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
        {/* Type badge */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: "20px",
            background:
              agent.type === "inbound"
                ? "rgba(37,99,235,0.1)"
                : "rgba(249,115,22,0.1)",
            color: agent.type === "inbound" ? "#2563EB" : "#F97316",
            border:
              agent.type === "inbound"
                ? "1px solid rgba(37,99,235,0.3)"
                : "1px solid rgba(249,115,22,0.3)",
          }}
        >
          {agent.type === "inbound" ? "↙ Inbound" : "↗ Outbound"}
        </span>
        {/* Status badge */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: "20px",
            background:
              agent.status === "active"
                ? "rgba(22,163,74,0.1)"
                : "rgba(0,0,0,0.05)",
            color: agent.status === "active" ? "#16A34A" : "var(--ink-400)",
            border:
              agent.status === "active"
                ? "1px solid rgba(22,163,74,0.3)"
                : "1px solid var(--border)",
          }}
        >
          {agent.status === "active" ? "● Active" : "○ Inactive"}
        </span>
        <button onClick={handleSave} disabled={saving} style={s.btnPrimary}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Setup banner */}
      {agent.status === "inactive" && !form.system_prompt && (
        <div
          style={{
            background: "rgba(37,99,235,0.06)",
            border: "1px solid rgba(37,99,235,0.2)",
            borderRadius: "10px",
            padding: "1rem 1.25rem",
            fontSize: "0.84rem",
            color: "#2563EB",
          }}
        >
          👋 Agent created! Add a system prompt, configure voice and language,
          then click <strong>Save</strong> to activate.
        </div>
      )}

      {/* Config */}
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
            <label style={s.label}>Agent Name *</label>
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

          {/* LLM */}
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

          {/* Exotel number */}
          <div style={s.field}>
            <label style={s.label}>
              Exotel Number{" "}
              {agent.type === "inbound"
                ? "(number that rings this agent)"
                : "(caller ID for outbound)"}
            </label>
            <input
              value={form.exotel_number}
              onChange={(e) => set("exotel_number", e.target.value)}
              placeholder="e.g. 08088919191"
              style={s.input}
            />
          </div>

          {/* Max call duration */}
          <div style={s.field}>
            <label style={s.label}>Max Call Duration (seconds)</label>
            <input
              type="number"
              value={form.max_call_duration}
              onChange={(e) => set("max_call_duration", e.target.value)}
              min={30}
              max={1800}
              style={{ ...s.input, width: "140px" }}
            />
          </div>

          {/* Greeting */}
          <div style={s.field}>
            <label style={s.label}>Greeting (first thing agent says)</label>
            <input
              value={form.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Hello, welcome to…"
              style={s.input}
            />
          </div>

          {/* System prompt */}
          <div style={s.field}>
            <label style={s.label}>
              What should this agent do? *
              <span style={{ float: "right", fontWeight: 400 }}>
                {form.system_prompt.length}/8000
              </span>
            </label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => set("system_prompt", e.target.value)}
              maxLength={8000}
              rows={8}
              placeholder="You are a helpful voice assistant for [company]. Your job is to…"
              style={{
                ...s.input,
                resize: "vertical",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </div>

      {/* Knowledge Base */}
      <KnowledgeBaseSection agentId={id} clientId={agent.client_id} />

      {/* Webhook */}
      <WebhookSection agentId={id} agentType={agent.type} />

      {/* Danger zone */}
      <div style={{ ...s.section, borderColor: "rgba(225,29,72,0.2)" }}>
        <h2 style={{ ...s.sectionTitle, color: "#E11D48" }}>Danger Zone</h2>
        <p style={s.hint}>Type the agent name to confirm deletion.</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={agent.name}
            style={{ ...s.input, width: "220px" }}
          />
          <button
            onClick={handleDelete}
            disabled={deleting || confirmName !== agent.name}
            style={{
              ...s.btnPrimary,
              background: "#E11D48",
              opacity: confirmName !== agent.name ? 0.4 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete Agent"}
          </button>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

// ─── Styles — all CSS vars for dark/light support ─────────────────────────────

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
    background: "var(--surface)",
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
    background: "var(--surface)",
    outline: "none",
    minHeight: "36px",
    cursor: "pointer",
    width: "100%",
  },
  hint: { fontSize: "0.78rem", color: "var(--ink-400)", margin: "0 0 0.75rem" },
  code: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "0.78rem",
    fontFamily: "var(--font-mono)",
    color: "var(--ink-700)",
    wordBreak: "break-all",
    flex: 1,
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
    background: "#2563EB",
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
    background: "var(--border)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
