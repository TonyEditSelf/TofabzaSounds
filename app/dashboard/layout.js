"use client";

import Sidebar from "@/components/layout/Sidebar";
import { useUIStore } from "@/store/ui";
import { Toaster } from "sonner";

export default function DashboardLayout({ children }) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--page)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Sidebar />

      <main
        style={{
          flex: 1,
          minHeight: "100vh",
          overflowX: "hidden",
        }}
      >
        {/* Mobile top bar */}
        <div className="mobile-topbar" style={s.topbar}>
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            style={s.hamburger}
          >
            <span style={{ ...s.bar, marginBottom: "5px" }} />
            <span style={{ ...s.bar, width: sidebarOpen ? "18px" : "22px" }} />
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
      </main>
      <Toaster position="top-right" richColors />
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
  },
  bar: {
    display: "block",
    width: "22px",
    height: "2px",
    background: "rgba(255,255,255,0.7)",
    borderRadius: "2px",
    transition: "width 0.15s",
  },
  topbarTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1rem",
    color: "#fff",
  },
  content: {
    padding: "2rem",
  },
};
