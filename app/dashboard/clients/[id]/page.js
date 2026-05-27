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

async function fetchChecklist(clientId) {
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, status, config")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (!agents?.length) return [];

  const agentIds = agents.map((a) => a.id);

  const { data: submissions } = await supabase
    .from("onboarding_submissions")
    .select("agent_id, status")
    .in("agent_id", agentIds)
    .eq("status", "pushed");

  const { data: kbs } = await supabase
    .from("knowledge_bases")
    .select("owner_id, kb_chunks(count)")
    .in("owner_id", agentIds)
    .eq("owner_type", "agent");

  const submittedSet = new Set((submissions ?? []).map((s) => s.agent_id));
  const kbMap = {};
  for (const kb of kbs ?? []) {
    kbMap[kb.owner_id] =
      (kbMap[kb.owner_id] ?? 0) + (kb.kb_chunks?.[0]?.count ?? 0);
  }

  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    steps: {
      intake_submitted: submittedSet.has(a.id),
      agent_created: true,
      kb_uploaded: (kbMap[a.id] ?? 0) > 0,
      telephony_configured: !!(
        a.config?.exotel_number || a.config?.plivo_number
      ),
      test_call_passed: !!a.config?.test_call_passed,
      live: a.status === "active",
    },
  }));
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

// ─── Invoice Tab ──────────────────────────────────────────────────────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  return {
    label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    year: d.getFullYear(),
    month: d.getMonth(),
  };
});

async function fetchInvoiceData(clientId, year, month) {
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 1).toISOString();

  const [logsRes, agentsRes, campaignsRes] = await Promise.all([
    supabase
      .from("call_logs")
      .select(
        "id, agent_id, campaign_id, direction, duration_seconds, total_cost_inr, status, started_at",
      )
      .eq("client_id", clientId)
      .gte("started_at", start)
      .lt("started_at", end),
    supabase.from("agents").select("id, name, type").eq("client_id", clientId),
    supabase.from("campaigns").select("id, name").eq("client_id", clientId),
  ]);

  return {
    logs: logsRes.data ?? [],
    agents: agentsRes.data ?? [],
    campaigns: campaignsRes.data ?? [],
  };
}

