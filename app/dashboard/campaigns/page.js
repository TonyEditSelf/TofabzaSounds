"use client";

/**
 * app/dashboard/campaigns/page.js
 *
 * Table: Name, Client, Status, Created
 * Inline add form (no modal)
 * Delete: type campaign name to confirm
 * Filters by activeClientId from Zustand
 */

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/store/ui";

const supabase = createClient();

const STATUSES = ["draft", "active", "paused", "completed"];

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchCampaigns(activeClientId) {
  let query = supabase
    .from("campaigns")
    .select("id, name, status, created_at, client_id, clients(name)")
    .order("created_at", { ascending: false });

  if (activeClientId) query = query.eq("client_id", activeClientId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Add Form ─────────────────────────────────────────────────────────────────

function AddCampaignForm({ clients, activeClientId, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    client_id: activeClientId ?? "",
    status: "draft",
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Campaign name is required.");
      return;
    }
    if (!form.client_id) {
      toast.error("Select a client.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("campaigns").insert({
      name: form.name.trim(),
      client_id: form.client_id,
      status: form.status,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to add campaign.");
      return;
    }
    toast.success("Campaign created.");
    onSuccess();
  }

  return (
    <tr style={{ background: "var(--surface-2)" }}>
      <td style={s.td}>
        <input
          autoFocus
          placeholder="Campaign name *"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          style={s.input}
        />
      </td>
      <td style={s.td}>
        <select
          value={form.client_id}
          onChange={(e) => set("client_id", e.target.value)}
          style={s.input}
        >
          <option value="">Select client *</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td style={s.td}>
        <select
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
          style={s.input}
        >
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </td>
      <td style={s.td} />
      <td style={s.td}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleSave} disabled={saving} style={s.btnPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onCancel} style={s.btnGhost}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ campaign, onDone, onCancel }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (typed !== campaign.name) {
      toast.error("Name doesn't match.");
      return;
    }
    setDeleting(true);
    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaign.id);
    setDeleting(false);
    if (error) {
      toast.error("Delete failed.");
      return;
    }
    toast.success(`${campaign.name} deleted.`);
    onDone();
  }

  return (
    <div style={s.deleteBox}>
      <p style={s.deleteText}>
        Type <strong>{campaign.name}</strong> to confirm deletion.
      </p>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          autoFocus
          placeholder={campaign.name}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          style={{ ...s.input, width: "220px" }}
        />
        <button
          onClick={handleDelete}
          disabled={deleting || typed !== campaign.name}
          style={{
            ...s.btnPrimary,
            background: "#E11D48",
            opacity: typed !== campaign.name ? 0.4 : 1,
          }}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <button onClick={onCancel} style={s.btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  draft: { bg: "rgba(255,255,255,0.06)", color: "var(--ink-400)" },
  active: { bg: "rgba(34,197,94,0.12)", color: "#22C55E" },
  paused: { bg: "rgba(249,115,22,0.12)", color: "var(--saffron-500)" },
  completed: { bg: "rgba(99,102,241,0.12)", color: "#818CF8" },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: c.bg,
        color: c.color,
        borderRadius: "4px",
        padding: "3px 8px",
      }}
    >
      {status}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return Array.from({ length: 3 }).map((_, i) => (
    <tr key={i} style={s.tr}>
      {Array.from({ length: 5 }).map((_, j) => (
        <td key={j} style={s.td}>
          <div style={{ ...s.skeleton, width: "70%", height: "12px" }} />
        </td>
      ))}
    </tr>
  ));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const activeClientId = useUIStore((s) => s.activeClientId);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const {
    data: campaigns = [],
    isLoading,
    mutate,
  } = useSWR(["campaigns", activeClientId], ([, cid]) => fetchCampaigns(cid));

  // Need clients list for the add form dropdown
  const { data: clients = [] } = useSWR("clients-list", async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  });

  return (
    <div>
      {/* Header */}
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Campaigns</h1>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} style={s.btnPrimary}>
            + New Campaign
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <DeleteConfirm
          campaign={deleting}
          onDone={() => {
            setDeleting(null);
            mutate();
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {["Name", "Client", "Status", "Created", ""].map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showAdd && (
              <AddCampaignForm
                clients={clients}
                activeClientId={activeClientId}
                onSuccess={() => {
                  setShowAdd(false);
                  mutate();
                }}
                onCancel={() => setShowAdd(false)}
              />
            )}

            {isLoading ? (
              <SkeletonRows />
            ) : campaigns.length === 0 && !showAdd ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    ...s.td,
                    textAlign: "center",
                    color: "var(--ink-400)",
                    padding: "2.5rem",
                  }}
                >
                  No campaigns yet. Create your first campaign above.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr
                  key={c.id}
                  style={{ ...s.tr }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td
                    style={{
                      ...s.td,
                      fontWeight: 500,
                      color: "var(--ink-900)",
                    }}
                  >
                    {c.name}
                  </td>
                  <td style={s.td}>{c.clients?.name ?? "—"}</td>
                  <td style={s.td}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td
                    style={{
                      ...s.td,
                      color: "var(--ink-400)",
                      fontSize: "0.78rem",
                    }}
                  >
                    {new Date(c.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={s.td}>
                    <button
                      onClick={() => setDeleting(c)}
                      style={s.btnDelete}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#E11D48";
                        e.currentTarget.style.borderColor =
                          "rgba(225,29,72,0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--ink-400)";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: 0,
  },
  tableWrap: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" },
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
  input: {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    background: "var(--surface)",
    padding: "6px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: "34px",
    boxSizing: "border-box",
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
  deleteBox: {
    background: "var(--surface-2)",
    border: "1px solid rgba(225,29,72,0.2)",
    borderRadius: "8px",
    padding: "1rem 1.25rem",
    marginBottom: "1rem",
  },
  deleteText: {
    fontSize: "0.84rem",
    color: "var(--ink-700)",
    margin: "0 0 0.75rem",
  },
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
