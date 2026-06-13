"use client";

import { create } from "zustand";

/** Whether the signed-in user's server data has been reconciled into the
 *  local stores yet. Pages wait on this so a fresh device doesn't flash the
 *  onboarding/empty state before the pull lands. */
interface SyncStatus {
  synced: boolean;
  setSynced: (v: boolean) => void;
}

export const useSyncStatus = create<SyncStatus>((set) => ({
  synced: false,
  setSynced: (synced) => set({ synced }),
}));
