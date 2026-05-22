"use client";

/**
 * app/dashboard/agents/new/page.js
 *
 * Create agent — 3 fields only:
 *  - Client
 *  - Agent name
 *  - Type (inbound | outbound)
 *
 * After create → redirect to /dashboard/agents/[id] for full config
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

async function fetchClients() {
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  return data ?? [];
}

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    name: "",
    type: "inbound",
  });

  const { data: clients = [] } = useSWR("clients-list", fetchClients, {
    revalidateOnFocus: false,
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate() {
    if (!form.client_id) {
      toast.error("Select a client.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Agent name is required.");
      return;
    }

    setSaving(true);
    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        client_id: form.client_id,
        name: form.name.trim(),
        type: form.type,
        status: "inactive",
        language: "ml-IN",
        voice_id: "anand",
        config: { llm_provider: "gemini-flash" },
      })
      .select("id")
      .single();
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("An agent with this name already exists for this client.");
      } else {
        toast.error(error.message ?? "Failed to create agent.");
      }
      return;
    }

    toast.success("Agent created! Now configure it below.");
    router.push(`/dashboard/agents/${agent.id}`);
  }

  return (
    <div>
      <h1 style={s.pageTitle}>New Agent</h1>

      <div style={s.card}>
        {/* Client */}
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

        {/* Name */}
        <div style={s.field}>
          <label style={s.label}>Agent Name *</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Reception Bot"
            style={s.input}
          />
        </div>

        {/* Type */}
        <div style={s.field}>
          <label style={s.label}>Agent Type</label>
          <div style={{ display: "flex", gap: "10px" }}>
            {["inbound", "outbound"].map((t) => (
              <button
                key={t}
                onClick={() => set("type", t)}
                style={{
                  ...s.typeBtn,
                  background:
                    form.type === t
                      ? t === "inbound"
                        ? "#2563EB"
                        : "#F97316"
                      : "#fff",
                  color: form.type === t ? "#fff" : "var(--ink-600)",
                  borderColor:
                    form.type === t
                      ? t === "inbound"
                        ? "#2563EB"
                        : "#F97316"
                      : "var(--border)",
                }}
              >
                {t === "inbound" ? "↙ Inbound" : "↗ Outbound"}
              </button>
            ))}
          </div>
          <p style={s.hint}>
            {form.type === "inbound"
              ? "Answers incoming calls on your Exotel number."
              : "Makes outgoing calls to a contact list via campaigns."}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleCreate} disabled={saving} style={s.btnPrimary}>
            {saving ? "Creating…" : "Create Agent"}
          </button>
          <button onClick={() => router.back()} style={s.btnGhost}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: "0 0 1.5rem",
  },
  card: {
    background: "#fff",
    border: "1px solid #D1D5DB",
    borderRadius: "10px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    maxWidth: "480px",
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
    border: "1px solid #D1D5DB",
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
    border: "1px solid #D1D5DB",
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
  typeBtn: {
    border: "1px solid",
    borderRadius: "7px",
    padding: "10px 20px",
    fontSize: "0.84rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    minHeight: "44px",
    transition: "all 0.1s",
    fontWeight: 500,
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
    border: "1px solid #D1D5DB",
    borderRadius: "7px",
    padding: "10px 16px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: "44px",
    fontFamily: "var(--font-sans)",
  },
};
