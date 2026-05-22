"use client";

/**
 * app/dashboard/analytics/page.js
 *
 * Filters: client (Zustand), date range, direction, status
 * Metrics: total calls, total duration, total cost, avg duration
 * Inbound vs outbound split bar
 * Status breakdown
 * Daily call volume chart (last N days)
 * Per-agent breakdown table
 * Campaign performance table
 * Daily cost trend chart
 * Peak hours heatmap (24h distribution)
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
  busy: "#F59E0B",
  "no-answer": "#818CF8",
  unknown: "var(--ink-400)",
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchCallLogs(clientId) {
  let query = supabase
    .from("call_logs")
    .select(
      "id, direction, duration_seconds, total_cost_inr, status, started_at, agent_id, campaign_id",
    )
    .order("started_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchAgents(clientId) {
  let query = supabase.from("agents").select("id, name, type");
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchCampaigns(clientId) {
  let query = supabase.from("campaigns").select("id, name, status");
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchAllAnalytics(clientId) {
  const [logs, agents, campaigns] = await Promise.all([
    fetchCallLogs(clientId),
    fetchAgents(clientId),
    fetchCampaigns(clientId),
  ]);
  return { logs, agents, campaigns };
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
  return "₹" + (n || 0).toFixed(2);
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
  if (direction !== "all")
    filtered = filtered.filter((l) => l.direction === direction);
  if (status !== "all")
    filtered = filtered.filter((l) => (l.status ?? "unknown") === status);
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
  const dailyCostMap = {};
  for (const l of logs) {
    const day = l.started_at ? l.started_at.slice(0, 10) : null;
    if (day) {
      dailyMap[day] = (dailyMap[day] ?? 0) + 1;
      dailyCostMap[day] =
        (dailyCostMap[day] ?? 0) + (parseFloat(l.total_cost_inr) || 0);
    }
  }

  const daily = daysList.map((d) => ({
    date: d,
    count: dailyMap[d] ?? 0,
    cost: dailyCostMap[d] ?? 0,
  }));
  const maxDaily = Math.max(...daily.map((d) => d.count), 1);
  const maxDailyCost = Math.max(...daily.map((d) => d.cost), 0.01);

  // Peak hours: 0-23
  const hourMap = Array(24).fill(0);
  for (const l of logs) {
    if (l.started_at) {
      const h = new Date(l.started_at).getHours();
      hourMap[h]++;
    }
  }
  const maxHour = Math.max(...hourMap, 1);

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
    maxDailyCost,
    hourMap,
    maxHour,
  };
}

function computeAgentStats(logs, agents) {
  const map = {};
  for (const l of logs) {
    const id = l.agent_id ?? "__unknown__";
    if (!map[id]) map[id] = { calls: 0, dur: 0, cost: 0, completed: 0 };
    map[id].calls++;
    map[id].dur += l.duration_seconds ?? 0;
    map[id].cost += parseFloat(l.total_cost_inr) || 0;
    if (l.status === "completed") map[id].completed++;
  }
  const agentIndex = Object.fromEntries(agents.map((a) => [a.id, a]));
  return Object.entries(map)
    .map(([id, v]) => ({
      id,
      name: agentIndex[id]?.name ?? "Unknown Agent",
      type: agentIndex[id]?.type ?? "—",
      ...v,
      successRate: v.calls ? Math.round((v.completed / v.calls) * 100) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);
}

function computeCampaignStats(logs, campaigns) {
  const map = {};
  for (const l of logs) {
    const id = l.campaign_id;
    if (!id) continue;
    if (!map[id]) map[id] = { total: 0, answered: 0, cost: 0, dur: 0 };
    map[id].total++;
    map[id].cost += parseFloat(l.total_cost_inr) || 0;
    map[id].dur += l.duration_seconds ?? 0;
    if (l.status === "completed") map[id].answered++;
  }
  const campaignIndex = Object.fromEntries(campaigns.map((c) => [c.id, c]));
  return Object.entries(map)
    .map(([id, v]) => ({
      id,
      name: campaignIndex[id]?.name ?? "Unknown Campaign",
      status: campaignIndex[id]?.status ?? "—",
      ...v,
      answerRate: v.total ? Math.round((v.answered / v.total) * 100) : 0,
      avgDur: v.total ? Math.round(v.dur / v.total) : 0,
      costPerCall: v.total ? v.cost / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
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

function DailyVolumeChart({ daily, maxDaily }) {
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
                background: d.count > 0 ? "#2563EB" : "var(--border)",
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

function DailyCostChart({ daily, maxDailyCost }) {
  const n = daily.length;
  const labelEvery = n <= 7 ? 1 : n <= 30 ? 5 : 10;
  return (
    <div style={{ ...s.card, gridColumn: "1 / -1" }}>
      <p style={s.cardLabel}>Daily Cost Trend (₹)</p>
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
          const pct = maxDailyCost > 0 ? (d.cost / maxDailyCost) * 100 : 0;
          return (
            <div
              key={d.date}
              title={d.date + ": ₹" + d.cost.toFixed(2)}
              style={{
                flex: 1,
                height: Math.max(pct, d.cost > 0 ? 4 : 1) + "%",
                background: d.cost > 0 ? "#16A34A" : "var(--border)",
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

function PeakHoursHeatmap({ hourMap, maxHour }) {
  return (
    <div style={{ ...s.card, gridColumn: "1 / -1" }}>
      <p style={s.cardLabel}>Peak Hours (24h Distribution)</p>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "3px",
          height: "64px",
          marginTop: "16px",
        }}
      >
        {hourMap.map((count, h) => {
          const pct = (count / maxHour) * 100;
          const alpha = count > 0 ? 0.2 + (count / maxHour) * 0.8 : 0.07;
          return (
            <div
              key={h}
              title={`${h}:00 — ${count} calls`}
              style={{
                flex: 1,
                height: Math.max(pct, count > 0 ? 6 : 2) + "%",
                borderRadius: "2px 2px 0 0",
                minHeight: "2px",
                cursor: "default",
                transition: "height 0.3s, background 0.3s",
                background: `rgba(245, 158, 11, ${alpha})`,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", marginTop: "6px" }}>
        {hourMap.map((_, h) => (
          <div key={h} style={{ flex: 1, textAlign: "center" }}>
            {h % 6 === 0 && (
              <span
                style={{
                  fontSize: "9px",
                  color: "var(--ink-400)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {h}h
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentBreakdown({ agentStats }) {
  if (!agentStats.length) return null;
  return (
    <div style={{ ...s.card, gridColumn: "1 / -1" }}>
      <p style={s.cardLabel}>Per-Agent Breakdown</p>
      <div style={{ overflowX: "auto", marginTop: "14px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.82rem",
            fontFamily: "var(--font-sans)",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[
                "Agent",
                "Type",
                "Calls",
                "Avg Duration",
                "Total Cost",
                "Success Rate",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "6px 12px 8px",
                    textAlign: "left",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    color: "var(--ink-400)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agentStats.map((a, i) => (
              <tr
                key={a.id}
                style={{
                  borderBottom:
                    i < agentStats.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
                }}
              >
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-900)",
                    fontWeight: 500,
                  }}
                >
                  {a.name}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-500)",
                    textTransform: "capitalize",
                  }}
                >
                  {a.type}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {a.calls}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {fmtDuration(Math.round(a.dur / (a.calls || 1)))}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {fmtCost(a.cost)}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: "4px",
                        background: "var(--border)",
                        borderRadius: "2px",
                        overflow: "hidden",
                        minWidth: "60px",
                      }}
                    >
                      <div
                        style={{
                          width: a.successRate + "%",
                          height: "100%",
                          background:
                            a.successRate >= 70
                              ? "#22C55E"
                              : a.successRate >= 40
                                ? "#F59E0B"
                                : "#E11D48",
                          borderRadius: "2px",
                          transition: "width 0.4s",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--ink-500)",
                        fontFamily: "var(--font-mono)",
                        minWidth: "32px",
                      }}
                    >
                      {a.successRate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignPerformance({ campaignStats }) {
  if (!campaignStats.length) return null;

  const CAMPAIGN_STATUS_COLORS = {
    active: "#22C55E",
    completed: "#2563EB",
    paused: "#F59E0B",
    draft: "var(--ink-400)",
  };

  return (
    <div style={{ ...s.card, gridColumn: "1 / -1" }}>
      <p style={s.cardLabel}>Campaign Performance</p>
      <div style={{ overflowX: "auto", marginTop: "14px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.82rem",
            fontFamily: "var(--font-sans)",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[
                "Campaign",
                "Status",
                "Total Calls",
                "Answered",
                "Answer Rate",
                "Avg Duration",
                "Total Cost",
                "Cost / Call",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "6px 12px 8px",
                    textAlign: "left",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    color: "var(--ink-400)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaignStats.map((c, i) => (
              <tr
                key={c.id}
                style={{
                  borderBottom:
                    i < campaignStats.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
                }}
              >
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-900)",
                    fontWeight: 500,
                  }}
                >
                  {c.name}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color:
                        CAMPAIGN_STATUS_COLORS[c.status] ?? "var(--ink-400)",
                      textTransform: "capitalize",
                    }}
                  >
                    {c.status}
                  </span>
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {c.total}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {c.answered}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: "4px",
                        background: "var(--border)",
                        borderRadius: "2px",
                        overflow: "hidden",
                        minWidth: "60px",
                      }}
                    >
                      <div
                        style={{
                          width: c.answerRate + "%",
                          height: "100%",
                          background:
                            c.answerRate >= 60
                              ? "#22C55E"
                              : c.answerRate >= 30
                                ? "#F59E0B"
                                : "#E11D48",
                          borderRadius: "2px",
                          transition: "width 0.4s",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--ink-500)",
                        fontFamily: "var(--font-mono)",
                        minWidth: "32px",
                      }}
                    >
                      {c.answerRate}%
                    </span>
                  </div>
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {fmtDuration(c.avgDur)}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {fmtCost(c.cost)}
                </td>
                <td
                  style={{
                    padding: "9px 12px",
                    color: "var(--ink-700)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                  }}
                >
                  {fmtCost(c.costPerCall)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const { data: raw, isLoading } = useSWR(
    ["analytics_all", activeClientId],
    ([, cid]) => fetchAllAnalytics(cid),
  );

  const allLogs = raw?.logs ?? [];
  const agents = raw?.agents ?? [];
  const campaigns = raw?.campaigns ?? [];

  const filtered = useMemo(
    () => applyFilters(allLogs, dateRange.days, direction, status),
    [allLogs, dateRange, direction, status],
  );

  const m = useMemo(
    () => computeMetrics(filtered, dateRange.days),
    [filtered, dateRange.days],
  );
  const agentStats = useMemo(
    () => computeAgentStats(filtered, agents),
    [filtered, agents],
  );
  const campaignStats = useMemo(
    () => computeCampaignStats(filtered, campaigns),
    [filtered, campaigns],
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

      {isLoading ? (
        <div style={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Summary cards */}
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
          </div>

          {/* Charts */}
          <div style={{ ...s.grid, marginTop: "1rem" }}>
            <DailyVolumeChart daily={m.daily} maxDaily={m.maxDaily} />
            <DailyCostChart daily={m.daily} maxDailyCost={m.maxDailyCost} />
            <PeakHoursHeatmap hourMap={m.hourMap} maxHour={m.maxHour} />
          </div>

          {/* Tables */}
          <div style={{ ...s.grid, marginTop: "1rem" }}>
            <AgentBreakdown agentStats={agentStats} />
            <CampaignPerformance campaignStats={campaignStats} />
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
