"use client";

import { useEffect, useState, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useParams, useRouter } from "next/navigation";

const STATUS_STYLE = {
  pending: { background: "#fff7ed", color: "#c2410c" },
  pushed: { background: "#ecfdf5", color: "#059669" },
  rejected: { background: "#fff1f2", color: "#e11d48" },
};

const FIELD_LABELS = {
  clinic_name: "Clinic Name",
  address: "Address",
  languages: "Languages",
  doctors: "Doctors",
  hours: "Hours",
  fees: "Fees",
  fallback_number: "Fallback Number",
  whatsapp_number: "WhatsApp Number",
  appointment_types: "Appointment Types",
  extra_notes: "Extra Notes",
};

export default function OnboardingDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [fileUrls, setFileUrls] = useState({});

  const sb = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    [],
  );

  useEffect(() => {
    if (!id) return;
    sb.from("onboarding_submissions")
      .select(`*, agents ( id, name, config, clients ( id, name ) )`)
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        console.log("submission:", data, error);
        setSub(data);
        setLoading(false);
        if (data?.files?.length) {
          Promise.all(
            data.files.map((f) =>
              sb.storage
                .from("onboarding-files")
                .createSignedUrl(f.path, 3600)
                .then(({ data: s }) => [f.path, s?.signedUrl]),
            ),
          ).then((entries) =>
            setFileUrls(Object.fromEntries(entries.filter(([, v]) => v))),
          );
        }
      });
  }, [id, sb]);

  async function handlePush() {
    if (!sub) return;
    setPushing(true);
    setToastMsg(null);
    const res = await fetch(`/api/onboard/${sub.agent_id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: id }),
    });
    const data = await res.json();
    if (res.ok) {
      setSub((s) => ({
        ...s,
        status: "pushed",
        pushed_at: new Date().toISOString(),
      }));
      setToastMsg({
        type: "success",
        msg: "Agent config updated and KB processing started.",
      });
    } else {
      setToastMsg({ type: "error", msg: data.error || "Push failed." });
    }
    setPushing(false);
  }

  async function handleReject() {
    if (!sub) return;
    await sb
      .from("onboarding_submissions")
      .update({ status: "rejected" })
      .eq("id", id);
    setSub((s) => ({ ...s, status: "rejected" }));
    setToastMsg({ type: "success", msg: "Submission marked as rejected." });
  }

  const s = {
    page: { padding: "2rem", maxWidth: 900, margin: "0 auto" },
    back: {
      fontSize: 13,
      color: "var(--ink-500)",
      cursor: "pointer",
      marginBottom: "1rem",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: "1.5rem",
      flexWrap: "wrap",
      gap: "1rem",
    },
    title: {
      fontSize: 24,
      fontWeight: 700,
      color: "var(--ink-900)",
      margin: 0,
      fontFamily: "var(--font-serif)",
    },
    sub: { fontSize: 14, color: "var(--ink-500)", marginTop: 4 },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 20,
      padding: "3px 12px",
      fontSize: 12,
      fontWeight: 600,
      fontFamily: "var(--font-mono)",
    },
    actions: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
    },
    pushBtn: {
      background: "#f97316",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "10px 20px",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer",
      minHeight: 40,
    },
    rejectBtn: {
      background: "transparent",
      color: "var(--ink-500)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "10px 16px",
      fontSize: 14,
      cursor: "pointer",
      minHeight: 40,
    },
    card: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "1.5rem",
      marginBottom: "1.25rem",
    },
    sLabel: {
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "var(--ink-500)",
      fontFamily: "var(--font-mono)",
      marginBottom: "1rem",
    },
    kv: {
      display: "grid",
      gridTemplateColumns: "180px 1fr",
      gap: "0.6rem 1rem",
      alignItems: "start",
    },
    key: { fontSize: 13, color: "var(--ink-500)", fontWeight: 600 },
    val: {
      fontSize: 14,
      color: "var(--ink-800)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
    fileItem: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 0",
      borderBottom: "1px solid var(--border)",
    },
    toast: {
      position: "fixed",
      top: 20,
      right: 24,
      zIndex: 999,
      borderRadius: 8,
      padding: "12px 20px",
      fontSize: 14,
      fontWeight: 500,
      minWidth: 260,
      boxShadow: "0 4px 16px rgba(0,0,0,.12)",
    },
  };

  if (loading)
    return (
      <div style={s.page}>
        <p style={{ color: "var(--ink-500)" }}>Loading…</p>
      </div>
    );
  if (!sub)
    return (
      <div style={s.page}>
        <p style={{ color: "var(--crimson-500)" }}>Submission not found.</p>
      </div>
    );

  const formData = sub.form_data || {};
  const files = sub.files || [];

  return (
    <div style={s.page}>
      {toastMsg && (
        <div
          style={{
            ...s.toast,
            background: toastMsg.type === "success" ? "#ecfdf5" : "#fff1f2",
            color: toastMsg.type === "success" ? "#059669" : "#e11d48",
            border: `1px solid ${toastMsg.type === "success" ? "#6ee7b7" : "#fca5a5"}`,
          }}
        >
          {toastMsg.msg}
        </div>
      )}

      <div style={s.back} onClick={() => router.push("/dashboard/onboarding")}>
        ← All submissions
      </div>

      <div style={s.header}>
        <div>
          <h1 style={s.title}>
            {formData.clinic_name || sub.agents?.name || "Submission"}
          </h1>
          <p style={s.sub}>
            Agent: <strong>{sub.agents?.name}</strong> · Client:{" "}
            <strong>{sub.agents?.clients?.name}</strong> · Submitted{" "}
            {new Date(sub.created_at).toLocaleString("en-IN")}
          </p>
        </div>
        <div style={s.actions}>
          <span style={{ ...s.pill, ...(STATUS_STYLE[sub.status] || {}) }}>
            {sub.status}
          </span>
          {sub.status === "pending" && (
            <>
              <button style={s.pushBtn} onClick={handlePush} disabled={pushing}>
                {pushing ? "Pushing…" : "✓ Push to Agent"}
              </button>
              <button style={s.rejectBtn} onClick={handleReject}>
                Reject
              </button>
            </>
          )}
          {sub.status === "pushed" && (
            <span style={{ fontSize: 13, color: "var(--ink-500)" }}>
              Pushed by {sub.pushed_by} ·{" "}
              {new Date(sub.pushed_at).toLocaleString("en-IN")}
            </span>
          )}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sLabel}>Clinic Information</div>
        <div style={s.kv}>
          {Object.entries(formData).map(([key, val]) => {
            if (!val) return null;
            return [
              <div key={`k-${key}`} style={s.key}>
                {FIELD_LABELS[key] || key.replace(/_/g, " ")}
              </div>,
              <div key={`v-${key}`} style={s.val}>
                {String(val)}
              </div>,
            ];
          })}
        </div>
        {Object.values(formData).every((v) => !v) && (
          <p style={{ color: "var(--ink-400)", fontSize: 14 }}>No form data.</p>
        )}
      </div>

      {files.length > 0 && (
        <div style={s.card}>
          <div style={s.sLabel}>Uploaded Files ({files.length})</div>
          {files.map((f, i) => (
            <div key={i} style={s.fileItem}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ flex: 1, fontSize: 14, color: "var(--ink-700)" }}>
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
              {fileUrls[f.path] && (
                <a
                  href={fileUrls[f.path]}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: "#f97316",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={s.sLabel}>Current Agent Config</div>
        <pre
          style={{
            fontSize: 12,
            color: "var(--ink-700)",
            background: "var(--surface-2)",
            borderRadius: 6,
            padding: "1rem",
            overflow: "auto",
            maxHeight: 300,
            fontFamily: "var(--font-mono)",
            margin: 0,
          }}
        >
          {JSON.stringify(sub.agents?.config || {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
