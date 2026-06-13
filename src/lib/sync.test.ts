import { beforeEach, describe, expect, it } from "vitest";
import { buildSyncPayload, decideSync, EMPTY_SYNC } from "@/lib/syncTypes";
import { applySyncPayload, clearLocalData, currentSyncPayload } from "@/lib/sync";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import { plan } from "@/test/fixtures";
import type { SyncPayload } from "@/lib/syncTypes";

// Spec (cross-device auth): the server is the source of truth; on sign-in the
// local cache is reconciled against it, guarding one user from seeing another's
// cached data on a shared browser.
describe("decideSync", () => {
  const payload: SyncPayload = { ...EMPTY_SYNC, activeTripId: "x" };

  it("pulls when the server has a record", () => {
    expect(decideSync(payload, null, "u1")).toBe("pull");
    expect(decideSync(payload, "other", "u1")).toBe("pull");
  });

  it("pushes anonymous local data up on first sign-in (cacheOwner null)", () => {
    expect(decideSync(null, null, "u1")).toBe("push");
  });

  it("pushes when the cache already belongs to this user (offline edits)", () => {
    expect(decideSync(null, "u1", "u1")).toBe("push");
  });

  it("resets then pushes when the cache belongs to a different prior user", () => {
    expect(decideSync(null, "u2", "u1")).toBe("reset-push");
  });
});

describe("buildSyncPayload", () => {
  it("selects exactly the persisted slices", () => {
    const prefs = {
      answers: { pace: "relaxed" },
      microPreferences: [{ id: "1", text: "no museums", source: "chat" as const, learnedAt: 0 }],
      onboardingComplete: true,
    };
    const trip = { trips: [], activeTripId: "t1", plan: null }; // extra field ignored
    const out = buildSyncPayload(prefs, trip);
    expect(out).toEqual({
      preferences: prefs,
      trips: [],
      activeTripId: "t1",
    });
    expect(Object.keys(out)).toEqual(["preferences", "trips", "activeTripId"]);
  });
});

describe("applySyncPayload / currentSyncPayload round-trip", () => {
  beforeEach(() => {
    usePreferences.setState({ answers: {}, microPreferences: [], onboardingComplete: false });
    useTrip.setState({ trips: [], activeTripId: null, plan: null, messages: [] });
  });

  it("applies a server payload into both stores and loads the active trip", () => {
    const trip = {
      id: "t-kyoto",
      title: "Kyoto",
      createdAt: 0,
      plan: plan({ destination: "Kyoto" }),
      messages: [],
    };
    const payload: SyncPayload = {
      preferences: { answers: { food: "street" }, microPreferences: [], onboardingComplete: true },
      trips: [trip],
      activeTripId: "t-kyoto",
    };

    applySyncPayload(payload);

    expect(usePreferences.getState().onboardingComplete).toBe(true);
    expect(usePreferences.getState().answers).toEqual({ food: "street" });
    const ts = useTrip.getState();
    expect(ts.trips.map((t) => t.id)).toEqual(["t-kyoto"]);
    expect(ts.activeTripId).toBe("t-kyoto");
    expect(ts.plan?.destination).toBe("Kyoto"); // working copy loaded
  });

  it("currentSyncPayload reflects what applySyncPayload set", () => {
    const payload: SyncPayload = {
      preferences: { answers: { pace: "packed" }, microPreferences: [], onboardingComplete: true },
      trips: [{ id: "t1", title: "", createdAt: 0, plan: null, messages: [] }],
      activeTripId: "t1",
    };
    applySyncPayload(payload);
    const round = currentSyncPayload();
    expect(round.preferences.answers).toEqual({ pace: "packed" });
    expect(round.activeTripId).toBe("t1");
    expect(round.trips.map((t) => t.id)).toEqual(["t1"]);
  });

  it("clearLocalData empties prefs and seeds a single fresh trip", () => {
    applySyncPayload({
      preferences: { answers: { x: "y" }, microPreferences: [], onboardingComplete: true },
      trips: [{ id: "t1", title: "Old", createdAt: 0, plan: plan(), messages: [] }],
      activeTripId: "t1",
    });

    clearLocalData();

    expect(usePreferences.getState().answers).toEqual({});
    expect(usePreferences.getState().onboardingComplete).toBe(false);
    const ts = useTrip.getState();
    expect(ts.trips).toHaveLength(1); // hydrateFromTrips seeds one empty trip
    expect(ts.trips[0].plan).toBeNull();
    expect(ts.plan).toBeNull();
  });
});
