"use client";

/**
 * app/dashboard/clients/[id]/page.js
 *
 * Header: client name + contact info + edit button
 * Tabs: Agents | Widgets | Campaigns | Costs
 */

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchClient(id) {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, name, contact_name, contact_phone, contact_email, notes, created_at",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchAgents(id) {
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, type, status, language, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchWidgets(id) {
  const { data, error } = await supabase
    .from("widgets")
    .select("id, name, status, version, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchCampaigns(id) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchCosts(id) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data, error } = await supabase
    .from("call_logs")
    .select("total_cost_inr, started_at, direction, duration_seconds, status")
    .eq("client_id", id)
    .gte("started_at", start)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditForm({ client, onDone }) {
  const [form, setForm] = useState({ ...client });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        name: form.name.trim(),
        contact_name: form.contact_name?.trim() || null,
        contact_phone: form.contact_phone?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        notes: form.notes?.trim() || null,
      })
      .eq("id", client.id);
    setSaving(false);
    if (error) {
      toast.error("Save failed.");
      return;
    }
    toast.success("Client updated.");
    onDone();
  }

  return (
    <div style={s.editForm}>
      <div style={s.editGrid}>
        {[
          { label: "Name *", field: "name" },
          { label: "Contact Name", field: "contact_name" },
          { label: "Phone", field: "contact_phone" },
          { label: "Email", field: "contact_email" },
        ].map(({ label, field }) => (
          <div key={field}>
            <label style={s.label}>{label}</label>
            <input
              value={form[field] ?? ""}
              onChange={(e) => set(field, e.target.value)}
              style={s.input}
            />
          </div>
        ))}
      </div>
      <div>
        <label style={s.label}>Notes</label>
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          style={{
            ...s.input,
            resize: "vertical",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "0.75rem" }}>
        <button onClick={handleSave} disabled={saving} style={s.btnPrimary}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onDone} style={s.btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const color =
    status === "active"
      ? "#16A34A"
      : status === "inactive"
        ? "#9CA3AF"
        : status === "completed"
          ? "#F97316"
          : "#9CA3AF";
  return (
    <span style={{ fontSize: "0.75rem", fontWeight: 500, color }}>
      {status}
    </span>
  );
}

function SimpleTable({ headers, rows, empty }) {
  if (rows === null) {
    return (
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} style={s.tr}>
                {headers.map((_, j) => (
                  <td key={j} style={s.td}>
                    <div
                      style={{ ...s.skeleton, width: "60%", height: "12px" }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p style={s.empty}>{empty}</p>;
  }

  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function AgentsTab({ clientId }) {
  const { data: agents } = useSWR(`agents:${clientId}`, () =>
    fetchAgents(clientId),
  );
  const router = useRouter();

  return (
    <SimpleTable
      headers={["Name", "Type", "Language", "Status", "Created"]}
      empty="No agents yet."
      rows={
        agents?.map((a) => (
          <tr
            key={a.id}
            style={{ ...s.tr, cursor: "pointer" }}
            onClick={() => router.push(`/dashboard/agents/${a.id}`)}
          >
            <td style={{ ...s.td, fontWeight: 500 }}>{a.name}</td>
            <td style={s.td}>{a.type}</td>
            <td style={s.td}>{a.language}</td>
            <td style={s.td}>
              <StatusBadge status={a.status} />
            </td>
            <td
              style={{ ...s.td, color: "var(--ink-400)", fontSize: "0.78rem" }}
            >
              {new Date(a.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </td>
          </tr>
        )) ?? null
      }
    />
  );
}

function WidgetsTab({ clientId }) {
  const { data: widgets } = useSWR(`widgets:${clientId}`, () =>
    fetchWidgets(clientId),
  );
  const router = useRouter();

  return (
    <SimpleTable
      headers={["Name", "Status", "Version", "Created"]}
      empty="No widgets yet."
      rows={
        widgets?.map((w) => (
          <tr
            key={w.id}
            style={{ ...s.tr, cursor: "pointer" }}
            onClick={() => router.push(`/dashboard/widgets/${w.id}`)}
          >
            <td style={{ ...s.td, fontWeight: 500 }}>{w.name}</td>
            <td style={s.td}>
              <StatusBadge status={w.status} />
            </td>
            <td style={s.td}>v{w.version}</td>
            <td
              style={{ ...s.td, color: "var(--ink-400)", fontSize: "0.78rem" }}
            >
              {new Date(w.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </td>
          </tr>
        )) ?? null
      }
    />
  );
}

function CampaignsTab({ clientId }) {
  const { data: campaigns } = useSWR(`campaigns:${clientId}`, () =>
    fetchCampaigns(clientId),
  );
  const router = useRouter();

  return (
    <SimpleTable
      headers={["Name", "Status", "Created"]}
      empty="No campaigns yet."
      rows={
        campaigns?.map((c) => (
          <tr
            key={c.id}
            style={{ ...s.tr, cursor: "pointer" }}
            onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
          >
            <td style={{ ...s.td, fontWeight: 500 }}>{c.name}</td>
            <td style={s.td}>
              <StatusBadge status={c.status} />
            </td>
            <td
              style={{ ...s.td, color: "var(--ink-400)", fontSize: "0.78rem" }}
            >
              {new Date(c.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </td>
          </tr>
        )) ?? null
      }
    />
  );
}

function CostsTab({ clientId }) {
  const { data: logs } = useSWR(`costs:${clientId}`, () =>
    fetchCosts(clientId),
  );

  const total = (logs ?? []).reduce(
    (sum, r) => sum + (r.total_cost_inr ?? 0),
    0,
  );

  return (
    <div>
      <div style={s.costSummary}>
        <span style={s.label}>This Month</span>
        <span style={s.costTotal}>₹{total.toFixed(2)}</span>
      </div>
      <SimpleTable
        headers={["Direction", "Duration", "Cost", "Status", "Date"]}
        empty="No calls this month."
        rows={
          logs?.map((r, i) => (
            <tr key={i} style={s.tr}>
              <td style={s.td}>{r.direction}</td>
              <td style={s.td}>
                {r.duration_seconds
                  ? `${Math.ceil(r.duration_seconds / 60)} min`
                  : "—"}
              </td>
              <td style={s.td}>₹{(r.total_cost_inr ?? 0).toFixed(2)}</td>
              <td style={s.td}>
                <StatusBadge status={r.status} />
              </td>
              <td
                style={{
                  ...s.td,
                  color: "var(--ink-400)",
                  fontSize: "0.78rem",
                }}
              >
                {new Date(r.started_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </td>
            </tr>
          )) ?? null
        }
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ["Agents", "Widgets", "Campaigns", "Costs"];

export default function ClientDetailPage({ params }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("Agents");
  const [editing, setEditing] = useState(false);

  const {
    data: client,
    isLoading,
    mutate,
  } = useSWR(`client:${id}`, () => fetchClient(id));

  if (isLoading) {
    return (
      <div>
        <div
          style={{
            ...s.skeleton,
            width: "200px",
            height: "32px",
            marginBottom: "1rem",
          }}
        />
        <div style={{ ...s.skeleton, width: "300px", height: "16px" }} />
      </div>
    );
  }

  if (!client) return <p style={s.empty}>Client not found.</p>;

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.pageTitle}>{client.name}</h1>
          <p style={s.contactLine}>
            {[client.contact_name, client.contact_phone, client.contact_email]
              .filter(Boolean)
              .join(" · ") || "No contact info"}
          </p>
        </div>
        <button onClick={() => setEditing((e) => !e)} style={s.btnGhost}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <EditForm
          client={client}
          onDone={() => {
            setEditing(false);
            mutate();
          }}
        />
      )}

      {/* Tabs */}
      <div style={s.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...s.tabBtn,
              color:
                activeTab === tab
                  ? "var(--saffron-500, #F97316)"
                  : "var(--ink-400)",
              borderBottom:
                activeTab === tab
                  ? "2px solid var(--saffron-500, #F97316)"
                  : "2px solid transparent",
              fontWeight: activeTab === tab ? 500 : 400,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ marginTop: "1.25rem" }}>
        {activeTab === "Agents" && <AgentsTab clientId={id} />}
        {activeTab === "Widgets" && <WidgetsTab clientId={id} />}
        {activeTab === "Campaigns" && <CampaignsTab clientId={id} />}
        {activeTab === "Costs" && <CostsTab clientId={id} />}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
    gap: "1rem",
  },
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: "0 0 4px",
  },
  contactLine: {
    fontSize: "0.84rem",
    color: "var(--ink-400)",
    margin: 0,
  },
  editForm: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.25rem",
    marginBottom: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  editGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "0.75rem",
  },
  label: {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-400)",
    marginBottom: "4px",
  },
  input: {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: "36px",
    boxSizing: "border-box",
  },
  tabBar: {
    display: "flex",
    gap: "0",
    borderBottom: "1px solid var(--border)",
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    padding: "10px 20px",
    fontSize: "0.84rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    transition: "color 0.1s",
    minHeight: "44px",
  },
  tableWrap: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.84rem",
  },
  th: {
    textAlign: "left",
    padding: "0.625rem 1rem",
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-400)",
    borderBottom: "1px solid var(--border)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid var(--border)" },
  td: { padding: "0.875rem 1rem", color: "var(--ink-700)" },
  empty: {
    color: "var(--ink-400)",
    fontSize: "0.84rem",
    padding: "2rem 0",
  },
  costSummary: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    marginBottom: "1rem",
  },
  costTotal: {
    fontFamily: "var(--font-serif)",
    fontSize: "2rem",
    color: "var(--ink-900)",
  },
  btnPrimary: {
    background: "var(--saffron-500, #F97316)",
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
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
