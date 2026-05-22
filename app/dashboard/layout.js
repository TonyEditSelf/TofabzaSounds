"use client";

import Sidebar from "@/components/layout/Sidebar";
import { useUIStore } from "@/store/ui";
import { Toaster } from "sonner";

export default function DashboardLayout({ children }) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const themeMode = useUIStore((s) => s.themeMode);

  const themeVars = themeMode === "dark" ? DARK_THEME : LIGHT_THEME;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ink-900)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Sidebar />

      <main
        style={{
          ...themeVars,
          flex: 1,
          minHeight: "100vh",
          overflowX: "hidden",
          background: "var(--page)",
        }}
      >
        <div style={{ minHeight: "100vh", background: "var(--page)" }}>
          {/* Mobile top bar */}
          <div className="mobile-topbar" style={s.topbar}>
            <button
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              style={s.hamburger}
            >
              <span style={{ ...s.bar, marginBottom: "5px" }} />
              <span
                style={{ ...s.bar, width: sidebarOpen ? "18px" : "22px" }}
              />
              <span
                style={{
                  ...s.bar,
                  marginTop: "5px",
                  width: sidebarOpen ? "14px" : "22px",
                }}
              />
            </button>

            <span style={s.topbarTitle}>Tofabza Sounds</span>
          </div>

          <div style={s.content}>{children}</div>
        </div>
      </main>
      <Toaster position="top-right" richColors theme={themeMode} />
      <style>{`
        .mobile-topbar { display: none; }

        @media (max-width: 767px) {
          .mobile-topbar { display: flex; }
          main > div { padding: 1.25rem; }
        }

        @media (min-width: 768px) {
          main { margin-left: 240px; }
        }
      `}</style>
    </div>
  );
}

const s = {
  topbar: {
    alignItems: "center",
    gap: "12px",
    padding: "0.875rem 1.25rem",
    borderBottom: "1px solid var(--border)",
    background: "var(--page)",
    position: "sticky",
    top: 0,
    zIndex: 40,
  },
  hamburger: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    minWidth: "44px",
    minHeight: "44px",
    alignItems: "flex-start",
    color: "var(--ink-900)",
  },
  bar: {
    display: "block",
    width: "22px",
    height: "2px",
    background: "currentColor",
    borderRadius: "2px",
    transition: "width 0.15s",
  },
  topbarTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1rem",
    color: "var(--ink-900)",
  },
  content: {
    padding: "2rem",
  },
};

const LIGHT_THEME = {
  "--page": "#f4f5fa",
  "--surface": "#ffffff",
  "--surface-2": "#f4f4f4",
  "--surface-3": "#ededed",
  "--border": "#e2e4ef",
  "--ink-900": "#0a0b0f",
  "--ink-800": "#1a1c26",
  "--ink-700": "#2e3147",
  "--ink-600": "#4a4e6b",
  "--ink-500": "#666b86",
  "--ink-400": "#7c82a3",
  "--ink-200": "#bcc0d6",
  "--ink-100": "#e2e4ef",
  "--ink-50": "#f4f5fa",
  "--shadow-soft": "0 10px 30px rgba(10, 11, 15, 0.04)",
  "--shadow-strong": "0 16px 40px rgba(10, 11, 15, 0.08)",
};

const DARK_THEME = {
  "--page": "#0f1013",
  "--surface": "#15161A",
  "--surface-2": "#15161A",
  "--surface-3": "#15161A",
  "--border": "#2a2a2a",
  "--ink-900": "#f5f7fb",
  "--ink-800": "#e3e8f5",
  "--ink-700": "#c5cde0",
  "--ink-600": "#a8b4ce",
  "--ink-500": "#8b97b3",
  "--ink-400": "#74809a",
  "--ink-200": "#4a556e",
  "--ink-100": "#313b52",
  "--ink-50": "#20283a",
  "--shadow-soft": "0 12px 34px rgba(0, 0, 0, 0.34)",
  "--shadow-strong": "0 18px 46px rgba(0, 0, 0, 0.45)",
};
