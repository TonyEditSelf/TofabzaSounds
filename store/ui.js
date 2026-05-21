/**
 * store/ui.js — Zustand UI state store
 *
 * UI state ONLY — never fetch data here.
 * Server state lives in SWR hooks.
 *
 * State managed here:
 *  - Sidebar open/collapsed (mobile hamburger)
 *  - Active client filter (All Clients or a specific client UUID)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * @typedef {Object} UIStore
 * @property {boolean}       sidebarOpen       - Mobile: hamburger open state
 * @property {string|null}   activeClientId    - null = "All Clients"
 * @property {string}        activeClientName  - Display name for the filter label
 * @property {() => void}    toggleSidebar
 * @property {() => void}    closeSidebar
 * @property {(id: string|null, name: string) => void} setClientFilter
 * @property {() => void}    clearClientFilter
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<UIStore>>} */
export const useUIStore = create(
  persist(
    (set) => ({
      // ── Sidebar ────────────────────────────────────────────────────────────
      sidebarOpen: false,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      closeSidebar: () => set({ sidebarOpen: false }),

      // ── Client filter ──────────────────────────────────────────────────────
      // Persisted so the selected client survives page navigation
      activeClientId: null,
      activeClientName: "All Clients",

      /**
       * Set the active client filter.
       * Pass null + 'All Clients' to reset.
       *
       * @param {string|null} id
       * @param {string}      name
       */
      setClientFilter: (id, name) =>
        set({
          activeClientId: id,
          activeClientName: name ?? "All Clients",
        }),

      clearClientFilter: () =>
        set({
          activeClientId: null,
          activeClientName: "All Clients",
        }),
    }),
    {
      name: "tofabza-ui", // localStorage key
      partialize: (s) => ({
        // only persist client filter, not sidebar state
        activeClientId: s.activeClientId,
        activeClientName: s.activeClientName,
      }),
    },
  ),
);
