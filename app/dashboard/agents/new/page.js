"use client";

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

const HARDCODED_FACILITIES = [
  { slug: "polyclinic", label: "Polyclinic", icon: "🏥" },
  { slug: "diagnostic", label: "Diagnostic Center", icon: "🔬" },
  { slug: "dental", label: "Dental Clinic", icon: "🦷" },
  { slug: "hospital", label: "Hospital", icon: "🏨" },
];

async function fetchCustomFacilities() {
  const hardcodedSlugs = HARDCODED_FACILITIES.map((f) => f.slug);
  const { data } = await supabase
    .from("prompt_templates")
    .select("slug, name, icon")
    .not("slug", "in", `(${hardcodedSlugs.join(",")})`)
    .order("name");
  return (data ?? []).map((r) => ({
    slug: r.slug,
    label: r.name,
    icon: r.icon ?? "🏢",
  }));
}

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [createdAgent, setCreatedAgent] = useState(null);
  const [form, setForm] = useState({
    client_id: "",
    name: "",
    type: "inbound",
    facility_type: "polyclinic",
    whatsapp_number: "",
    plivo_number: "",
  });

  const { data: clients = [] } = useSWR("clients-list", fetchClients, {
    revalidateOnFocus: false,
  });
  const { data: customFacilities = [] } = useSWR(
    "custom-facilities",
    fetchCustomFacilities,
    {
      revalidateOnFocus: false,
    },
  );
  const FACILITY_TYPES = [...HARDCODED_FACILITIES, ...customFacilities];

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
        config: {
          llm_provider: "gemini-flash",
          prompt: "",
          greeting: "",
          facility_type: form.facility_type,
          whatsapp_number: form.whatsapp_number || undefined,
          plivo_number: form.plivo_number || undefined,
        },
      })
      .select("id, name")
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

    setCreatedAgent(agent);
  }

  /* ── Success screen ──────────────────────────────────── */
  if (createdAgent) {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tofabza.com";
    const onboardUrl = `${APP_URL}/onboard/${createdAgent.id}`;
    const waMessage = encodeURIComponent(
      `Hi! Here is the link to set up your AI receptionist: ${onboardUrl}`,
    );
    const waLink = `https://wa.me/${form.whatsapp_number?.replace(/\D/g, "")}?text=${waMessage}`;

    return (
      <div
        style={{
          maxWidth: 480,
          margin: "4rem auto",
          padding: "2rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: "1rem" }}>🎉</div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--ink-900)",
            marginBottom: "0.5rem",
          }}
        >
          Agent "{createdAgent.name}" created!
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-600)",
            marginBottom: "1.5rem",
          }}
        >
          Share the onboarding link with your client so they can fill in their
          clinic details.
        </p>
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "var(--ink-700)",
            wordBreak: "break-all",
            marginBottom: "1rem",
            textAlign: "left",
          }}
        >
          {onboardUrl}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(onboardUrl);
            toast.success("Copied!");
          }}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: "8px 14px",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--ink-700)",
            marginBottom: "0.75rem",
          }}
        >
          📋 Copy link
        </button>
        {form.whatsapp_number && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              textDecoration: "none",
              marginBottom: "0.75rem",
            }}
          >
            <button
              style={{
                width: "100%",
                background: "#25D366",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              💬 Send via WhatsApp
            </button>
          </a>
        )}
        <a
          href={`/dashboard/agents/${createdAgent.id}`}
          style={{ textDecoration: "none" }}
        >
          <button
            style={{
              background: "transparent",
              color: "var(--ink-500)",
              border: "none",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Go to agent settings →
          </button>
        </a>
      </div>
    );
  }

  /* ── Form ────────────────────────────────────────────── */
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

        {/* Agent name */}
        <div style={s.field}>
          <label style={s.label}>Agent Name *</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Reception Bot"
            style={s.input}
          />
        </div>

        {/* Facility type */}
        <div style={s.field}>
          <label style={s.label}>Facility Type</label>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            {FACILITY_TYPES.map((f) => {
              const active = form.facility_type === f.slug;
              return (
                <button
                  key={f.slug}
                  onClick={() => set("facility_type", f.slug)}
                  style={{
                    ...s.facilityBtn,
                    background: active ? "#fff7ed" : "var(--surface)",
                    borderColor: active ? "#f97316" : "var(--border)",
                    color: active ? "#c2410c" : "var(--ink-600)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{f.icon}</span>
                  <span style={{ fontSize: 13 }}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Call direction */}
        <div style={s.field}>
          <label style={s.label}>Call Direction</label>
          <div style={{ display: "flex", gap: 10 }}>
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
                      : "var(--surface)",
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

        {/* Plivo Number */}
        <div style={s.field}>
          <label style={s.label}>Plivo Number</label>
          <input
            style={s.input}
            type="tel"
            placeholder="+91 98765 43210"
            value={form.plivo_number}
            onChange={(e) => set("plivo_number", e.target.value)}
          />
          <p style={s.hint}>
            E.164 format. Used when TELEPHONY_PROVIDER=plivo.
          </p>
        </div>

        {/* WhatsApp */}
        <div style={s.field}>
          <label style={s.label}>Client WhatsApp Number</label>
          <input
            style={s.input}
            type="tel"
            placeholder="+91 98765 43210"
            value={form.whatsapp_number}
            onChange={(e) => set("whatsapp_number", e.target.value)}
          />
          <p style={s.hint}>
            Used to send the onboarding link via WhatsApp after agent creation.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
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
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    maxWidth: 480,
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
    outline: "none",
    minHeight: 36,
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface)",
  },
  select: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: 36,
    background: "var(--surface)",
    cursor: "pointer",
    width: "100%",
  },
  facilityBtn: {
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    minHeight: 64,
    transition: "all 0.1s",
  },
  typeBtn: {
    border: "1px solid",
    borderRadius: 7,
    padding: "10px 20px",
    fontSize: "0.84rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    minHeight: 44,
    transition: "all 0.1s",
    fontWeight: 500,
  },
  hint: { fontSize: "0.75rem", color: "var(--ink-400)", margin: 0 },
  btnPrimary: {
    background: "#2563EB",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "10px 22px",
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
    padding: "10px 16px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: 44,
    fontFamily: "var(--font-sans)",
  },
};
