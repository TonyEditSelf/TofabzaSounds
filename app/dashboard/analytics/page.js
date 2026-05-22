"use client";

/**
 * app/dashboard/analytics/page.js
 *
 * Filters: client (Zustand), date range, direction, status
 * Metrics: total calls, total duration, total cost, avg duration
 * Inbound vs outbound split bar
 * Status breakdown
 * Daily call volume chart (last N days)
 */

import { useState, useMemo } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/store/ui";

const supabase = createClient();

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
];

const DIRECTIONS = ["all", "inbound", "outbound"];
const STATUSES = ["all", "completed", "failed", "busy", "no-answer"];

const STATUS_COLORS = {
  completed: "#22C55E",
  failed: "#E11D48",
  busy: "var(--saffron-500)",
  "no-answer": "#818CF8",
  unknown: "var(--ink-400)",
};

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchCallLogs(clientId) {
  let query = supabase
    .from("call_logs")
    .select(
      "id, direction, duration_seconds, total_cost_inr, status, started_at",
    )
    .order("started_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs) return "0s";
  if (secs < 60) return secs + "s";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? m + "m " + s + "s" : m + "m";
}

function fmtCost(n) {
  return "₹" + n.toFixed(2);
}

function applyFilters(logs, days, direction, status) {
  let filtered = logs;

  if (days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    filtered = filtered.filter(
      (l) => l.started_at && new Date(l.started_at) >= cutoff,
    );
  }

  if (direction !== "all") {
    filtered = filtered.filter((l) => l.direction === direction);
  }

  if (status !== "all") {
    filtered = filtered.filter((l) => (l.status ?? "unknown") === status);
  }

  return filtered;
}

function computeMetrics(logs, days) {
  const total = logs.length;
  const totalDur = logs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0);
  const totalCost = logs.reduce(
    (s, l) => s + (parseFloat(l.total_cost_inr) || 0),
    0,
  );
  const avgDur = total ? Math.round(totalDur / total) : 0;
  const inbound = logs.filter((l) => l.direction === "inbound").length;
  const outbound = logs.filter((l) => l.direction === "outbound").length;

  const statusMap = {};
  for (const l of logs) {
    const st = l.status ?? "unknown";
    statusMap[st] = (statusMap[st] ?? 0) + 1;
  }

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
    if (day) dailyMap[day] = (dailyMap[day] ?? 0) + 1;
  }

  const daily = daysList.map((d) => ({ date: d, count: dailyMap[d] ?? 0 }));
  const maxDaily = Math.max(...daily.map((d) => d.count), 1);

  return {
    total,
    totalDur,
    totalCost,
    avgDur,
    inbound,
    outbound,
    statusMap,
    daily,
    maxDaily,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }) {
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>{label}</p>
      <p style={s.cardValue}>{value}</p>
      {sub && <p style={s.cardSub}>{sub}</p>}
    </div>
  );
}

function SplitBar({ inbound, outbound }) {
  const total = inbound + outbound || 1;
  const inPct = Math.round((inbound / total) * 100);
  const outPct = 100 - inPct;
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>Direction Split</p>
      <div
        style={{
          display: "flex",
          height: "8px",
          borderRadius: "4px",
          overflow: "hidden",
          margin: "14px 0 10px",
        }}
      >
        <div
          style={{
            width: inPct + "%",
            background: "#22C55E",
            transition: "width 0.4s",
          }}
        />
        <div
          style={{
            width: outPct + "%",
            background: "#818CF8",
            transition: "width 0.4s",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.78rem",
        }}
      >
        <span style={{ color: "#22C55E" }}>
          Inbound {inPct}% ({inbound})
        </span>
        <span style={{ color: "#818CF8" }}>
          Outbound {outPct}% ({outbound})
        </span>
      </div>
    </div>
  );
}

function StatusBreakdown({ statusMap }) {
  const entries = Object.entries(statusMap).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>Status Breakdown</p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginTop: "14px",
        }}
      >
        {entries.length === 0 && (
          <p
            style={{ fontSize: "0.84rem", color: "var(--ink-400)", margin: 0 }}
          >
            No data
          </p>
        )}
        {entries.map(([st, count]) => (
          <div key={st}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.78rem",
                marginBottom: "4px",
              }}
            >
              <span
                style={{
                  color: STATUS_COLORS[st] ?? "var(--ink-400)",
                  textTransform: "capitalize",
                }}
              >
                {st}
              </span>
              <span style={{ color: "var(--ink-500)" }}>
                {count} ({Math.round((count / total) * 100)}%)
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
                  width: Math.round((count / total) * 100) + "%",
                  height: "100%",
                  background: STATUS_COLORS[st] ?? "var(--ink-400)",
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

function DailyChart({ daily, maxDaily }) {
  const n = daily.length;
  const labelEvery = n <= 7 ? 1 : n <= 30 ? 5 : 10;
  return (
    <div style={{ ...s.card, gridColumn: "1 / -1" }}>
      <p style={s.cardLabel}>Daily Call Volume</p>
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
          const pct = (d.count / maxDaily) * 100;
          return (
            <div
              key={d.date}
              title={d.date + ": " + d.count + " calls"}
              style={{
                flex: 1,
                height: Math.max(pct, d.count > 0 ? 4 : 1) + "%",
                background:
                  d.count > 0 ? "var(--saffron-500)" : "var(--border)",
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

export default function AnalyticsPage() {
  const activeClientId = useUIStore((st) => st.activeClientId);
  const activeClientName = useUIStore((st) => st.activeClientName);

  const [dateRange, setDateRange] = useState(DATE_RANGES[1]);
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");

  const { data: allLogs = [], isLoading } = useSWR(
    ["call_logs_analytics", activeClientId],
    ([, cid]) => fetchCallLogs(cid),
  );

  const filtered = useMemo(
    () => applyFilters(allLogs, dateRange.days, direction, status),
    [allLogs, dateRange, direction, status],
  );

  const m = useMemo(
    () => computeMetrics(filtered, dateRange.days),
    [filtered, dateRange.days],
  );

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Analytics</h1>
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
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "all"
                ? "All directions"
                : d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={s.select}
        >
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st === "all"
                ? "All statuses"
                : st.charAt(0).toUpperCase() + st.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div style={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <>
          <div style={s.grid}>
            <SummaryCard
              label="Total Calls"
              value={m.total}
              sub={dateRange.label}
            />
            <SummaryCard
              label="Total Duration"
              value={fmtDuration(m.totalDur)}
              sub={"Avg " + fmtDuration(m.avgDur) + " / call"}
            />
            <SummaryCard
              label="Total Cost"
              value={fmtCost(m.totalCost)}
              sub={
                "Avg " +
                fmtCost(m.total ? m.totalCost / m.total : 0) +
                " / call"
              }
            />
            <SplitBar inbound={m.inbound} outbound={m.outbound} />
            <StatusBreakdown statusMap={m.statusMap} />
            <DailyChart daily={m.daily} maxDaily={m.maxDaily} />
          </div>

          {allLogs.length === 0 && (
            <p
              style={{
                color: "var(--ink-400)",
                fontSize: "0.84rem",
                marginTop: "1rem",
              }}
            >
              No call logs yet. Data will appear once calls are made.
            </p>
          )}
        </>
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
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
