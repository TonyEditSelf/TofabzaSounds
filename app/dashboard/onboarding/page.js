"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const STATUS_STYLE = {
  pending: { background: "#fff7ed", color: "#c2410c" },
  pushed: { background: "#ecfdf5", color: "#059669" },
  rejected: { background: "#fff1f2", color: "#e11d48" },
};

export default function OnboardingListPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );

    sb.from("onboarding_submissions")
      .select(
        `
        id, status, pushed_at, pushed_by, created_at,
        form_data,
        agents ( id, name, client_id, clients ( name ) )
      `,
      )
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setRows(data || []);
        setLoading(false);
      });
  }, []);

  const s = {
    page: { padding: "2rem" },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "1.5rem",
    },
    title: {
      fontSize: 24,
      fontWeight: 700,
      color: "var(--ink-900)",
      margin: 0,
      fontFamily: "var(--font-serif)",
    },
    card: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      overflow: "hidden",
    },
    th: {
      padding: "0.625rem 1rem",
      textAlign: "left",
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "var(--ink-500)",
      fontFamily: "var(--font-mono)",
      borderBottom: "1px solid var(--border)",
      whiteSpace: "nowrap",
    },
    td: {
      padding: "0.875rem 1rem",
      fontSize: 14,
      color: "var(--ink-700)",
      borderBottom: "1px solid var(--border)",
      verticalAlign: "middle",
    },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 20,
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 600,
      fontFamily: "var(--font-mono)",
    },
    row: { cursor: "pointer" },
    empty: {
      padding: "3rem",
      textAlign: "center",
      color: "var(--ink-500)",
      fontSize: 14,
    },
  };

  function clinicName(row) {
    return row.form_data?.clinic_name || row.agents?.name || "—";
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Onboarding Submissions</h1>
        <span style={{ fontSize: 13, color: "var(--ink-500)" }}>
          {rows.filter((r) => r.status === "pending").length} pending review
        </span>
      </div>

      <div style={s.card}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={s.empty}>
            No submissions yet. Share onboarding links with clients to get
            started.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Clinic",
                  "Agent",
                  "Client",
                  "Status",
                  "Submitted",
                  "Pushed By",
                ].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={s.row}
                  onClick={() => router.push(`/dashboard/onboarding/${row.id}`)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface-2)")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={s.td}>{clinicName(row)}</td>
                  <td style={s.td}>{row.agents?.name || "—"}</td>
                  <td style={s.td}>{row.agents?.clients?.name || "—"}</td>
                  <td style={s.td}>
                    <span
                      style={{ ...s.pill, ...(STATUS_STYLE[row.status] || {}) }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td style={s.td}>
                    {new Date(row.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={s.td}>{row.pushed_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
