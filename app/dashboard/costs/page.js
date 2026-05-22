"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fetcher = (url) => fetch(url).then((r) => r.json());

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n) {
  return `₹${Number(n ?? 0).toFixed(2)}`;
}
function fmtM(n) {
  return `${Number(n ?? 0).toFixed(1)} min`;
}
function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

// ── range options ──────────────────────────────────────────────────────────────
const RANGES = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "Custom", value: "custom" },
];

// ── icon ───────────────────────────────────────────────────────────────────────
function Icon({ d, size = 15 }) {
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
  rupee: "M6 3h12M6 8h12M6 13l8.5 8M6 13h3a6 6 0 000-12H6",
  phone:
    "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.19 2.21 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6",
  clock: "M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2",
  markup:
    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
};

// ── stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: (accent ?? "var(--cobalt-600)") + "18",
            color: accent ?? "var(--cobalt-600)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon d={icon} size={13} />
        </div>
        <span
          style={{
            fontSize: 11,
            color: "var(--ink-500)",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--ink-900)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }) {
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
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ink-500)",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ── breakdown table ────────────────────────────────────────────────────────────
function BreakdownTable({ rows, emptyMsg }) {
  if (!rows?.length)
    return (
      <div
        style={{
          textAlign: "center",
          padding: "24px 0",
          fontSize: 13,
          color: "var(--ink-400)",
        }}
      >
        {emptyMsg}
      </div>
    );

  const max = rows[0]?.billable ?? 1;

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr>
            {["Name", "Calls", "Minutes", "Raw Cost", "Billable"].map(
              (h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 0 ? "left" : "right",
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-400)",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id ?? i}
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <td
                style={{
                  padding: "10px 10px",
                  color: "var(--ink-900)",
                  fontWeight: 500,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div>{r.name}</div>
                    {/* cost bar */}
                    <div
                      style={{
                        marginTop: 4,
                        height: 3,
                        borderRadius: 2,
                        background: "var(--border)",
                        width: 120,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          background: "var(--cobalt-600)",
                          width: `${Math.round((r.billable / max) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </td>
              <td
                style={{
                  padding: "10px 10px",
                  textAlign: "right",
                  color: "var(--ink-700)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                {r.calls}
              </td>
              <td
                style={{
                  padding: "10px 10px",
                  textAlign: "right",
                  color: "var(--ink-700)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                {fmtM(r.minutes)}
              </td>
              <td
                style={{
                  padding: "10px 10px",
                  textAlign: "right",
                  color: "var(--ink-500)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                {fmt(r.raw)}
              </td>
              <td
                style={{
                  padding: "10px 10px",
                  textAlign: "right",
                  color: "var(--emerald-600)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {fmt(r.billable)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── custom tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        color: "var(--ink-900)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{shortDate(label)}</div>
      <div style={{ color: "var(--emerald-600)" }}>
        Billable: {fmt(payload[0]?.value)}
      </div>
      <div style={{ color: "var(--ink-500)" }}>
        Raw: {fmt(payload[1]?.value)}
      </div>
      <div style={{ color: "var(--ink-400)" }}>Calls: {payload[2]?.value}</div>
    </div>
  );
}

// ── tab bar ────────────────────────────────────────────────────────────────────
function Tabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {["By Client", "By Agent", "By Campaign"].map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            background: active === t ? "var(--cobalt-600)" : "none",
            color: active === t ? "#fff" : "var(--ink-500)",
            border: active === t ? "none" : "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
export default function CostsPage() {
  const [range, setRange] = useState("30");
  const [customFrom, setFrom] = useState("");
  const [customTo, setTo] = useState("");
  const [activeTab, setTab] = useState("By Client");

  // build URL
  const url =
    range === "custom" && customFrom && customTo
      ? `/api/costs?range=custom&from=${customFrom}&to=${customTo}`
      : `/api/costs?range=${range}`;

  const { data, isLoading } = useSWR(url, fetcher, { refreshInterval: 60000 });

  const s = data?.summary ?? {};

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink-900)",
      }}
    >
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
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 60,
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "var(--font-serif)",
                color: "var(--ink-900)",
              }}
            >
              Costs
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
              Exotel + Sarvam STT/TTS — incl. {s.markup ?? 2.5}× markup
            </p>
          </div>

          {/* range selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                style={{
                  background: range === r.value ? "var(--cobalt-600)" : "none",
                  color: range === r.value ? "#fff" : "var(--ink-500)",
                  border:
                    range === r.value ? "none" : "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {r.label}
              </button>
            ))}
            {range === "custom" && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setFrom(e.target.value)}
                  style={dateInput}
                />
                <span style={{ fontSize: 12, color: "var(--ink-400)" }}>→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setTo(e.target.value)}
                  style={dateInput}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── body ── */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ── stat cards ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <StatCard
            icon={ICONS.rupee}
            label="TOTAL BILLABLE"
            value={isLoading ? "…" : fmt(s.totalBillable)}
            sub="incl. markup"
            accent="var(--emerald-600)"
          />
          <StatCard
            icon={ICONS.rupee}
            label="RAW COST"
            value={isLoading ? "…" : fmt(s.totalRaw)}
            sub="before markup"
          />
          <StatCard
            icon={ICONS.phone}
            label="TOTAL CALLS"
            value={isLoading ? "…" : (s.totalCalls ?? 0)}
            sub="completed"
          />
          <StatCard
            icon={ICONS.clock}
            label="TOTAL MINUTES"
            value={isLoading ? "…" : fmtM(s.totalMinutes)}
            sub="call duration"
            accent="var(--saffron-500)"
          />
        </div>

        {/* ── chart ── */}
        <Section title="DAILY COST TREND">
          {isLoading ? (
            <div
              style={{
                height: 200,
                background: "var(--surface-2)",
                borderRadius: 8,
                animation: "skeleton 1.4s ease infinite",
              }}
            />
          ) : (data?.dailySeries?.length ?? 0) === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                fontSize: 13,
                color: "var(--ink-400)",
              }}
            >
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={data.dailySeries}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="billable" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="raw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11, fill: "var(--ink-400)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--ink-400)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${v}`}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="billable"
                  stroke="#16A34A"
                  strokeWidth={2}
                  fill="url(#billable)"
                />
                <Area
                  type="monotone"
                  dataKey="raw"
                  stroke="#2563EB"
                  strokeWidth={1.5}
                  fill="url(#raw)"
                  strokeDasharray="4 2"
                />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="transparent"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── breakdown tables ── */}
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
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-500)",
                letterSpacing: "0.04em",
              }}
            >
              BREAKDOWN
            </span>
            <Tabs active={activeTab} onChange={setTab} />
          </div>
          <div style={{ padding: 20 }}>
            {isLoading ? (
              <div
                style={{
                  height: 120,
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  animation: "skeleton 1.4s ease infinite",
                }}
              />
            ) : activeTab === "By Client" ? (
              <BreakdownTable
                rows={data?.byClient}
                emptyMsg="No client data for this period"
              />
            ) : activeTab === "By Agent" ? (
              <BreakdownTable
                rows={data?.byAgent}
                emptyMsg="No agent data for this period"
              />
            ) : (
              <BreakdownTable
                rows={data?.byCampaign}
                emptyMsg="No campaign data for this period"
              />
            )}
          </div>
        </div>

        {/* ── cost methodology note ── */}
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-400)",
            lineHeight: 1.7,
            padding: "0 4px",
          }}
        >
          Cost methodology: Exotel ₹{1}/min · Sarvam STT ~$0.004/min · Sarvam
          TTS ~$0.000004/char (est. 450 chars/min) · converted at ₹84/USD.
          Override rates in Settings → AI &amp; call defaults.
        </div>
      </div>

      <style>{`
        @keyframes skeleton {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5); cursor: pointer;
        }
      `}</style>
    </div>
  );
}

const dateInput = {
  height: 30,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink-900)",
  outline: "none",
  fontFamily: "var(--font-sans)",
};
