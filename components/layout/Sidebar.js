"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/store/ui";

// ─── Nav definition ──────────────────────────────────────────────────────────

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⊞" },
  { href: "/dashboard/clients", label: "Clients", icon: "◎" },
  null,
  { href: "/dashboard/voice-explorer", label: "Voice Explorer", icon: "◉" },
  { href: "/dashboard/agents", label: "Agents", icon: "⬡" },
  { href: "/dashboard/widgets", label: "Widgets", icon: "⬢" },
  null,
  { href: "/dashboard/campaigns", label: "Campaigns", icon: "▷" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "◈" },
  { href: "/dashboard/costs", label: "Costs", icon: "₹" },
  null,
  { href: "/dashboard/api-keys", label: "API Keys", icon: "⚿" },
  { href: "/dashboard/settings", label: "Settings", icon: "◌" },
];

// ─── SWR fetcher — client list ────────────────────────────────────────────────

async function fetchClients() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // Zustand
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const closeSidebar = useUIStore((s) => s.closeSidebar);
  const themeMode = useUIStore((s) => s.themeMode);
  const toggleThemeMode = useUIStore((s) => s.toggleThemeMode);
  const activeClientId = useUIStore((s) => s.activeClientId);
  const activeClientName = useUIStore((s) => s.activeClientName);
  const setClientFilter = useUIStore((s) => s.setClientFilter);

  // Clients list
  const { data: clients = [] } = useSWR("sidebar-clients", fetchClients, {
    revalidateOnFocus: false,
  });

  // Close sidebar on route change (mobile)
  useEffect(() => {
    closeSidebar();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function handleClientChange(e) {
    const id = e.target.value;
    if (!id) {
      setClientFilter(null, "All Clients");
    } else {
      const client = clients.find((c) => c.id === id);
      setClientFilter(id, client?.name ?? "Client");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 49,
            display: "block",
          }}
        />
      )}

      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "240px",
          background: "var(--ink-900)",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          borderRight: "1px solid rgba(255,255,255,0.05)",
          // Mobile: slide in/out
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.22s ease",
        }}
        // Desktop: always visible
        className="sidebar-desktop"
      >
        {/* Logo */}
        <div style={s.logoWrap}>
          <div style={s.logoRow}>
            <div>
              <div style={s.logoTitle}>Tofabza Sounds</div>
              <div style={s.logoSub}>Agency Console</div>
            </div>

            <button
              type="button"
              onClick={toggleThemeMode}
              aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
              aria-pressed={themeMode === "dark"}
              style={s.themeToggle}
            >
              <span style={s.themeToggleTrack}>
                <span
                  style={{
                    ...s.themeToggleThumb,
                    transform:
                      themeMode === "dark" ? "translateX(16px)" : "translateX(0)",
                  }}
                />
              </span>
              <span style={s.themeToggleLabel}>
                {themeMode === "dark" ? "Dark" : "Light"}
              </span>
            </button>
          </div>
        </div>

        {/* Client filter */}
        <div style={s.filterWrap}>
          <select
            value={activeClientId ?? ""}
            onChange={handleClientChange}
            style={s.select}
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Nav */}
        <nav style={s.nav}>
          {NAV.map((item, i) => {
            if (!item) return <div key={i} style={s.divider} />;

            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    ...s.navItem,
                    color: isActive
                      ? "var(--saffron-400)"
                      : "rgba(255,255,255,0.5)",
                    background: isActive
                      ? "rgba(249,115,22,0.12)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                    }
                  }}
                >
                  <span style={s.icon}>{item.icon}</span>
                  {item.label}
                  {isActive && <div style={s.dot} />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div style={s.signOutWrap}>
          <button
            onClick={handleSignOut}
            style={s.signOutBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(225,29,72,0.3)";
              e.currentTarget.style.color = "var(--crimson-500)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "rgba(255,255,255,0.35)";
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Desktop override — always visible above md breakpoint */}
      <style>{`
        @media (min-width: 768px) {
          .sidebar-desktop {
            transform: translateX(0) !important;
          }
        }
      `}</style>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  logoWrap: {
    padding: "1.5rem 1.25rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  logoRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  logoTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.1rem",
    fontWeight: 400,
    color: "#fff",
    marginBottom: "2px",
  },
  logoSub: {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--saffron-400)",
  },
  themeToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.8)",
    padding: "6px 10px 6px 8px",
    cursor: "pointer",
    minHeight: "34px",
    fontFamily: "var(--font-sans)",
    fontSize: "0.72rem",
    transition: "all 0.15s ease",
  },
  themeToggleTrack: {
    position: "relative",
    width: "34px",
    height: "18px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "inline-block",
    flexShrink: 0,
  },
  themeToggleThumb: {
    position: "absolute",
    top: "1px",
    left: "1px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
    transition: "transform 0.18s ease",
  },
  themeToggleLabel: {
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  filterWrap: {
    padding: "0.75rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  select: {
    width: "100%",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "7px",
    color: "#fff",
    fontFamily: "var(--font-sans)",
    fontSize: "0.8rem",
    fontWeight: 300,
    padding: "7px 10px",
    cursor: "pointer",
    outline: "none",
  },
  nav: {
    flex: 1,
    padding: "0.5rem 0.625rem",
    overflowY: "auto",
  },
  divider: {
    height: "1px",
    background: "rgba(255,255,255,0.07)",
    margin: "0.4rem 0.375rem",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "8px 0.75rem",
    borderRadius: "8px",
    fontSize: "0.8125rem",
    fontWeight: 400,
    transition: "background 0.1s, color 0.1s",
    cursor: "pointer",
    marginBottom: "1px",
  },
  icon: {
    fontSize: "14px",
    opacity: 0.9,
    minWidth: "16px",
  },
  dot: {
    width: "5px",
    height: "5px",
    background: "var(--saffron-500)",
    borderRadius: "50%",
    marginLeft: "auto",
  },
  signOutWrap: {
    padding: "0.75rem 1rem",
    borderTop: "1px solid rgba(255,255,255,0.07)",
  },
  signOutBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "7px",
    color: "rgba(255,255,255,0.35)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.8rem",
    fontWeight: 400,
    padding: "8px",
    cursor: "pointer",
    transition: "all 0.15s",
  },
};