function InvoiceTab({ clientId, clientName, contactName, contactEmail }) {
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0]);
  const { data, isLoading } = useSWR(
    ["invoice", clientId, selectedMonth.year, selectedMonth.month],
    ([, cid, y, m]) => fetchInvoiceData(cid, y, m),
  );

  const logs = data?.logs ?? [];
  const agentIndex = Object.fromEntries(
    (data?.agents ?? []).map((a) => [a.id, a]),
  );
  const campaignIndex = Object.fromEntries(
    (data?.campaigns ?? []).map((c) => [c.id, c]),
  );

  const totalCost = logs.reduce(
    (s, l) => s + (parseFloat(l.total_cost_inr) || 0),
    0,
  );
  const totalDur = logs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0);
  const totalCalls = logs.length;
  const completed = logs.filter((l) => l.status === "completed").length;

  // Per-agent rollup
  const agentMap = {};
  for (const l of logs) {
    const aid = l.agent_id ?? "__unknown__";
    if (!agentMap[aid]) agentMap[aid] = { calls: 0, dur: 0, cost: 0 };
    agentMap[aid].calls++;
    agentMap[aid].dur += l.duration_seconds ?? 0;
    agentMap[aid].cost += parseFloat(l.total_cost_inr) || 0;
  }

  // Per-campaign rollup
  const campMap = {};
  for (const l of logs) {
    if (!l.campaign_id) continue;
    const cid = l.campaign_id;
    if (!campMap[cid])
      campMap[cid] = { calls: 0, dur: 0, cost: 0, answered: 0 };
    campMap[cid].calls++;
    campMap[cid].dur += l.duration_seconds ?? 0;
    campMap[cid].cost += parseFloat(l.total_cost_inr) || 0;
    if (l.status === "completed") campMap[cid].answered++;
  }

  const invoiceNumber = `INV-${selectedMonth.year}${String(selectedMonth.month + 1).padStart(2, "0")}-${clientId.slice(0, 6).toUpperCase()}`;
  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <select
          value={selectedMonth.label}
          onChange={(e) =>
            setSelectedMonth(MONTHS.find((m) => m.label === e.target.value))
          }
          style={{ ...s.input, width: "auto", minWidth: "200px" }}
        >
          {MONTHS.map((m) => (
            <option key={m.label} value={m.label}>
              {m.label}
            </option>
          ))}
        </select>
        <button onClick={() => window.print()} style={s.btnPrimary}>
          Print / Save PDF
        </button>
      </div>

      {/* Invoice */}
      <div
        id="invoice-print"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.5rem",
                color: "var(--ink-900)",
                margin: "0 0 4px",
              }}
            >
              Tofabza Sounds
            </p>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--ink-400)",
                margin: 0,
              }}
            >
              tonyeappen@tofabza.com
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--ink-400)",
                margin: "0 0 4px",
                letterSpacing: "0.06em",
              }}
            >
              INVOICE
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                color: "var(--ink-900)",
                margin: "0 0 4px",
              }}
            >
              {invoiceNumber}
            </p>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--ink-400)",
                margin: 0,
              }}
            >
              {generatedDate}
            </p>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Bill to */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-400)",
              margin: "0 0 6px",
            }}
          >
            Bill To
          </p>
          <p
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--ink-900)",
              margin: "0 0 2px",
            }}
          >
            {clientName}
          </p>
          {contactName && (
            <p
              style={{
                fontSize: "0.84rem",
                color: "var(--ink-500)",
                margin: "0 0 2px",
              }}
            >
              {contactName}
            </p>
          )}
          {contactEmail && (
            <p
              style={{
                fontSize: "0.84rem",
                color: "var(--ink-500)",
                margin: 0,
              }}
            >
              {contactEmail}
            </p>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Summary */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-400)",
              margin: "0 0 12px",
            }}
          >
            Usage Summary — {selectedMonth.label}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1rem",
            }}
          >
            {[
              { label: "Total Calls", value: isLoading ? "—" : totalCalls },
              { label: "Completed", value: isLoading ? "—" : completed },
              {
                label: "Total Duration",
                value: isLoading
                  ? "—"
                  : totalDur < 60
                    ? totalDur + "s"
                    : Math.floor(totalDur / 60) + "m " + (totalDur % 60) + "s",
              },
              {
                label: "Total Cost",
                value: isLoading ? "—" : "₹" + totalCost.toFixed(2),
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ink-400)",
                    margin: "0 0 6px",
                  }}
                >
                  {label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "1.4rem",
                    color: "var(--ink-900)",
                    margin: 0,
                  }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Per-agent */}
        {!isLoading && Object.keys(agentMap).length > 0 && (
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-400)",
                margin: "0 0 12px",
              }}
            >
              By Agent
            </p>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.82rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {["Agent", "Calls", "Duration", "Cost"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 14px",
                          textAlign: "left",
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          letterSpacing: "0.06em",
                          color: "var(--ink-400)",
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(agentMap).map(([aid, v], i, arr) => (
                    <tr
                      key={aid}
                      style={{
                        borderBottom:
                          i < arr.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-900)",
                          fontWeight: 500,
                        }}
                      >
                        {agentIndex[aid]?.name ?? "Unknown"}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {v.calls}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {Math.floor(v.dur / 60)}m {v.dur % 60}s
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        ₹{v.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-campaign */}
        {!isLoading && Object.keys(campMap).length > 0 && (
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-400)",
                margin: "0 0 12px",
              }}
            >
              By Campaign
            </p>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.82rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {[
                      "Campaign",
                      "Calls",
                      "Answered",
                      "Answer Rate",
                      "Cost",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 14px",
                          textAlign: "left",
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          letterSpacing: "0.06em",
                          color: "var(--ink-400)",
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(campMap).map(([cid, v], i, arr) => (
                    <tr
                      key={cid}
                      style={{
                        borderBottom:
                          i < arr.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-900)",
                          fontWeight: 500,
                        }}
                      >
                        {campaignIndex[cid]?.name ?? "Unknown"}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {v.calls}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {v.answered}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {v.calls ? Math.round((v.answered / v.calls) * 100) : 0}
                        %
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.8rem",
                        }}
                      >
                        ₹{v.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Total line */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "baseline",
            gap: "16px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-400)",
            }}
          >
            Total Due
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "2rem",
              color: "var(--ink-900)",
            }}
          >
            {isLoading ? "—" : "₹" + totalCost.toFixed(2)}
          </span>
        </div>

        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--ink-400)",
            margin: 0,
            textAlign: "center",
          }}
        >
          This is a usage report generated by Tofabza Sounds. Actual billing may
          vary based on your plan.
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print, #invoice-print * { visibility: visible; }
          #invoice-print { position: absolute; left: 0; top: 0; width: 100%; border: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function DeleteDataModal({ clientName, clientId, onClose }) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleDelete() {
    if (confirm !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/delete-data`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDone(true);
    } catch {
      toast.error("Delete failed. Check console.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.box} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p style={{ fontSize: "2rem", margin: "0 0 8px" }}>✓</p>
            <p
              style={{
                color: "var(--ink-900)",
                fontWeight: 600,
                margin: "0 0 6px",
              }}
            >
              Data deleted
            </p>
            <p
              style={{
                color: "var(--ink-500)",
                fontSize: "0.84rem",
                margin: "0 0 20px",
              }}
            >
              All call logs, transcripts, widget sessions and tokens for{" "}
              <strong>{clientName}</strong> have been wiped.
            </p>
            <button onClick={onClose} style={s.btnGhost}>
              Close
            </button>
          </>
        ) : (
          <>
            <p
              style={{
                color: "var(--crimson-500, #e11d48)",
                fontWeight: 600,
                fontSize: "1rem",
                margin: "0 0 6px",
              }}
            >
              Delete patient data
            </p>
            <p
              style={{
                color: "var(--ink-500)",
                fontSize: "0.84rem",
                margin: "0 0 16px",
              }}
            >
              This permanently wipes all call logs, transcripts, widget sessions
              and tokens for <strong>{clientName}</strong>. Cannot be undone.
            </p>
            <label style={s.label}>Type DELETE to confirm</label>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              style={{
                ...s.input,
                marginBottom: "16px",
                borderColor:
                  confirm === "DELETE"
                    ? "var(--crimson-500, #e11d48)"
                    : undefined,
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleDelete}
                disabled={confirm !== "DELETE" || deleting}
                style={{
                  ...s.btnPrimary,
                  background: "var(--crimson-500, #e11d48)",
                  opacity: confirm !== "DELETE" ? 0.5 : 1,
                  cursor: confirm !== "DELETE" ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? "Deleting…" : "Delete data"}
              </button>
              <button onClick={onClose} style={s.btnGhost}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const modal = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  box: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
  },
};

const CHECKLIST_STEPS = [
  { key: "intake_submitted", label: "Intake submitted" },
  { key: "agent_created", label: "Agent created" },
  { key: "kb_uploaded", label: "KB uploaded" },
  { key: "telephony_configured", label: "Telephony configured" },
  { key: "test_call_passed", label: "Test call passed" },
  { key: "live", label: "Live" },
];

function ChecklistTab({ clientId }) {
  const { data: agents, mutate } = useSWR(`checklist:${clientId}`, () =>
    fetchChecklist(clientId),
  );
  const [toggling, setToggling] = useState(null);

  async function toggleTestCall(agentId, current) {
    setToggling(agentId);
    const { data: agentRow } = await supabase
      .from("agents")
      .select("config")
      .eq("id", agentId)
      .single();
    await supabase
      .from("agents")
      .update({ config: { ...agentRow?.config, test_call_passed: !current } })
      .eq("id", agentId);
    setToggling(null);
    mutate();
  }

  if (!agents) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{ ...s.skeleton, height: 80, borderRadius: 10 }}
          />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <p style={s.empty}>
        No agents yet. Create an agent to see the checklist.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {agents.map((agent) => {
        const allGreen = Object.values(agent.steps).every(Boolean);
        return (
          <div
            key={agent.id}
            style={{
              background: "var(--surface)",
              border: `1px solid ${allGreen ? "rgba(22,163,74,0.3)" : "var(--border)"}`,
              borderRadius: 10,
              padding: "1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <span
                style={{
                  fontWeight: 500,
                  fontSize: "0.9rem",
                  color: "var(--ink-900)",
                }}
              >
                {agent.name}
              </span>
              {allGreen ? (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    color: "#16A34A",
                    letterSpacing: "0.06em",
                  }}
                >
                  ● ALL GREEN
                </span>
              ) : (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-400)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {Object.values(agent.steps).filter(Boolean).length}/
                  {CHECKLIST_STEPS.length} DONE
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CHECKLIST_STEPS.map((step) => {
                const done = agent.steps[step.key];
                const isToggleable = step.key === "test_call_passed";
                return (
                  <div
                    key={step.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 7,
                      background: done
                        ? "rgba(22,163,74,0.06)"
                        : "var(--surface-2)",
                    }}
                  >
                    <span style={{ fontSize: "1rem", lineHeight: 1 }}>
                      {done ? "✅" : "⬜"}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.84rem",
                        color: done ? "var(--ink-700)" : "var(--ink-400)",
                        fontWeight: done ? 500 : 400,
                      }}
                    >
                      {step.label}
                    </span>
                    {isToggleable && (
                      <button
                        onClick={() => toggleTestCall(agent.id, done)}
                        disabled={toggling === agent.id}
                        style={{
                          ...s.btnGhost,
                          minHeight: 28,
                          padding: "4px 10px",
                          fontSize: "0.75rem",
                        }}
                      >
                        {toggling === agent.id
                          ? "…"
                          : done
                            ? "Unmark"
                            : "Mark passed"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  "Agents",
  "Widgets",
  "Campaigns",
  "Costs",
  "Invoice",
  "Checklist",
];

export default function ClientDetailPage({ params }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("Agents");
  const [editing, setEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setEditing((e) => !e)} style={s.btnGhost}>
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            style={{
              ...s.btnGhost,
              color: "var(--crimson-500, #e11d48)",
              borderColor: "var(--crimson-500, #e11d48)",
            }}
          >
            Delete data
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteDataModal
          clientName={client.name}
          clientId={id}
          onClose={() => setShowDeleteModal(false)}
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
        {activeTab === "Invoice" && (
          <InvoiceTab
            clientId={id}
            clientName={client.name}
            contactName={client.contact_name}
            contactEmail={client.contact_email}
          />
        )}
        {activeTab === "Checklist" && <ChecklistTab clientId={id} />}
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
