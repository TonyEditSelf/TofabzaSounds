"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const fetcher = (url) => fetch(url).then((r) => r.json());

function Badge({ label, color }) {
  const colors = {
    completed: { bg: "#dcfce7", text: "#15803d" },
    failed: { bg: "#fee2e2", text: "#b91c1c" },
    in_progress: { bg: "#fef9c3", text: "#854d0e" },
    calling: { bg: "#dbeafe", text: "#1d4ed8" },
    inbound: { bg: "#f3e8ff", text: "#7e22ce" },
    outbound: { bg: "#ffedd5", text: "#c2410c" },
  };
  const c = colors[label] ?? { bg: "var(--surface-2)", text: "var(--ink-700)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: c.bg,
        color: c.text,
      }}
    >
      {label}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 20px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--ink-500)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color: "var(--ink-900)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function TranscriptBubble({ role, content, index }) {
  const isBot = role === "assistant";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isBot ? "row" : "row-reverse",
        gap: 10,
        alignItems: "flex-start",
        animation: `fadeUp 0.2s ease both`,
        animationDelay: `${index * 0.03}s`,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isBot ? "var(--cobalt-600)" : "var(--surface-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          color: isBot ? "#fff" : "var(--ink-700)",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {isBot ? "AI" : "C"}
      </div>
      {/* Bubble */}
      <div
        style={{
          maxWidth: "72%",
          background: isBot ? "var(--cobalt-600)" : "var(--surface-2)",
          color: isBot ? "#fff" : "var(--ink-900)",
          borderRadius: isBot ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
          padding: "10px 14px",
          fontSize: 13,
          lineHeight: 1.55,
          fontFamily: "var(--font-sans)",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function formatDuration(sec) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CallDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/calls/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setLog(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--page)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-500)",
            fontFamily: "var(--font-sans)",
          }}
        >
          Loading call…
        </div>
      </div>
    );

  if (error || !log)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--page)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--crimson-500)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {error ?? "Call not found"}
        </div>
      </div>
    );

  const transcript = Array.isArray(log.transcript) ? log.transcript : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink-900)",
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
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
            height: 60,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-500)",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "var(--font-serif)",
                color: "var(--ink-900)",
              }}
            >
              Call Detail
            </h1>
            <div
              style={{
                fontSize: 11,
                color: "var(--ink-500)",
                fontFamily: "var(--font-mono)",
                marginTop: 1,
              }}
            >
              {log.call_sid ?? id}
            </div>
          </div>
          <Badge label={log.status} />
          <Badge label={log.direction} />
        </div>
      </div>

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
        {/* Stat cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Caller" value={log.caller_number ?? "—"} />
          <StatCard
            label="Duration"
            value={formatDuration(log.duration_seconds)}
          />
          <StatCard
            label="Total Cost"
            value={
              log.total_cost_inr
                ? `₹${Number(log.total_cost_inr).toFixed(4)}`
                : "—"
            }
          />
          <StatCard
            label="Started"
            value={formatTs(log.started_at)}
            sub={log.ended_at ? `Ended ${formatTs(log.ended_at)}` : null}
          />
        </div>

        {/* Agent + Campaign */}
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
            DETAILS
          </div>
          <div
            style={{
              padding: "16px 20px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px 32px",
            }}
          >
            {[
              ["Agent", log.agents?.name ?? log.agent_id ?? "—"],
              ["Client", log.clients?.name ?? log.client_id ?? "—"],
              [
                "Campaign",
                log.campaigns?.name ??
                  (log.campaign_id ? log.campaign_id : "Direct call"),
              ],
              ["Call SID", log.call_sid ?? "—"],
            ].map(([label, val]) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    letterSpacing: "0.04em",
                    marginBottom: 3,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink-900)",
                    fontFamily:
                      label === "Call SID"
                        ? "var(--font-mono)"
                        : "var(--font-sans)",
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript */}
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>TRANSCRIPT</span>
            <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
              {transcript.length} turns
            </span>
          </div>
          <div
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: 520,
              overflowY: "auto",
            }}
          >
            {transcript.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink-400)",
                  textAlign: "center",
                  padding: "24px 0",
                }}
              >
                No transcript recorded for this call.
              </div>
            ) : (
              transcript.map((turn, i) => (
                <TranscriptBubble
                  key={i}
                  role={turn.role}
                  content={turn.content}
                  index={i}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
