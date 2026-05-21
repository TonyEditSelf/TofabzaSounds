"use client";

/**
 * app/dashboard/clients/page.js
 *
 * Table: Name, Contact, Phone, Email, Agents, Widgets, Created
 * Inline add form (no modal)
 * Delete: type client name to confirm → cascade handled by DB ON DELETE CASCADE
 * Click row → /dashboard/clients/[id]
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchClients() {
  const { data, error } = await supabase
    .from("clients")
    .select(
      `
      id, name, contact_name, contact_phone, contact_email, created_at,
      agents(count),
      widgets(count)
    `,
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─── Add Client Form ──────────────────────────────────────────────────────────

function AddClientForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Client name is required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("clients").insert({
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to add client.");
      return;
    }
    toast.success("Client added.");
    onSuccess();
  }

  return (
    <tr style={{ background: "rgba(37,99,235,0.03)" }}>
      <td style={s.td}>
        <input
          autoFocus
          placeholder="Client name *"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          style={s.input}
        />
      </td>
      <td style={s.td}>
        <input
          placeholder="Contact name"
          value={form.contact_name}
          onChange={(e) => set("contact_name", e.target.value)}
          style={s.input}
        />
      </td>
      <td style={s.td}>
        <input
          placeholder="Phone"
          value={form.contact_phone}
          onChange={(e) => set("contact_phone", e.target.value)}
          style={s.input}
        />
      </td>
      <td style={s.td}>
        <input
          placeholder="Email"
          value={form.contact_email}
          onChange={(e) => set("contact_email", e.target.value)}
          style={s.input}
        />
      </td>
      <td style={s.td}>
        <input
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          style={s.input}
        />
      </td>
      <td style={s.td} colSpan={2}>
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

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ client, onDone, onCancel }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (typed !== client.name) {
      toast.error("Name doesn't match.");
      return;
    }
    setDeleting(true);
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", client.id);
    setDeleting(false);
    if (error) {
      toast.error("Delete failed.");
      return;
    }
    toast.success(`${client.name} deleted.`);
    onDone();
  }

  return (
    <div style={s.deleteBox}>
      <p style={s.deleteText}>
        Type <strong>{client.name}</strong> to confirm deletion. This will
        delete all agents, widgets, and campaigns.
      </p>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          autoFocus
          placeholder={client.name}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          style={{ ...s.input, width: "220px" }}
        />
        <button
          onClick={handleDelete}
          disabled={deleting || typed !== client.name}
          style={{
            ...s.btnPrimary,
            background: "#E11D48",
            opacity: typed !== client.name ? 0.4 : 1,
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return Array.from({ length: 3 }).map((_, i) => (
    <tr key={i} style={s.tr}>
      {Array.from({ length: 7 }).map((_, j) => (
        <td key={j} style={s.td}>
          <div style={{ ...s.skeleton, width: "70%", height: "12px" }} />
        </td>
      ))}
    </tr>
  ));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState(null); // client object

  const {
    data: clients = [],
    isLoading,
    mutate,
  } = useSWR("clients", fetchClients);

  return (
    <div>
      {/* Header */}
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Clients</h1>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} style={s.btnPrimary}>
            + Add Client
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <DeleteConfirm
          client={deleting}
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
              {[
                "Name",
                "Contact",
                "Phone",
                "Email",
                "Agents",
                "Widgets",
                "Created",
                "",
              ].map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Inline add form */}
            {showAdd && (
              <AddClientForm
                onSuccess={() => {
                  setShowAdd(false);
                  mutate();
                }}
                onCancel={() => setShowAdd(false)}
              />
            )}

            {isLoading ? (
              <SkeletonRows />
            ) : clients.length === 0 && !showAdd ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    ...s.td,
                    textAlign: "center",
                    color: "var(--ink-400)",
                    padding: "2.5rem",
                  }}
                >
                  No clients yet. Add your first client above.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr
                  key={c.id}
                  style={{ ...s.tr, cursor: "pointer" }}
                  onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#F8F9FF")
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
                  <td style={s.td}>{c.contact_name ?? "—"}</td>
                  <td style={s.td}>{c.contact_phone ?? "—"}</td>
                  <td style={s.td}>{c.contact_email ?? "—"}</td>
                  <td style={{ ...s.td, textAlign: "center" }}>
                    {c.agents?.[0]?.count ?? 0}
                  </td>
                  <td style={{ ...s.td, textAlign: "center" }}>
                    {c.widgets?.[0]?.count ?? 0}
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
                  <td style={s.td} onClick={(e) => e.stopPropagation()}>
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

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
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
    background: "#fff",
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
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "0.875rem 1rem",
    color: "var(--ink-700)",
  },
  input: {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    outline: "none",
    minHeight: "34px",
    boxSizing: "border-box",
  },
  btnPrimary: {
    background: "var(--cobalt-600, #2563EB)",
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
    background: "#FFF1F2",
    border: "1px solid rgba(225,29,72,0.2)",
    borderRadius: "8px",
    padding: "1rem 1.25rem",
    marginBottom: "1rem",
  },
  deleteText: {
    fontSize: "0.84rem",
    color: "var(--ink-700)",
    marginBottom: "0.75rem",
    margin: "0 0 0.75rem",
  },
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
