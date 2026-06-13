"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import { useSyncStatus } from "@/store/syncStatus";
import {
  applySyncPayload,
  clearLocalData,
  currentSyncPayload,
  decideSync,
  getCacheOwner,
  setCacheOwner,
  type SyncPayload,
} from "@/lib/sync";

// Module-scoped so the debounced push can dedupe identical payloads (the trip
// store fires on transient changes too, e.g. streaming flags).
let lastPushed: string | null = null;

async function pushNow(): Promise<void> {
  const payload = currentSyncPayload();
  const serialized = JSON.stringify(payload);
  if (serialized === lastPushed) return;
  lastPushed = serialized;
  try {
    const res = await fetch("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) lastPushed = null; // allow retry on the next change
  } catch {
    lastPushed = null; // offline — retry on the next change
  }
}

/**
 * Bridges Clerk auth to the local stores: on sign-in it reconciles the user's
 * server record with the local cache, then pushes every subsequent change
 * (debounced). localStorage stays as the instant offline cache; the server is
 * the cross-device source of truth.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const setSynced = useSyncStatus((s) => s.setSynced);
  const syncedForUser = useRef<string | null>(null);

  // Initial reconcile when the signed-in user changes.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      syncedForUser.current = null;
      lastPushed = null;
      setSynced(false);
      return;
    }
    if (syncedForUser.current === userId) return;

    let cancelled = false;
    setSynced(false);
    (async () => {
      let server: SyncPayload | null = null;
      try {
        const res = await fetch("/api/user-data");
        if (res.ok) server = ((await res.json()).data as SyncPayload | null) ?? null;
      } catch {
        // offline — fall back to whatever is in the local cache
      }
      if (cancelled) return;

      const decision = decideSync(server, getCacheOwner(), userId);
      if (decision === "pull" && server) {
        applySyncPayload(server);
        lastPushed = JSON.stringify(currentSyncPayload()); // don't echo the pull back
      } else {
        if (decision === "reset-push") clearLocalData();
        lastPushed = null;
        await pushNow();
      }
      setCacheOwner(userId);
      syncedForUser.current = userId;
      if (!cancelled) setSynced(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, setSynced]);

  // Debounced push on any local change, once this user is synced.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    const schedule = () => {
      if (syncedForUser.current !== userId) return; // not reconciled yet
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void pushNow(), 1000);
    };
    const unsubPrefs = usePreferences.subscribe(schedule);
    const unsubTrip = useTrip.subscribe(schedule);
    return () => {
      unsubPrefs();
      unsubTrip();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isSignedIn, userId]);

  return <>{children}</>;
}
