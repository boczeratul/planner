// Server- and client-safe sync types + pure helpers (no store/runtime imports,
// so this is importable from both API routes and client code).
import type { Trip } from "@/store/trip";
import type { MicroPreference, PreferenceAnswers } from "@/lib/types";

/** Everything that is persisted per user, server-side (and mirrored locally). */
export interface SyncPayload {
  preferences: {
    answers: PreferenceAnswers;
    microPreferences: MicroPreference[];
    onboardingComplete: boolean;
  };
  trips: Trip[];
  activeTripId: string | null;
}

export const EMPTY_SYNC: SyncPayload = {
  preferences: { answers: {}, microPreferences: [], onboardingComplete: false },
  trips: [],
  activeTripId: null,
};

/** Select exactly the persisted slices from the two stores' state. */
export function buildSyncPayload(
  prefs: { answers: PreferenceAnswers; microPreferences: MicroPreference[]; onboardingComplete: boolean },
  trip: { trips: Trip[]; activeTripId: string | null },
): SyncPayload {
  return {
    preferences: {
      answers: prefs.answers,
      microPreferences: prefs.microPreferences,
      onboardingComplete: prefs.onboardingComplete,
    },
    trips: trip.trips,
    activeTripId: trip.activeTripId,
  };
}

export type SyncDecision = "pull" | "push" | "reset-push";

/**
 * On sign-in, decide how to reconcile the server record against the local
 * cache. The browser's localStorage is shared across users, so `cacheOwner`
 * (the user the cache currently belongs to) guards against one user seeing
 * another's cached data.
 *
 * - "pull": server has data -> it is authoritative, overwrite local.
 * - "push": no server record yet, and the cache is this user's (offline edits)
 *   or anonymous (pre-login data to migrate up) -> upload local.
 * - "reset-push": no server record, but the cache belongs to a DIFFERENT prior
 *   user -> clear local first, then upload an empty record.
 */
export function decideSync(
  serverData: SyncPayload | null,
  cacheOwner: string | null,
  userId: string,
): SyncDecision {
  if (serverData) return "pull";
  if (cacheOwner === null || cacheOwner === userId) return "push";
  return "reset-push";
}
