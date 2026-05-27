"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function OnboardPage() {
  const { agent_id } = useParams();
  const [agent, setAgent] = useState(null);
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({});
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/onboard/${agent_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setAgent(data.agent);
        setFields(data.template_vars || []);
        const seed = {};
        (data.template_vars || []).forEach((v) => {
          seed[v.key] = "";
        });
        setForm(seed);
      })
      .catch(() => setError("Failed to load form. Please check the link."))
      .finally(() => setLoading(false));
  }, [agent_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.append("form_data", JSON.stringify(form));
    files.forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/onboard/${agent_id}`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Submission failed.");
      setSubmitting(false);
      return;
    }
    setDone(true);
  }

  const s = {
    page: {
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      padding: "2rem 1rem",
    },
    card: {
      maxWidth: 600,
      margin: "0 auto",
      background: "#fff",
      borderRadius: 12,
      padding: "2rem",
      boxShadow: "0 2px 16px rgba(0,0,0,.08)",
    },
    logo: {
      fontWeight: 700,
      fontSize: 18,
      color: "#f97316",
      marginBottom: "0.25rem",
    },
    badge: {
      display: "inline-block",
      background: "#fff7ed",
      color: "#c2410c",
      borderRadius: 20,
      padding: "3px 12px",
      fontSize: 12,
      fontWeight: 600,
      marginBottom: "1rem",
    },
    title: {
      fontSize: 22,
      fontWeight: 700,
      color: "#0a0b0f",
      margin: "0 0 .25rem",
    },
    sub: { fontSize: 14, color: "#666b86", marginBottom: "1.5rem" },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
    fullWidth: { gridColumn: "1 / -1" },
    group: { marginBottom: 0 },
    label: {
      display: "block",
      fontSize: 13,
      fontWeight: 600,
      color: "#2e3147",
      marginBottom: 4,
    },
    required: { color: "#e11d48", marginLeft: 2 },
    input: {
      width: "100%",
      border: "1px solid #e2e4ef",
      borderRadius: 6,
      padding: "9px 12px",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box",
      background: "#fff",
    },
    textarea: {
      width: "100%",
      border: "1px solid #e2e4ef",
      borderRadius: 6,
      padding: "9px 12px",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box",
      background: "#fff",
      minHeight: 90,
      resize: "vertical",
    },
    hint: { fontSize: 12, color: "#8b97b3", marginTop: 3 },
    divider: { borderTop: "1px solid #e2e4ef", margin: "1.5rem 0" },
    sectionTitle: {
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#8b97b3",
      marginBottom: "1rem",
    },
    btn: {
      width: "100%",
      background: "#f97316",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "13px",
      fontSize: 15,
      fontWeight: 600,
      cursor: "pointer",
      marginTop: "1rem",
    },
    success: { textAlign: "center", padding: "2rem 0" },
    errBox: {
      background: "#fff1f2",
      border: "1px solid #fca5a5",
      borderRadius: 8,
      padding: "10px 14px",
      color: "#b91c1c",
      fontSize: 13,
      marginBottom: "1rem",
    },
    fileZone: {
      border: "2px dashed #e2e4ef",
      borderRadius: 8,
      padding: "1.25rem",
      textAlign: "center",
      fontSize: 13,
      color: "#666b86",
      cursor: "pointer",
    },
    fileList: {
      marginTop: 8,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    },
    fileItem: {
      fontSize: 12,
      color: "#4a4e6b",
      background: "#f4f5fa",
      borderRadius: 4,
      padding: "4px 8px",
      display: "flex",
      justifyContent: "space-between",
    },
  };

  if (loading)
    return (
      <div style={s.page}>
        <div style={s.card}>
          <p style={{ color: "#8b97b3" }}>Loading…</p>
        </div>
      </div>
    );
  if (error && !agent)
    return (
      <div style={s.page}>
        <div style={s.card}>
          <p style={{ color: "#e11d48" }}>{error}</p>
        </div>
      </div>
    );

  if (done)
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logo}>Tofabza Sounds</div>
          <div style={s.success}>
            <div style={{ fontSize: 40, marginBottom: "1rem" }}>✅</div>
            <h2 style={{ ...s.title, textAlign: "center" }}>
              Submission received!
            </h2>
            <p style={{ ...s.sub, textAlign: "center" }}>
              Our team will review your information and activate your AI
              assistant shortly. You'll receive a WhatsApp message once it's
              live.
            </p>
          </div>
        </div>
      </div>
    );

  // Split fields: required/main fields first, then optional ones
  const mainFields = fields.filter((f) => f.required);
  const optionalFields = fields.filter((f) => !f.required);

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>tofabza</div>
        {agent?.facility_label && (
          <div style={s.badge}>{agent.facility_label}</div>
        )}
        <h1 style={s.title}>Set up your AI receptionist</h1>
        <p style={s.sub}>
          Fill in your details below. This takes about 5 minutes. Your AI
          assistant will be configured and ready within 24 hours.
        </p>

        {error && <div style={s.errBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Required fields in 2-col grid */}
          {mainFields.length > 0 && (
            <>
              <div style={s.sectionTitle}>Essential Details</div>
              <div style={s.grid}>
                {mainFields.map((f) => (
                  <div key={f.key} style={f.multiline ? s.fullWidth : s.group}>
                    <label style={s.label}>
                      {f.label}
                      <span style={s.required}>*</span>
                    </label>
                    {f.multiline ? (
                      <textarea
                        style={s.textarea}
                        value={form[f.key] || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder || ""}
                        required
                      />
                    ) : (
                      <input
                        style={s.input}
                        value={form[f.key] || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder || ""}
                        required
                        type={
                          f.key.includes("phone") || f.key.includes("number")
                            ? "tel"
                            : "text"
                        }
                      />
                    )}
                    {f.hint && <div style={s.hint}>{f.hint}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Optional fields */}
          {optionalFields.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.sectionTitle}>Additional Details (optional)</div>
              <div style={s.grid}>
                {optionalFields.map((f) => (
                  <div key={f.key} style={f.multiline ? s.fullWidth : s.group}>
                    <label style={s.label}>{f.label}</label>
                    {f.multiline ? (
                      <textarea
                        style={s.textarea}
                        value={form[f.key] || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder || ""}
                      />
                    ) : (
                      <input
                        style={s.input}
                        value={form[f.key] || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder || ""}
                        type={
                          f.key.includes("phone") || f.key.includes("number")
                            ? "tel"
                            : "text"
                        }
                      />
                    )}
                    {f.hint && <div style={s.hint}>{f.hint}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={s.divider} />

          {/* File uploads */}
          <div style={s.sectionTitle}>Supporting Documents (optional)</div>
          <p style={{ ...s.hint, marginBottom: 8 }}>
            Upload brochures, fee lists, test menus, or any documents the AI
            should reference.
          </p>
          <div
            style={s.fileZone}
            onClick={() => document.getElementById("kb-upload").click()}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>📎</div>
            Click to attach files (PDF, DOCX, TXT — max 10 MB each)
            <input
              id="kb-upload"
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.doc"
              style={{ display: "none" }}
              onChange={(e) =>
                setFiles((prev) => [...prev, ...Array.from(e.target.files)])
              }
            />
          </div>
          {files.length > 0 && (
            <div style={s.fileList}>
              {files.map((f, i) => (
                <div key={i} style={s.fileItem}>
                  <span>{f.name}</span>
                  <span
                    style={{ cursor: "pointer", color: "#e11d48" }}
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    ✕
                  </span>
                </div>
              ))}
            </div>
          )}

          <button type="submit" style={s.btn} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit →"}
          </button>
        </form>

        <p
          style={{
            fontSize: 12,
            color: "#8b97b3",
            textAlign: "center",
            marginTop: "1rem",
          }}
        >
          Powered by tofabza · Your data is stored securely and used only to
          configure your AI assistant.
        </p>
      </div>
    </div>
  );
}
