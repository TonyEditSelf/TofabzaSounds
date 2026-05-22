"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── status badge ────────────────────────────────────────────────────────────
const STATUS_META = {
  draft: { label: "Draft", color: "var(--ink-400)" },
  scheduled: { label: "Scheduled", color: "var(--saffron-500)" },
  running: { label: "Running", color: "var(--cobalt-600)" },
  completed: { label: "Completed", color: "var(--emerald-600)" },
  failed: { label: "Failed", color: "var(--crimson-500)" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    color: "var(--ink-400)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: meta.color + "18",
        color: meta.color,
        border: `1px solid ${meta.color}40`,
        fontFamily: "var(--font-mono)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: meta.color,
          boxShadow: status === "running" ? `0 0 6px ${meta.color}` : "none",
          animation: status === "running" ? "pulse 1.4s infinite" : "none",
        }}
      />
      {meta.label}
    </span>
  );
}

// ─── contact status pill ──────────────────────────────────────────────────────
const CONTACT_STATUS_META = {
  pending: { label: "Pending", color: "var(--ink-400)" },
  calling: { label: "Calling", color: "var(--cobalt-600)" },
  answered: { label: "Answered", color: "var(--emerald-600)" },
  failed: { label: "Failed", color: "var(--crimson-500)" },
  no_answer: { label: "No Answer", color: "var(--saffron-500)" },
};

function ContactPill({ status }) {
  const meta = CONTACT_STATUS_META[status] ?? {
    label: status,
    color: "var(--ink-400)",
  };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: meta.color + "18",
        color: meta.color,
        fontFamily: "var(--font-mono)",
      }}
    >
      {meta.label}
    </span>
  );
}

