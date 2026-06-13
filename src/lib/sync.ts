"use client";

import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import { buildSyncPayload, type SyncPayload } from "@/lib/syncTypes";

export * from "@/lib/syncTypes";

/** The current local state as a sync payload. */
export function currentSyncPayload(): SyncPayload {
  return buildSyncPayload(usePreferences.getState(), useTrip.getState());
}

/** Overwrite local stores with a server payload (server is authoritative). */
export function applySyncPayload(p: SyncPayload): void {
  usePreferences.setState({
    answers: p.preferences?.answers ?? {},
    microPreferences: p.preferences?.microPreferences ?? [],
    onboardingComplete: p.preferences?.onboardingComplete ?? false,
  });
  useTrip.setState({ trips: p.trips ?? [], activeTripId: p.activeTripId ?? null });
  useTrip.getState().hydrateFromTrips();
}

/** Wipe local data (used when a different user signs in on this browser). */
export function clearLocalData(): void {
  usePreferences.setState({ answers: {}, microPreferences: [], onboardingComplete: false });
  useTrip.setState({ trips: [], activeTripId: null, plan: null, messages: [] });
  useTrip.getState().hydrateFromTrips();
}

// Which user the localStorage cache currently belongs to.
const CACHE_OWNER_KEY = "tour-planner-cache-owner";

export function getCacheOwner(): string | null {
  try {
    return localStorage.getItem(CACHE_OWNER_KEY);
  } catch {
    return null;
  }
}

export function setCacheOwner(userId: string): void {
  try {
    localStorage.setItem(CACHE_OWNER_KEY, userId);
  } catch {
    // storage unavailable — cross-user guard degrades, sync still works
  }
}
