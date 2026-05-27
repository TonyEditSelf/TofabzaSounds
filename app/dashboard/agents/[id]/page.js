"use client";

import { useState, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  BULBUL_V3_SPEAKERS,
  TTS_SUPPORTED_LANGUAGES,
} from "@/lib/sarvam/voices";

const supabase = createClient();

const FACILITY_TYPES = [
  { slug: "polyclinic", label: "Polyclinic", icon: "🏥" },
  { slug: "diagnostic", label: "Diagnostic Centre", icon: "🔬" },
  { slug: "dental", label: "Dental Clinic", icon: "🦷" },
  { slug: "hospital", label: "Hospital", icon: "🏨" },
];

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

function OnboardingDataSection({ agentId }) {
  const [submission, setSubmission] = useState(null);
  const sb = createClient();

  useEffect(() => {
    sb.from("onboarding_submissions")
      .select("form_data, files, status, pushed_at")
      .eq("agent_id", agentId)
      .in("status", ["pushed", "rejected"])
      .order("pushed_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        console.log("onboarding:", data, error);
        setSubmission(data);
      });
  }, [agentId]);

  if (!submission) return null;

  const formData = submission.form_data || {};
  const files = submission.files || [];
  const hasData = Object.values(formData).some((v) => v);

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Onboarding Data</h2>
      <p style={s.hint}>
        Submitted by clinic · pushed{" "}
        {new Date(submission.pushed_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>

      {hasData && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "0.5rem 1rem",
            marginBottom: "1rem",
          }}
        >
          {Object.entries(formData).map(([key, val]) => {
            if (!val) return null;
            return [
              <div
                key={`k-${key}`}
                style={{
                  fontSize: 12,
                  color: "var(--ink-500)",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  paddingTop: 2,
                }}
              >
                {key.replace(/_/g, " ")}
              </div>,
              <div
                key={`v-${key}`}
                style={{
                  fontSize: 13,
                  color: "var(--ink-800)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {String(val)}
              </div>,
            ];
          })}
        </div>
      )}

      {files.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-500)",
              fontFamily: "var(--font-mono)",
              marginBottom: 8,
            }}
          >
            Uploaded Files ({files.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 12px",
                }}
              >
                <span>📄</span>
                <span
                  style={{ flex: 1, fontSize: 13, color: "var(--ink-700)" }}
                >
                  {f.name}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--ink-400)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {(f.size / 1024).toFixed(0)} KB
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <input
          value={kbName}
          onChange={(e) => setKbName(e.target.value)}
          placeholder="KB name"
          style={{ ...s.input, flex: 1, minWidth: 160 }}
        />
        <label
          style={{
            ...s.btnGhost,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

function WebhookSection({ agentId, agentType }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const exotelUrl = `${origin}/api/webhooks/exotel/${agentId}`;
  const plivoUrl = `${origin}/api/webhooks/plivo/${agentId}`;
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Webhook URLs</h2>
      {[
        {
          label: "Exotel",
          url: exotelUrl,
          hint:
            agentType === "inbound"
              ? "Exotel → App → Passthru App → URL"
              : "Exotel → Campaigns → Webhook URL",
        },
        {
          label: "Plivo",
          url: plivoUrl,
          hint: "Plivo console → Phone Numbers → Answer URL",
        },
      ].map(({ label, url, hint }) => (
        <div key={label} style={{ marginBottom: "1rem" }}>
          <p style={{ ...s.hint, marginBottom: 6 }}>
            <strong>{label}:</strong> {hint}
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <code style={s.code}>{url}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Copied.");
              }}
              style={s.btnPrimary}
            >
              Copy
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

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
    prompt: "",
    greeting: "",
    exotel_number: "",
    plivo_number: "",
    max_call_duration: 300,
    facility_type: "polyclinic",
    fallback_number: "",
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
        prompt: cfg.prompt ?? "",
        greeting: cfg.greeting ?? "",
        exotel_number: cfg.exotel_number ?? "",
        plivo_number: cfg.plivo_number ?? "",
        max_call_duration: cfg.max_call_duration ?? 300,
        facility_type: cfg.facility_type ?? "polyclinic",
        fallback_number: cfg.fallback_number ?? "",
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
    if (!form.prompt.trim()) {
      toast.error("System prompt is required.");
      return;
    }
    if (form.prompt.length > 8000) {
      toast.error("System prompt must be under 8000 characters.");
      return;
    }
    const isComplete = !!(form.prompt.trim() && form.language && form.voice_id);
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
          prompt: form.prompt.trim(),
          greeting: form.greeting.trim(),
          exotel_number: form.exotel_number.trim(),
          plivo_number: form.plivo_number.trim(),
          max_call_duration: Number(form.max_call_duration),
          facility_type: form.facility_type,
          fallback_number: form.fallback_number.trim(),
        },
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Save failed.");
      return;
    }
    toast.success(isComplete ? "Agent saved and activated!" : "Agent saved.");
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

  if (isLoading)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...s.skeleton, width: 200, height: 32 }} />
        <div style={{ ...s.skeleton, width: "100%", height: 300 }} />
      </div>
    );
  if (!agent) return <p style={s.hint}>Agent not found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={s.pageTitle}>{agent.name}</h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-400)",
              margin: "2px 0 0",
            }}
          >
            ID: {id}
          </p>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 20,
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
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 20,
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

      {agent.status === "inactive" && !form.prompt && (
        <div
          style={{
            background: "rgba(37,99,235,0.06)",
            border: "1px solid rgba(37,99,235,0.2)",
            borderRadius: 10,
            padding: "1rem 1.25rem",
            fontSize: "0.84rem",
            color: "#2563EB",
          }}
        >
          👋 Agent created! Configure below and click <strong>Save</strong> to
          activate.
        </div>
      )}

      {/* Facility Type */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Facility Type</h2>
        <p style={s.hint}>
          Changing this affects the onboarding form sent to new clients.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {FACILITY_TYPES.map((f) => {
            const active = form.facility_type === f.slug;
            return (
              <button
                key={f.slug}
                onClick={() => set("facility_type", f.slug)}
                style={{
                  border: `1px solid ${active ? "#f97316" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: "12px 10px",
                  cursor: "pointer",
                  background: active ? "#fff7ed" : "var(--surface)",
                  color: active ? "#c2410c" : "var(--ink-600)",
                  fontWeight: active ? 600 : 400,
                  fontFamily: "var(--font-sans)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.1s",
                }}
              >
                <span style={{ fontSize: 22 }}>{f.icon}</span>
                <span style={{ fontSize: 12 }}>{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Config */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Configuration</h2>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
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
          <div style={s.field}>
            <label style={s.label}>Agent Name *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              style={s.input}
            />
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
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
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div style={s.field}>
              <label style={s.label}>Exotel Number</label>
              <input
                value={form.exotel_number}
                onChange={(e) => set("exotel_number", e.target.value)}
                placeholder="e.g. 08088919191"
                style={s.input}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Plivo Number</label>
              <input
                value={form.plivo_number}
                onChange={(e) => set("plivo_number", e.target.value)}
                placeholder="e.g. +919876543210"
                style={s.input}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Fallback Number</label>
              <input
                value={form.fallback_number}
                onChange={(e) => set("fallback_number", e.target.value)}
                placeholder="e.g. +91 98765 43210"
                style={s.input}
              />
            </div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Max Call Duration (seconds)</label>
            <input
              type="number"
              value={form.max_call_duration}
              onChange={(e) => set("max_call_duration", e.target.value)}
              min={30}
              max={1800}
              style={{ ...s.input, width: 140 }}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Greeting (first thing agent says)</label>
            <input
              value={form.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Hello, welcome to…"
              style={s.input}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>
              What should this agent do? *
              <span style={{ float: "right", fontWeight: 400 }}>
                {form.prompt.length}/8000
              </span>
            </label>
            <textarea
              value={form.prompt}
              onChange={(e) => set("prompt", e.target.value)}
              maxLength={8000}
              rows={12}
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

      <OnboardingDataSection agentId={id} />
      <KnowledgeBaseSection agentId={id} clientId={agent.client_id} />
      <WebhookSection agentId={id} agentType={agent.type} />

      {/* Danger zone */}
      <div style={{ ...s.section, borderColor: "rgba(225,29,72,0.2)" }}>
        <h2 style={{ ...s.sectionTitle, color: "#E11D48" }}>Danger Zone</h2>
        <p style={s.hint}>Type the agent name to confirm deletion.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={agent.name}
            style={{ ...s.input, width: 220 }}
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
    borderRadius: 10,
    padding: "1.5rem",
  },
  sectionTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "var(--ink-700)",
    margin: "0 0 1rem",
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-500)",
    fontWeight: 500,
  },
  input: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    background: "var(--surface)",
    outline: "none",
    minHeight: 36,
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    background: "var(--surface)",
    outline: "none",
    minHeight: 36,
    cursor: "pointer",
    width: "100%",
  },
  hint: { fontSize: "0.78rem", color: "var(--ink-400)", margin: "0 0 0.75rem" },
  code: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 6,
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
    borderRadius: 8,
    padding: "10px 14px",
  },
  btnPrimary: {
    background: "#2563EB",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: "0.84rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: 44,
    fontFamily: "var(--font-sans)",
  },
  btnGhost: {
    background: "transparent",
    color: "var(--ink-500)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "8px 14px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: 44,
    fontFamily: "var(--font-sans)",
  },
  btnDelete: {
    background: "transparent",
    color: "var(--ink-400)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: "0.78rem",
    cursor: "pointer",
    minHeight: 32,
    fontFamily: "var(--font-sans)",
    transition: "all 0.15s",
  },
  skeleton: {
    background: "var(--border)",
    borderRadius: 4,
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