// ─── icon components ──────────────────────────────────────────────────────────
function Icon({ d, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  save: "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  launch: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  trash:
    "M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2",
  back: "M19 12H5M12 5l-7 7 7 7",
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  phone:
    "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.19 2.21 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z",
  calendar: "M3 4h18v16H3V4zM16 2v4M8 2v4M3 10h18",
  warning:
    "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
};

// ─── section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children, action }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink-700)",
            fontFamily: "var(--font-sans)",
            letterSpacing: "0.02em",
          }}
        >
          <Icon d={icon} size={14} />
          {title}
        </div>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [campaign, setCampaign] = useState(null);
  const [agents, setAgents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null); // { msg, type }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const fileInputRef = useRef(null);

  // form state
  const [form, setForm] = useState({
    name: "",
    status: "draft",
    agent_id: "",
    scheduled_at: "",
  });

  // ── toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      // campaign
      const { data: camp } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id)
        .single();
      if (!camp) {
        router.push("/dashboard/campaigns");
        return;
      }
      setCampaign(camp);
      setForm({
        name: camp.name ?? "",
        status: camp.status ?? "draft",
        agent_id: camp.agent_id ?? "",
        scheduled_at: camp.scheduled_at
          ? new Date(camp.scheduled_at).toISOString().slice(0, 16)
          : "",
      });

      // agents for this client (outbound only)
      const { data: ag } = await supabase
        .from("agents")
        .select("id, name, type, status")
        .eq("client_id", camp.client_id)
        .eq("type", "outbound");
      setAgents(ag ?? []);

      // contacts
      const res = await fetch(`/api/campaigns/${id}/contacts`);
      if (res.ok) setContacts(await res.json());

      setLoading(false);
    }
    load();
  }, [id]);

  // ── poll contacts when running ───────────────────────────────────────────────
  useEffect(() => {
    if (campaign?.status !== "running") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/campaigns/${id}/contacts`);
      if (res.ok) setContacts(await res.json());
      // refresh campaign status
      const { data } = await supabase
        .from("campaigns")
        .select("status")
        .eq("id", id)
        .single();
      if (data?.status !== "running") {
        setCampaign((prev) => ({ ...prev, status: data.status }));
        clearInterval(t);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [campaign?.status, id]);

  // ── save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("campaigns")
      .update({
        name: form.name,
        agent_id: form.agent_id || null,
        scheduled_at: form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) showToast("Failed to save: " + error.message, "error");
    else {
      showToast("Campaign saved");
      setCampaign((prev) => ({ ...prev, name: form.name }));
    }
  }

  // ── csv upload ───────────────────────────────────────────────────────────────
  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCSV(true);

    const text = await file.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // detect header
    const firstCols = lines[0].toLowerCase().split(",");
    const hasHeader = firstCols.some((c) =>
      ["phone", "name", "number", "mobile"].includes(c.trim()),
    );
    const rows = hasHeader ? lines.slice(1) : lines;

    let phoneIdx = 0,
      nameIdx = -1;
    if (hasHeader) {
      phoneIdx = firstCols.findIndex((c) =>
        ["phone", "number", "mobile"].includes(c.trim()),
      );
      nameIdx = firstCols.findIndex((c) => c.trim() === "name");
      if (phoneIdx < 0) phoneIdx = 0;
    }

    const contacts = rows
      .map((row) => {
        const cols = row
          .split(",")
          .map((c) => c.trim().replace(/^["']|["']$/g, ""));
        const phone = cols[phoneIdx] || "";
        const name = nameIdx >= 0 ? cols[nameIdx] || null : null;
        return { campaign_id: id, phone, name, status: "pending" };
      })
      .filter((c) => c.phone.length >= 7);

    if (contacts.length === 0) {
      showToast("No valid phone numbers found", "error");
      setUploadingCSV(false);
      return;
    }

    const { error } = await supabase.from("campaign_contacts").insert(contacts);
    setUploadingCSV(false);
    e.target.value = "";

    if (error) showToast("Upload failed: " + error.message, "error");
    else {
      showToast(`${contacts.length} contacts added`);
      const res = await fetch(`/api/campaigns/${id}/contacts`);
      if (res.ok) setContacts(await res.json());
    }
  }

  // ── delete contacts ──────────────────────────────────────────────────────────
  async function handleClearContacts() {
    const { error } = await supabase
      .from("campaign_contacts")
      .delete()
      .eq("campaign_id", id);
    if (error) showToast("Failed to clear contacts", "error");
    else {
      setContacts([]);
      showToast("Contacts cleared");
    }
  }

  async function handleRetry() {
    setLaunching(true);
    await supabase
      .from("campaign_contacts")
      .update({ status: "pending" })
      .eq("campaign_id", id)
      .in("status", ["failed", "no_answer"]);
    const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    const body = await res.json();
    setLaunching(false);
    if (!res.ok) showToast(body.error ?? "Retry failed", "error");
    else {
      showToast("Retrying failed contacts 🔁");
      setCampaign((prev) => ({ ...prev, status: "running" }));
      const r = await fetch(`/api/campaigns/${id}/contacts`);
      if (r.ok) setContacts(await r.json());
    }
  }

  // ── launch ───────────────────────────────────────────────────────────────────
  async function handleLaunch() {
    if (!form.agent_id) {
      showToast("Assign an agent first", "error");
      return;
    }
    if (contacts.length === 0) {
      showToast("Upload contacts first", "error");
      return;
    }
    setLaunching(true);
    const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    const body = await res.json();
    setLaunching(false);
    if (!res.ok) showToast(body.error ?? "Launch failed", "error");
    else {
      showToast("Campaign launched 🚀");
      setCampaign((prev) => ({ ...prev, status: "running" }));
    }
  }

  // ── delete campaign ──────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    setDeleting(false);
    if (error) showToast("Delete failed: " + error.message, "error");
    else router.push("/dashboard/campaigns");
  }

  // ── derived stats ─────────────────────────────────────────────────────────────
  const stats = {
    total: contacts.length,
    pending: contacts.filter((c) => c.status === "pending").length,
    answered: contacts.filter((c) => c.status === "answered").length,
    failed: contacts.filter((c) => ["failed", "no_answer"].includes(c.status))
      .length,
  };

  // ── loading skeleton ──────────────────────────────────────────────────────────
  if (loading)
    return (
      <div style={{ padding: 32, fontFamily: "var(--font-sans)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[200, 120, 280].map((w, i) => (
            <div
              key={i}
              style={{
                height: 16,
                width: w,
                borderRadius: 8,
                background: "var(--surface-2)",
                animation: "skeleton 1.4s ease infinite",
              }}
            />
          ))}
        </div>
      </div>
    );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink-900)",
      }}
    >
      {/* ── toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: "12px 18px",
            background:
              toast.type === "error"
                ? "var(--crimson-500)"
                : "var(--emerald-600)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            animation: "slideUp 0.25s ease",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── header ── */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 32px",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            height: 60,
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push("/dashboard/campaigns")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-500)",
              padding: 6,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Icon d={ICONS.back} size={18} />
          </button>

          <div
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}
          >
            <h1
              style={{
                fontSize: 17,
                fontWeight: 700,
                fontFamily: "var(--font-serif)",
                color: "var(--ink-900)",
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 340,
              }}
            >
              {campaign?.name ?? "Campaign"}
            </h1>
            <StatusBadge status={campaign?.status ?? "draft"} />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--cobalt-600)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Icon d={ICONS.save} size={14} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── body ── */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ── stat bar ── */}
        {contacts.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
            }}
          >
            {[
              { label: "Total", value: stats.total, color: "var(--ink-700)" },
              {
                label: "Pending",
                value: stats.pending,
                color: "var(--ink-500)",
              },
              {
                label: "Answered",
                value: stats.answered,
                color: "var(--emerald-600)",
              },
              {
                label: "Failed / NA",
                value: stats.failed,
                color: "var(--crimson-500)",
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: s.color,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-500)",
                    marginTop: 2,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── configuration ── */}
        <Section title="Configuration" icon={ICONS.calendar}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* name */}
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Campaign Name</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                style={inputStyle}
                placeholder="e.g. May Renewal Drive"
              />
            </div>

            {/* agent */}
            <div>
              <label style={labelStyle}>Outbound Agent</label>
              <select
                value={form.agent_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, agent_id: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">— Select agent —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {agents.length === 0 && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--saffron-500)",
                    marginTop: 6,
                  }}
                >
                  No outbound agents found for this client. Create one first.
                </p>
              )}
            </div>

            {/* schedule */}
            <div>
              <label style={labelStyle}>Scheduled At (optional)</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scheduled_at: e.target.value }))
                }
                style={inputStyle}
              />
            </div>
          </div>
        </Section>

        {/* ── contacts ── */}
        <Section
          title="Contacts"
          icon={ICONS.users}
          action={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {contacts.length > 0 && (
                <button
                  onClick={handleClearContacts}
                  style={{
                    ...ghostBtn,
                    color: "var(--crimson-500)",
                    borderColor: "var(--crimson-500)40",
                    fontSize: 12,
                  }}
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCSV}
                style={{ ...ghostBtn, fontSize: 12 }}
              >
                <Icon d={ICONS.upload} size={13} />
                {uploadingCSV ? "Uploading…" : "Upload CSV"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={handleCSV}
              />
            </div>
          }
        >
          {contacts.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 0",
                color: "var(--ink-400)",
                fontSize: 13,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              Upload a CSV with a{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                phone
              </code>{" "}
              column (and optional{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                name
              </code>{" "}
              column)
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    {["#", "Name", "Phone", "Status", "Called At"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "6px 12px",
                          color: "var(--ink-500)",
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: "0.04em",
                          borderBottom: "1px solid var(--border)",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background:
                          i % 2 === 0 ? "transparent" : "var(--surface-2)",
                      }}
                    >
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>
                        {c.name ?? (
                          <span style={{ color: "var(--ink-400)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                        }}
                      >
                        {c.phone}
                      </td>
                      <td style={tdStyle}>
                        <ContactPill status={c.status} />
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: "var(--ink-500)",
                          fontSize: 12,
                        }}
                      >
                        {c.called_at ? (
                          new Date(c.called_at).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        ) : (
                          <span style={{ color: "var(--ink-400)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── launch ── */}
        <Section title="Launch Campaign" icon={ICONS.launch}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-500)",
                maxWidth: 480,
                lineHeight: 1.6,
              }}
            >
              This will initiate outbound calls to all{" "}
              <strong style={{ color: "var(--ink-700)" }}>
                {stats.pending} pending
              </strong>{" "}
              contacts using the assigned Exotel ExoPhone. Calls run
              sequentially.
            </div>
            <button
              onClick={handleLaunch}
              disabled={
                launching ||
                campaign?.status === "running" ||
                campaign?.status === "completed"
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background:
                  campaign?.status === "running" ||
                  campaign?.status === "completed"
                    ? "var(--surface-2)"
                    : "var(--emerald-600)",
                color:
                  campaign?.status === "running" ||
                  campaign?.status === "completed"
                    ? "var(--ink-400)"
                    : "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 22px",
                fontSize: 13,
                fontWeight: 700,
                cursor:
                  launching ||
                  campaign?.status === "running" ||
                  campaign?.status === "completed"
                    ? "not-allowed"
                    : "pointer",
                letterSpacing: "0.04em",
                transition: "opacity 0.15s",
              }}
            >
              {stats.failed > 0 && (
                <button
                  onClick={handleRetry}
                  disabled={launching || campaign?.status === "running"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "none",
                    border: "1px solid var(--crimson-500)60",
                    color: "var(--crimson-500)",
                    borderRadius: 8,
                    padding: "10px 22px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ↺ Retry Failed ({stats.failed})
                </button>
              )}
              {launching
                ? "Launching…"
                : campaign?.status === "running"
                  ? "Running…"
                  : campaign?.status === "completed"
                    ? "Completed"
                    : "Launch Now"}
            </button>
          </div>
        </Section>

        {/* ── danger zone ── */}
        <div
          style={{
            border: "1px solid var(--crimson-500)30",
            borderRadius: 12,
            padding: "16px 20px",
            background: "var(--crimson-500)06",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--crimson-500)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon d={ICONS.warning} size={14} />
                Danger Zone
              </div>
              <div
                style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3 }}
              >
                Permanently delete this campaign and all associated contacts.
              </div>
            </div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  ...ghostBtn,
                  color: "var(--crimson-500)",
                  borderColor: "var(--crimson-500)50",
                }}
              >
                <Icon d={ICONS.trash} size={13} />
                Delete Campaign
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--crimson-500)" }}>
                  Are you sure?
                </span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    background: "var(--crimson-500)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ ...ghostBtn, fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── animations ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes skeleton {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// ── shared style tokens ────────────────────────────────────────────────────────
const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-500)",
  marginBottom: 6,
  letterSpacing: "0.03em",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--ink-900)",
  fontFamily: "var(--font-sans)",
  outline: "none",
  appearance: "none",
};

const ghostBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ink-700)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};

const tdStyle = {
  padding: "9px 12px",
  color: "var(--ink-700)",
  verticalAlign: "middle",
};
