"use client";

/**
 * app/dashboard/costs/page.js
 *
 * Shows:
 * - Summary: raw cost, billed to client, margin, markup
 * - Daily cost chart
 * - Per-call breakdown table: STT + TTS + Exotel + total raw + billed
 * - Projected monthly cost
 * Filters: client (Zustand), date range, direction
 */

import { useState, useMemo } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/store/ui";

const supabase = createClient();

// ─── Pricing constants (mirror of lib/costs/pricing.js) ──────────────────────
const SARVAM = {
  STT_PER_SECOND: 0.00833,
  TTS_PER_CHARACTER: 0.003,
};
const EXOTEL_PER_MINUTE = 1.0; // TODO: update from your Exotel plan
const MARKUP = 2.5;

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
];

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchLogs(clientId) {
  let q = supabase
    .from("call_logs")
    .select(
      "id, direction, duration_seconds, total_cost_inr, status, started_at, caller_number",
    )
    .order("started_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

/**
 * Estimate per-call costs from duration.
 * total_cost_inr in DB = raw cost stored by telephony server.
 * If it's 0 or null we estimate from duration.
 */
function estimateCosts(log) {
  const dur = log.duration_seconds ?? 0;
  const stt = dur * SARVAM.STT_PER_SECOND;
  // Rough TTS estimate: ~150 chars/min of speech
  const tts = Math.round((dur / 60) * 150) * SARVAM.TTS_PER_CHARACTER;
  const exo = (dur / 60) * EXOTEL_PER_MINUTE;
  const raw = parseFloat(log.total_cost_inr) || stt + tts + exo;
  const billed = raw * MARKUP;
  return { stt, tts, exo, raw, billed, margin: billed - raw };
}

function fmtINR(n) {
  return "₹" + (n ?? 0).toFixed(2);
}

function fmtDur(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? m + "m " + s + "s" : s + "s";
}

function applyFilters(logs, days, direction) {
  let out = logs;
  if (days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    out = out.filter((l) => l.started_at && new Date(l.started_at) >= cutoff);
  }
  if (direction !== "all") {
    out = out.filter((l) => l.direction === direction);
  }
  return out;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>{label}</p>
      <p style={{ ...s.cardValue, color: accent ?? "var(--ink-900)" }}>
        {value}
      </p>
      {sub && <p style={s.cardSub}>{sub}</p>}
    </div>
  );
}

function CostBar({ rawTotal, billedTotal }) {
  const max = billedTotal || 1;
  const rawPct = Math.round((rawTotal / max) * 100);
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>Raw Cost vs Billed</p>
      <div style={{ marginTop: "14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.78rem",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "var(--ink-500)" }}>Raw API cost</span>
          <span style={{ color: "var(--ink-700)" }}>{fmtINR(rawTotal)}</span>
        </div>
        <div
          style={{
            height: "6px",
            borderRadius: "3px",
            background: "var(--border)",
            overflow: "hidden",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              width: rawPct + "%",
              height: "100%",
              background: "var(--saffron-500)",
              transition: "width 0.4s",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.78rem",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "var(--ink-500)" }}>
            Billed to client ({MARKUP}×)
          </span>
          <span style={{ color: "#22C55E" }}>{fmtINR(billedTotal)}</span>
        </div>
        <div
          style={{
            height: "6px",
            borderRadius: "3px",
            background: "var(--border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#22C55E",
              transition: "width 0.4s",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function CostBreakdownCard({ sttTotal, ttsTotal, exoTotal }) {
  const total = sttTotal + ttsTotal + exoTotal || 1;
  const items = [
    { label: "Sarvam STT", value: sttTotal, color: "#818CF8" },
    { label: "Sarvam TTS", value: ttsTotal, color: "var(--saffron-500)" },
    { label: "Exotel", value: exoTotal, color: "#22C55E" },
  ];
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>Cost Breakdown</p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginTop: "14px",
        }}
      >
        {items.map((item) => (
          <div key={item.label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.78rem",
                marginBottom: "4px",
              }}
            >
              <span style={{ color: item.color }}>{item.label}</span>
              <span style={{ color: "var(--ink-500)" }}>
                {fmtINR(item.value)} ({Math.round((item.value / total) * 100)}%)
              </span>
            </div>
            <div
              style={{
                height: "4px",
                borderRadius: "2px",
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: Math.round((item.value / total) * 100) + "%",
                  height: "100%",
                  background: item.color,
                  transition: "width 0.4s",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyCostChart({ logs, days }) {
  const chartDays = days ?? 30;
  const now = new Date();
  const daysList = Array.from({ length: chartDays }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (chartDays - 1 - i));
    return d.toISOString().slice(0, 10);
  });

  const dailyMap = {};
  for (const l of logs) {
    const day = l.started_at ? l.started_at.slice(0, 10) : null;
    if (day) {
      const { raw } = estimateCosts(l);
      dailyMap[day] = (dailyMap[day] ?? 0) + raw;
    }
  }

  const daily = daysList.map((d) => ({ date: d, cost: dailyMap[d] ?? 0 }));
  const maxCost = Math.max(...daily.map((d) => d.cost), 1);
  const n = daily.length;
  const labelEvery = n <= 7 ? 1 : n <= 30 ? 5 : 10;

  return (
    <div style={{ ...s.card, gridColumn: "1 / -1" }}>
      <p style={s.cardLabel}>Daily Raw Cost (₹)</p>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "3px",
          height: "80px",
          marginTop: "16px",
        }}
      >
        {daily.map((d) => {
          const pct = (d.cost / maxCost) * 100;
          return (
            <div
              key={d.date}
              title={d.date + ": " + fmtINR(d.cost)}
              style={{
                flex: 1,
                height: Math.max(pct, d.cost > 0 ? 4 : 1) + "%",
                background: d.cost > 0 ? "var(--saffron-500)" : "var(--border)",
                borderRadius: "2px 2px 0 0",
                minHeight: "2px",
                cursor: "default",
                transition: "height 0.3s",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", marginTop: "6px" }}>
        {daily.map((d, i) => (
          <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
            {i % labelEvery === 0 && (
              <span
                style={{
                  fontSize: "9px",
                  color: "var(--ink-400)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {d.date.slice(5)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CallTable({ logs }) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const pages = Math.ceil(logs.length / PAGE_SIZE);
  const visible = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ ...s.tableWrap, gridColumn: "1 / -1" }}>
      <table style={s.table}>
        <thead>
          <tr>
            {[
              "Date",
              "Direction",
              "Duration",
              "STT",
              "TTS",
              "Exotel",
              "Raw Cost",
              "Billed",
              "Status",
            ].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td
                colSpan={9}
                style={{
                  ...s.td,
                  textAlign: "center",
                  color: "var(--ink-400)",
                  padding: "2rem",
                }}
              >
                No calls in this period.
              </td>
            </tr>
          )}
          {visible.map((l) => {
            const c = estimateCosts(l);
            return (
              <tr
                key={l.id}
                style={s.tr}
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
                    fontSize: "0.78rem",
                    color: "var(--ink-400)",
                  }}
                >
                  {l.started_at
                    ? new Date(l.started_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </td>
                <td style={s.td}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: l.direction === "inbound" ? "#22C55E" : "#818CF8",
                    }}
                  >
                    {l.direction ?? "—"}
                  </span>
                </td>
                <td style={s.td}>{fmtDur(l.duration_seconds)}</td>
                <td style={{ ...s.td, color: "#818CF8" }}>{fmtINR(c.stt)}</td>
                <td style={{ ...s.td, color: "var(--saffron-500)" }}>
                  {fmtINR(c.tts)}
                </td>
                <td style={{ ...s.td, color: "#22C55E" }}>{fmtINR(c.exo)}</td>
                <td
                  style={{ ...s.td, fontWeight: 500, color: "var(--ink-900)" }}
                >
                  {fmtINR(c.raw)}
                </td>
                <td style={{ ...s.td, fontWeight: 500, color: "#22C55E" }}>
                  {fmtINR(c.billed)}
                </td>
                <td style={s.td}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      letterSpacing: "0.06em",
                      textTransform: "capitalize",
                      color:
                        l.status === "completed"
                          ? "#22C55E"
                          : l.status === "failed"
                            ? "#E11D48"
                            : "var(--ink-400)",
                    }}
                  >
                    {l.status ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pages > 1 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
            padding: "0.75rem 1rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={s.btnGhost}
          >
            ← Prev
          </button>
          <span
            style={{
              fontSize: "0.84rem",
              color: "var(--ink-400)",
              lineHeight: "40px",
            }}
          >
            {page + 1} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page === pages - 1}
            style={s.btnGhost}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={s.card}>
      <div
        style={{
          ...s.skeleton,
          height: "10px",
          width: "50%",
          marginBottom: "12px",
        }}
      />
      <div style={{ ...s.skeleton, height: "28px", width: "70%" }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostsPage() {
  const activeClientId = useUIStore((st) => st.activeClientId);
  const activeClientName = useUIStore((st) => st.activeClientName);

  const [dateRange, setDateRange] = useState(DATE_RANGES[1]);
  const [direction, setDirection] = useState("all");

  const { data: allLogs = [], isLoading } = useSWR(
    ["call_logs_costs", activeClientId],
    ([, cid]) => fetchLogs(cid),
  );

  const filtered = useMemo(
    () => applyFilters(allLogs, dateRange.days, direction),
    [allLogs, dateRange, direction],
  );

  const totals = useMemo(() => {
    let rawTotal = 0,
      billedTotal = 0,
      sttTotal = 0,
      ttsTotal = 0,
      exoTotal = 0;
    for (const l of filtered) {
      const c = estimateCosts(l);
      rawTotal += c.raw;
      billedTotal += c.billed;
      sttTotal += c.stt;
      ttsTotal += c.tts;
      exoTotal += c.exo;
    }
    const margin = billedTotal - rawTotal;
    const marginPct = billedTotal
      ? Math.round((margin / billedTotal) * 100)
      : 0;

    // Projected monthly: daily avg × 30
    const days = dateRange.days ?? 30;
    const dailyAvgRaw = filtered.length ? rawTotal / days : 0;
    const projectedMonthly = dailyAvgRaw * 30 * MARKUP;

    return {
      rawTotal,
      billedTotal,
      margin,
      marginPct,
      sttTotal,
      ttsTotal,
      exoTotal,
      projectedMonthly,
    };
  }, [filtered, dateRange]);

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Costs</h1>
          {activeClientName && (
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "0.84rem",
                color: "var(--ink-400)",
              }}
            >
              {activeClientName}
            </p>
          )}
        </div>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--ink-400)",
            margin: 0,
            fontFamily: "var(--font-mono)",
            textAlign: "right",
          }}
        >
          Markup: {MARKUP}× · Exotel: ₹{EXOTEL_PER_MINUTE}/min
        </p>
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <select
          value={dateRange.label}
          onChange={(e) =>
            setDateRange(DATE_RANGES.find((r) => r.label === e.target.value))
          }
          style={s.select}
        >
          {DATE_RANGES.map((r) => (
            <option key={r.label} value={r.label}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          style={s.select}
        >
          {["all", "inbound", "outbound"].map((d) => (
            <option key={d} value={d}>
              {d === "all"
                ? "All directions"
                : d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div style={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div style={s.grid}>
          <SummaryCard
            label="Raw API Cost"
            value={fmtINR(totals.rawTotal)}
            sub={filtered.length + " calls · " + dateRange.label}
          />
          <SummaryCard
            label="Billed to Client"
            value={fmtINR(totals.billedTotal)}
            sub={"At " + MARKUP + "× markup"}
            accent="#22C55E"
          />
          <SummaryCard
            label="Your Margin"
            value={fmtINR(totals.margin)}
            sub={totals.marginPct + "% of billed"}
            accent="var(--saffron-500)"
          />
          <SummaryCard
            label="Projected Monthly"
            value={fmtINR(totals.projectedMonthly)}
            sub={"Based on " + dateRange.label + " avg"}
          />
          <CostBar
            rawTotal={totals.rawTotal}
            billedTotal={totals.billedTotal}
          />
          <CostBreakdownCard
            sttTotal={totals.sttTotal}
            ttsTotal={totals.ttsTotal}
            exoTotal={totals.exoTotal}
          />
          <DailyCostChart logs={filtered} days={dateRange.days} />
          <CallTable logs={filtered} />
        </div>
      )}

      {!isLoading && allLogs.length === 0 && (
        <p
          style={{
            color: "var(--ink-400)",
            fontSize: "0.84rem",
            marginTop: "1rem",
          }}
        >
          No call logs yet. Cost data will appear once calls are made.
        </p>
      )}

      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}"}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "1.25rem",
  },
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: 0,
  },
  filterBar: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "1.5rem",
  },
  select: {
    border: "1px solid var(--border)",
    borderRadius: "7px",
    padding: "7px 12px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-700)",
    background: "var(--surface)",
    cursor: "pointer",
    outline: "none",
    minHeight: "40px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.25rem",
  },
  cardLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-400)",
    margin: 0,
  },
  cardValue: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: "6px 0 0",
  },
  cardSub: {
    fontSize: "0.78rem",
    color: "var(--ink-400)",
    margin: "4px 0 0",
    fontFamily: "var(--font-sans)",
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
  td: { padding: "0.75rem 1rem", color: "var(--ink-700)" },
  btnGhost: {
    background: "transparent",
    color: "var(--ink-500)",
    border: "1px solid var(--border)",
    borderRadius: "7px",
    padding: "8px 14px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: "40px",
    fontFamily: "var(--font-sans)",
  },
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
