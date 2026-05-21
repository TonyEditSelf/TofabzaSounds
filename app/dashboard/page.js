"use client";

/**
 * app/dashboard/page.js — Overview dashboard
 *
 * Shows:
 *   - 4 stat cards: active agents, active widgets, calls today, cost this month
 *   - Recent calls table (last 10)
 *
 * All data is filtered by activeClientId from Zustand (null = all clients).
 * Uses SWR for data fetching + skeleton loading states.
 */

import useSWR from "swr";
import { useUIStore } from "@/store/ui";
import { createClient } from "@/lib/supabase/client";

// ─── Fetchers ─────────────────────────────────────────────────────────────────

const supabase = createClient();

/**
 * @param {string} key - SWR cache key (encodes clientId)
 * @returns {Promise<Object>}
 */
async function fetchStats(key) {
  const clientId = key.split(":")[1] || null;

  let agentsQ = supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  let widgetsQ = supabase
    .from("widgets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  let callsQ = supabase
    .from("call_logs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  let costsQ = supabase
    .from("call_logs")
    .select("total_cost_inr")
    .gte(
      "started_at",
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString(),
    );

  if (clientId) {
    agentsQ = agentsQ.eq("client_id", clientId);
    widgetsQ = widgetsQ.eq("client_id", clientId);
    callsQ = callsQ.eq("client_id", clientId);
    costsQ = costsQ.eq("client_id", clientId);
  }

  const [agents, widgets, calls, costs] = await Promise.all([
    agentsQ,
    widgetsQ,
    callsQ,
    costsQ,
  ]);

  const monthCost = (costs.data ?? []).reduce(
    (sum, r) => sum + (r.total_cost_inr ?? 0),
    0,
  );

  return {
    agents: agents.count ?? 0,
    widgets: widgets.count ?? 0,
    callsToday: calls.count ?? 0,
    monthCost,
  };
}

/**
 * @param {string} key - SWR cache key (encodes clientId)
 * @returns {Promise<Array>}
 */
async function fetchRecentCalls(key) {
  const clientId = key.split(":")[1] || null;

  let q = supabase
    .from("call_logs")
    .select(
      "id, caller_number, direction, duration_seconds, total_cost_inr, status, started_at, clients(name)",
    )
    .order("started_at", { ascending: false })
    .limit(10);

  if (clientId) q = q.eq("client_id", clientId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, loading }) {
  if (loading) {
    return (
      <div style={s.card}>
        <div
          style={{
            ...s.skeleton,
            width: "60%",
            height: "12px",
            marginBottom: "12px",
          }}
        />
        <div
          style={{
            ...s.skeleton,
            width: "40%",
            height: "32px",
            marginBottom: "8px",
          }}
        />
        <div style={{ ...s.skeleton, width: "80%", height: "10px" }} />
      </div>
    );
  }

  return (
    <div style={s.card}>
      <p style={s.cardLabel}>{label}</p>
      <p style={s.cardValue}>{value}</p>
      {sub && <p style={s.cardSub}>{sub}</p>}
    </div>
  );
}

function CallRow({ call }) {
  const dir = call.direction === "inbound" ? "↙" : "↗";
  const color =
    call.direction === "inbound" ? "var(--cobalt-600)" : "var(--saffron-500)";
  const date = new Date(call.started_at);

  return (
    <tr style={s.tr}>
      <td style={{ ...s.td, color }}>
        {dir} {call.direction}
      </td>
      <td style={s.td}>{call.caller_number ?? "—"}</td>
      <td style={s.td}>{call.clients?.name ?? "—"}</td>
      <td style={s.td}>
        {call.duration_seconds
          ? `${Math.ceil(call.duration_seconds / 60)} min`
          : "—"}
      </td>
      <td style={s.td}>₹{(call.total_cost_inr ?? 0).toFixed(2)}</td>
      <td style={{ ...s.td, ...s.statusBadge(call.status) }}>{call.status}</td>
      <td style={{ ...s.td, color: "var(--ink-400)", fontSize: "0.78rem" }}>
        {date.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        {date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
      </td>
    </tr>
  );
}

function CallsTableSkeleton() {
  return Array.from({ length: 5 }).map((_, i) => (
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

export default function DashboardPage() {
  const activeClientId = useUIStore((s) => s.activeClientId);
  const activeClientName = useUIStore((s) => s.activeClientName);

  const swrKey = activeClientId ? `stats:${activeClientId}` : "stats:";

  const { data: stats, isLoading: statsLoading } = useSWR(swrKey, fetchStats, {
    refreshInterval: 30_000,
  });

  const { data: calls = [], isLoading: callsLoading } = useSWR(
    activeClientId ? `calls:${activeClientId}` : "calls:",
    fetchRecentCalls,
    { refreshInterval: 30_000 },
  );

  const STATS = [
    {
      label: "Active Agents",
      value: stats?.agents ?? "—",
      sub: "inbound + outbound",
    },
    {
      label: "Active Widgets",
      value: stats?.widgets ?? "—",
      sub: "deployed on client sites",
    },
    {
      label: "Calls Today",
      value: stats?.callsToday ?? "—",
      sub: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
      }),
    },
    {
      label: "Month Cost",
      value: stats ? `₹${stats.monthCost.toFixed(2)}` : "—",
      sub: new Date().toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      }),
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Overview</h1>
        {activeClientId && (
          <span style={s.filterBadge}>{activeClientName}</span>
        )}
      </div>

      {/* Stat cards */}
      <div style={s.grid}>
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={statsLoading} />
        ))}
      </div>

      {/* Recent calls */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Recent Calls</h2>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {[
                  "Direction",
                  "Number",
                  "Client",
                  "Duration",
                  "Cost",
                  "Status",
                  "Time",
                ].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {callsLoading ? (
                <CallsTableSkeleton />
              ) : calls.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      ...s.td,
                      textAlign: "center",
                      color: "var(--ink-400)",
                      padding: "2rem",
                    }}
                  >
                    No calls yet.
                  </td>
                </tr>
              ) : (
                calls.map((call) => <CallRow key={call.id} call={call} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "1.75rem",
  },
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: 0,
  },
  filterBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    background: "rgba(37,99,235,0.08)",
    color: "var(--cobalt-600)",
    border: "1px solid rgba(37,99,235,0.2)",
    borderRadius: "5px",
    padding: "3px 8px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem",
    marginBottom: "2rem",
  },
  card: {
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.25rem",
  },
  cardLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-400)",
    marginBottom: "0.5rem",
    margin: "0 0 0.5rem",
  },
  cardValue: {
    fontFamily: "var(--font-serif)",
    fontSize: "2rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: "0 0 4px",
    lineHeight: 1,
  },
  cardSub: {
    fontSize: "0.78rem",
    color: "var(--ink-400)",
    margin: 0,
  },
  section: {
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    overflow: "hidden",
  },
  sectionTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "var(--ink-700)",
    margin: 0,
    padding: "1rem 1.25rem",
    borderBottom: "1px solid var(--border)",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.8375rem",
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
    whiteSpace: "nowrap",
    fontWeight: 500,
  },
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "0.75rem 1rem",
    color: "var(--ink-700)",
    whiteSpace: "nowrap",
  },
  statusBadge: (status) => ({
    fontSize: "0.75rem",
    fontWeight: 500,
    color:
      status === "completed"
        ? "var(--emerald-600)"
        : status === "failed"
          ? "var(--crimson-500)"
          : "var(--ink-500)",
  }),
  skeleton: {
    background: "var(--border)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
