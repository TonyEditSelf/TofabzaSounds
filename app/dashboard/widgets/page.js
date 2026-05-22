"use client";

/**
 * app/dashboard/widgets/page.js
 *
 * Lists all widgets. Filtered by activeClientId from Zustand.
 * Click row → /dashboard/widgets/[id]
 * + New Widget → /dashboard/widgets/new
 */

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useUIStore } from "@/store/ui";

const supabase = createClient();

async function fetchWidgets(clientId) {
  let q = supabase
    .from("widgets")
    .select(
      "id, name, status, version, config, allowed_domains, created_at, clients(name)",
    )
    .order("created_at", { ascending: false });

  if (clientId) q = q.eq("client_id", clientId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

function SkeletonRows() {
  return Array.from({ length: 3 }).map((_, i) => (
    <tr key={i} style={s.tr}>
      {Array.from({ length: 6 }).map((_, j) => (
        <td key={j} style={s.td}>
          <div style={{ ...s.skeleton, width: "70%", height: "12px" }} />
        </td>
      ))}
    </tr>
  ));
}

export default function WidgetsPage() {
  const router = useRouter();
  const activeClientId = useUIStore((s) => s.activeClientId);

  const { data: widgets = [], isLoading } = useSWR(
    ["widgets", activeClientId],
    ([_, id]) => fetchWidgets(id),
    { refreshInterval: 30_000 },
  );

  return (
    <div>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Widgets</h1>
        <button
          onClick={() => router.push("/dashboard/widgets/new")}
          style={s.btnPrimary}
        >
          + New Widget
        </button>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {[
                "Name",
                "ID",
                "Client",
                "Style",
                "Domains",
                "Status",
                "Version",
                "Created",
              ].map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : widgets.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...s.td,
                    textAlign: "center",
                    color: "var(--ink-400)",
                    padding: "2.5rem",
                  }}
                >
                  No widgets yet. Create your first widget.
                </td>
              </tr>
            ) : (
              widgets.map((w) => (
                <tr
                  key={w.id}
                  style={{ ...s.tr, cursor: "pointer" }}
                  onClick={() => router.push(`/dashboard/widgets/${w.id}`)}
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
                      fontWeight: 500,
                      color: "var(--ink-900)",
                    }}
                  >
                    {w.name}
                  </td>
                  <td
                    style={{
                      ...s.td,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.72rem",
                      color: "var(--ink-400)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(w.id);
                      toast.success("ID copied.");
                    }}
                    title="Click to copy"
                  >
                    {w.id.slice(0, 8)}…
                  </td>
                  <td style={s.td}>{w.clients?.name ?? "—"}</td>
                  <td style={s.td}>{w.config?.style ?? "bubble"}</td>
                  <td style={s.td}>
                    {w.allowed_domains?.length ?? 0} domain
                    {w.allowed_domains?.length !== 1 ? "s" : ""}
                  </td>
                  <td style={s.td}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        color: w.status === "active" ? "#16A34A" : "#9CA3AF",
                      }}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td style={s.td}>v{w.version}</td>
                  <td
                    style={{
                      ...s.td,
                      color: "var(--ink-400)",
                      fontSize: "0.78rem",
                    }}
                  >
                    {new Date(w.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

const s = {
  pageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: 0,
  },
  btnPrimary: {
    background: "var(--saffron-500, #F97316)",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    padding: "8px 18px",
    fontSize: "0.84rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "44px",
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
  td: { padding: "0.875rem 1rem", color: "var(--ink-700)" },
  skeleton: {
    background: "var(--border, #E2E4EF)",
    borderRadius: "4px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
