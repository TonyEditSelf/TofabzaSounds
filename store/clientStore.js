// /store/clientStore.js
import { create } from "zustand";

/**
 * UI state for the active client filter.
 * null = "All Clients". string = a client UUID.
 * Never fetches data — data lives in SWR.
 */
export const useClientStore = create((set) => ({
  /** @type {string|null} */
  clientFilter: null,

  /** @param {string|null} id */
  setClientFilter: (id) => set({ clientFilter: id }),

  clearClientFilter: () => set({ clientFilter: null }),
}));
