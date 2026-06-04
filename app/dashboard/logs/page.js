"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((r) => r.json());

const STAGES = [
  "inbound_webhook",
  "outbound_call_initiated",
  "websocket_connected",
  "websocket_disconnected",
  "stt_result",
  "llm_response",
  "tts_output",
  "status_callback",
  "error",
];

const PROVIDERS = ["exotel", "twilio", "myoperator", "plivo"];

function buildUrl(filters, page) {
  const params = new URLSearchParams();
  if (filters.callSid) params.set("call_sid", filters.callSid);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.status) params.set("status", filters.status);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  params.set("page", page);
  return `/api/logs?${params.toString()}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function timeUntil(iso) {
  if (!iso) return "—";
  const diff = new Date(iso) - new Date();
  if (diff <= 0) return "imminent";
  const hrs = Math.floor(diff / 1000 / 60 / 60);
  const mins = Math.floor((diff / 1000 / 60) % 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function LogsPage() {
  const [filters, setFilters] = useState({
    callSid: "",
    stage: "",
    status: "",
    provider: "",
    dateFrom: "",
    dateTo: "",
  });
  const [page, setPage] = useState(1);
  const [expandedRow, setExpanded] = useState(null);

  const { data, isLoading } = useSWR(buildUrl(filters, page), fetcher, {
    refreshInterval: 30000,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const summary = data?.summary || {};
  const pages = Math.ceil(total / 50);

  const setFilter = useCallback((key, val) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  }, []);

  const inputStyle = {
    background: "var(--surface-2, #1e1e2e)",
    border: "1px solid var(--border, #333)",
    borderRadius: 6,
    color: "var(--ink-500, #cdd6f4)",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
  };

  const labelStyle = {
    fontSize: 11,
    color: "var(--ink-300, #a6adc8)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* ── Title ── */}
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginBottom: 20,
          color: "var(--ink-500, #cdd6f4)",
        }}
      >
        Debug Logs
      </h1>

      {/* ── Retention summary ── */}
      <div
        style={{
          background: "var(--surface-2, #1e1e2e)",
          border: "1px solid var(--border, #333)",
          borderRadius: 8,
          padding: "12px 18px",
          marginBottom: 20,
          fontSize: 13,
          color: "var(--ink-300, #a6adc8)",
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        <span>
          <b style={{ color: "var(--ink-500, #cdd6f4)" }}>
            {summary.total_logs ?? "—"}
          </b>{" "}
          total logs
        </span>
        <span>
          Oldest:{" "}
          <b style={{ color: "var(--ink-500, #cdd6f4)" }}>
            {formatDate(summary.oldest_log)}
          </b>
        </span>
        <span>
          Errors:{" "}
          <b style={{ color: "#f38ba8" }}>{summary.error_count ?? "—"}</b>
        </span>
        <span>
          Next cleanup in:{" "}
          <b style={{ color: "var(--ink-500, #cdd6f4)" }}>
            {timeUntil(summary.next_expiry)}
          </b>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.5 }}>
          Auto-refreshes every 30s
        </span>
      </div>

      {/* ── Filters ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <label style={labelStyle}>Call SID</label>
          <input
            style={{ ...inputStyle, width: "100%" }}
            placeholder="Search..."
            value={filters.callSid}
            onChange={(e) => setFilter("callSid", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>Stage</label>
          <select
            style={{ ...inputStyle, width: "100%" }}
            value={filters.stage}
            onChange={(e) => setFilter("stage", e.target.value)}
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select
            style={{ ...inputStyle, width: "100%" }}
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Provider</label>
          <select
            style={{ ...inputStyle, width: "100%" }}
            value={filters.provider}
            onChange={(e) => setFilter("provider", e.target.value)}
          >
            <option value="">All providers</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>From date</label>
          <input
            type="date"
            style={{ ...inputStyle, width: "100%" }}
            value={filters.dateFrom}
            onChange={(e) => setFilter("dateFrom", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>To date</label>
          <input
            type="date"
            style={{ ...inputStyle, width: "100%" }}
            value={filters.dateTo}
            onChange={(e) => setFilter("dateTo", e.target.value)}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div
        style={{
          border: "1px solid var(--border, #333)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "var(--surface-2, #1e1e2e)" }}>
              {[
                "Call SID",
                "Stage",
                "Status",
                "Provider",
                "Error",
                "Created (IST)",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    color: "var(--ink-300, #a6adc8)",
                    fontWeight: 500,
                    borderBottom: "1px solid var(--border, #333)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--ink-300, #a6adc8)",
                  }}
                >
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--ink-300, #a6adc8)",
                  }}
                >
                  No logs found.
                </td>
              </tr>
            )}
            {logs.map((log) => {
              const isError = log.status === "error";
              const isExpanded = expandedRow === log.id;
              return [
                <tr
                  key={log.id}
                  onClick={() => setExpanded(isExpanded ? null : log.id)}
                  style={{
                    background: isError
                      ? "rgba(243,139,168,0.07)"
                      : "var(--surface-1, #181825)",
                    borderBottom: "1px solid var(--border, #333)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = isError
                      ? "rgba(243,139,168,0.13)"
                      : "var(--surface-2, #1e1e2e)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = isError
                      ? "rgba(243,139,168,0.07)"
                      : "var(--surface-1, #181825)")
                  }
                >
                  <td
                    style={{
                      padding: "9px 14px",
                      fontFamily: "monospace",
                      color: "var(--ink-300, #a6adc8)",
                      fontSize: 12,
                    }}
                  >
                    {log.call_sid || "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "var(--ink-500, #cdd6f4)",
                    }}
                  >
                    {log.stage}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span
                      style={{
                        background: isError
                          ? "rgba(243,139,168,0.15)"
                          : "rgba(166,227,161,0.1)",
                        color: isError ? "#f38ba8" : "#a6e3a1",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "var(--ink-300, #a6adc8)",
                    }}
                  >
                    {log.provider || "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "#f38ba8",
                      fontSize: 12,
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {log.error_message || "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "var(--ink-300, #a6adc8)",
                      fontSize: 12,
                    }}
                  >
                    {formatDate(log.created_at)}
                  </td>
                </tr>,

                // Expanded payload row
                isExpanded && (
                  <tr
                    key={`${log.id}-expanded`}
                    style={{
                      background: "var(--surface-2, #1e1e2e)",
                      borderBottom: "1px solid var(--border, #333)",
                    }}
                  >
                    <td colSpan={6} style={{ padding: "12px 18px" }}>
                      {log.error_message && (
                        <div style={{ marginBottom: 10 }}>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#f38ba8",
                              marginBottom: 4,
                              fontWeight: 600,
                            }}
                          >
                            ERROR
                          </div>
                          <pre
                            style={{
                              background: "rgba(243,139,168,0.08)",
                              border: "1px solid rgba(243,139,168,0.2)",
                              borderRadius: 6,
                              padding: 10,
                              fontSize: 12,
                              color: "#f38ba8",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              margin: 0,
                            }}
                          >
                            {log.error_message}
                          </pre>
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ink-300, #a6adc8)",
                          marginBottom: 4,
                          fontWeight: 600,
                        }}
                      >
                        PAYLOAD
                      </div>
                      <pre
                        style={{
                          background: "var(--surface-1, #181825)",
                          border: "1px solid var(--border, #333)",
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 12,
                          color: "var(--ink-500, #cdd6f4)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          margin: 0,
                          maxHeight: 320,
                          overflowY: "auto",
                        }}
                      >
                        {log.payload
                          ? JSON.stringify(log.payload, null, 2)
                          : "No payload"}
                      </pre>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 16,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            style={{
              background: "var(--surface-2, #1e1e2e)",
              border: "1px solid var(--border, #333)",
              borderRadius: 6,
              color: "var(--ink-500, #cdd6f4)",
              padding: "6px 14px",
              cursor: page === 1 ? "not-allowed" : "pointer",
              opacity: page === 1 ? 0.4 : 1,
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "var(--ink-300, #a6adc8)" }}>
            Page {page} of {pages} · {total} logs
          </span>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              background: "var(--surface-2, #1e1e2e)",
              border: "1px solid var(--border, #333)",
              borderRadius: 6,
              color: "var(--ink-500, #cdd6f4)",
              padding: "6px 14px",
              cursor: page === pages ? "not-allowed" : "pointer",
              opacity: page === pages ? 0.4 : 1,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
