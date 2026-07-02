"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Attraction,
  AttractionVote,
  ChatMessage,
  LogisticsUpdate,
  PartialTripPlan,
  TripPlan,
} from "@/lib/types";

/** One saved trip: its itinerary + the conversation that produced it. */
export interface Trip {
  id: string;
  /** User-set name; when empty the UI falls back to the plan's destination. */
  title: string;
  createdAt: number;
  plan: TripPlan | null;
  messages: ChatMessage[];
  /** Step-1 recommendation list the traveler voted on (empty until proposed). */
  attractions: Attraction[];
  /** Tri-state votes: id -> "up" (must include) | "down" (must skip); missing = neutral. */
  attractionVotes: Record<string, AttractionVote>;
}

/** Label shown for a trip in the switcher. */
export function tripLabel(t: Pick<Trip, "title" | "plan">): string {
  return t.title.trim() || t.plan?.destination?.trim() || "New trip";
}

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `trip-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function newTrip(): Trip {
  return {
    id: makeId(),
    title: "",
    createdAt: Date.now(),
    plan: null,
    messages: [],
    attractions: [],
    attractionVotes: {},
  };
}

interface TripState {
  /** All saved trips (the source of truth that is persisted). */
  trips: Trip[];
  /** Which trip the board/chat are currently showing. */
  activeTripId: string | null;

  /**
   * Working copy of the active trip, mirrored here so every existing action
   * and component keeps reading `plan`/`messages` unchanged. A subscription
   * writes any change back into the matching `trips` entry.
   */
  plan: TripPlan | null;
  messages: ChatMessage[];
  attractions: Attraction[];
  attractionVotes: Record<string, AttractionVote>;

  // ----- transient per-active-trip state (never persisted) -----
  planning: boolean;
  planError: string | null;
  /** streamed assistant reply shown live in the chat bubble */
  liveReply: string;
  /** true while /api/plan is streaming; the board renders read-only */
  streaming: boolean;
  /** progressively-parsed plan shown while streaming */
  streamingPlan: PartialTripPlan | null;
  /** when set, ChatPanel copies it into the input and focuses it (swap-out flow) */
  chatDraft: string | null;
  /** day numbers whose logistics are being recomputed */
  recomputingDays: number[];
  hasHydrated: boolean;

  // ----- multi-trip actions -----
  /** Create a fresh empty trip and switch to it. */
  createTrip: () => void;
  /** Switch the board/chat to another saved trip. */
  switchTrip: (id: string) => void;
  /** Delete a trip; if it was active, fall back to another (never leaves zero). */
  deleteTrip: (id: string) => void;
  /** Rename a trip (empty title falls back to the destination). */
  renameTrip: (id: string, title: string) => void;
  /** Ensure a trip exists and load it into the working copy (called on hydrate). */
  hydrateFromTrips: () => void;

  setPlanning: (v: boolean) => void;
  setPlan: (plan: TripPlan | null) => void;
  setPlanError: (e: string | null) => void;
  setLiveReply: (v: string) => void;
  /** Store a new/refined attraction proposal + the traveler's votes. */
  setProposal: (attractions: Attraction[], votes: Record<string, AttractionVote>) => void;
  /** Record one tri-state vote ("neutral" clears the entry). */
  setAttractionVote: (id: string, vote: AttractionVote) => void;
  setStreaming: (v: boolean) => void;
  setStreamingPlan: (p: PartialTripPlan | null) => void;
  /** Set/replace day 1's date (ISO YYYY-MM-DD); persists with the plan. */
  setStartDate: (startDate: string) => void;
  /**
   * Rename lodging entries in place (hotel-merge): every lodging whose name
   * is a key of `mapping` takes that entry's canonical name/area.
   */
  mergeLodgings: (mapping: Record<string, { name: string; area: string }>) => void;
  addMessage: (m: ChatMessage) => void;
  setChatDraft: (d: string | null) => void;
  /** Clear the active trip's plan and conversation (Start over). */
  reset: () => void;
  setHasHydrated: (v: boolean) => void;
  /** Reorder blocks within a day (optimistic, before logistics recompute). */
  reorderDay: (day: number, blockIds: string[]) => void;
  startRecompute: (day: number) => void;
  applyLogistics: (day: number, update: LogisticsUpdate) => void;
  finishRecompute: (day: number) => void;
}

/** Transient state that must be cleared whenever we switch/create trips. */
const FRESH_TRANSIENT = {
  planning: false,
  planError: null,
  liveReply: "",
  streaming: false,
  streamingPlan: null,
  chatDraft: null,
  recomputingDays: [] as number[],
};

export const useTrip = create<TripState>()(
  persist(
    (set) => ({
      trips: [],
      activeTripId: null,
      plan: null,
      planning: false,
      planError: null,
      liveReply: "",
      streaming: false,
      streamingPlan: null,
      messages: [],
      attractions: [],
      attractionVotes: {},
      chatDraft: null,
      recomputingDays: [],
      hasHydrated: false,

      createTrip: () => {
        const t = newTrip();
        set((s) => ({
          trips: [...s.trips, t],
          activeTripId: t.id,
          plan: null,
          messages: [],
          attractions: [],
          attractionVotes: {},
          ...FRESH_TRANSIENT,
        }));
      },
      switchTrip: (id) =>
        set((s) => {
          const t = s.trips.find((x) => x.id === id);
          if (!t || id === s.activeTripId) return s;
          return {
            activeTripId: id,
            plan: t.plan,
            messages: t.messages,
            attractions: t.attractions ?? [],
            attractionVotes: t.attractionVotes ?? {},
            ...FRESH_TRANSIENT,
          };
        }),
      deleteTrip: (id) =>
        set((s) => {
          const trips = s.trips.filter((t) => t.id !== id);
          if (id !== s.activeTripId) return { trips };
          // Deleting the active trip: fall back to the most recent remaining
          // one, or seed a fresh empty trip so we never reach zero.
          const fallback = trips[trips.length - 1] ?? newTrip();
          const nextTrips = trips.length > 0 ? trips : [fallback];
          return {
            trips: nextTrips,
            activeTripId: fallback.id,
            plan: fallback.plan,
            messages: fallback.messages,
            attractions: fallback.attractions ?? [],
            attractionVotes: fallback.attractionVotes ?? {},
            ...FRESH_TRANSIENT,
          };
        }),
      renameTrip: (id, title) =>
        set((s) => ({
          trips: s.trips.map((t) => (t.id === id ? { ...t, title } : t)),
        })),
      hydrateFromTrips: () =>
        set((s) => {
          const seeded = s.trips.length > 0 ? s.trips : [newTrip()];
          // Normalize trips saved before attraction voting existed.
          const trips = seeded.map((t) => ({
            ...t,
            attractions: t.attractions ?? [],
            attractionVotes: t.attractionVotes ?? {},
          }));
          const active = trips.find((t) => t.id === s.activeTripId) ?? trips[0];
          return {
            trips,
            activeTripId: active.id,
            plan: active.plan,
            messages: active.messages,
            attractions: active.attractions,
            attractionVotes: active.attractionVotes,
            hasHydrated: true,
          };
        }),

      setPlanning: (v) => set({ planning: v }),
      setPlan: (plan) => set({ plan, planError: null }),
      setPlanError: (e) => set({ planError: e }),
      setLiveReply: (liveReply) => set({ liveReply }),
      setProposal: (attractions, attractionVotes) => set({ attractions, attractionVotes }),
      setAttractionVote: (id, vote) =>
        set((s) => {
          const next = { ...s.attractionVotes };
          if (vote === "neutral") delete next[id];
          else next[id] = vote;
          return { attractionVotes: next };
        }),
      setStreaming: (v) => set({ streaming: v }),
      setStreamingPlan: (p) => set({ streamingPlan: p }),
      setStartDate: (startDate) =>
        set((s) => (s.plan ? { plan: { ...s.plan, startDate } } : s)),
      mergeLodgings: (mapping) =>
        set((s) => {
          if (!s.plan) return s;
          return {
            plan: {
              ...s.plan,
              days: s.plan.days.map((d) => {
                const target = d.lodging && mapping[d.lodging.name];
                if (!target) return d;
                return { ...d, lodging: { ...d.lodging!, name: target.name, area: target.area } };
              }),
            },
          };
        }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      setChatDraft: (chatDraft) => set({ chatDraft }),
      reset: () =>
        set({
          plan: null,
          messages: [],
          attractions: [],
          attractionVotes: {},
          ...FRESH_TRANSIENT,
        }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
      reorderDay: (day, blockIds) =>
        set((s) => {
          if (!s.plan) return s;
          return {
            plan: {
              ...s.plan,
              days: s.plan.days.map((d) => {
                if (d.day !== day) return d;
                const byId = new Map(d.blocks.map((b) => [b.id, b]));
                const blocks = blockIds.map((id) => byId.get(id)!).filter(Boolean);
                return { ...d, blocks };
              }),
            },
          };
        }),
      startRecompute: (day) =>
        set((s) => ({ recomputingDays: [...s.recomputingDays, day] })),
      applyLogistics: (day, update) =>
        set((s) => {
          if (!s.plan) return s;
          const times = new Map(update.blocks.map((b) => [b.id, b.startTime]));
          return {
            plan: {
              ...s.plan,
              days: s.plan.days.map((d) => {
                if (d.day !== day) return d;
                return {
                  ...d,
                  blocks: d.blocks.map((b) => ({
                    ...b,
                    startTime: times.get(b.id) ?? b.startTime,
                  })),
                  legs: update.legs,
                  lodging: update.lodging,
                };
              }),
            },
          };
        }),
      finishRecompute: (day) =>
        set((s) => ({ recomputingDays: s.recomputingDays.filter((d) => d !== day) })),
    }),
    {
      name: "tour-planner-trip",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the saved trips survive a reload; the active working copy is
      // rehydrated from them, and transient request state is dropped.
      partialize: (s) => ({ trips: s.trips, activeTripId: s.activeTripId }),
      // v0 persisted a single { plan, messages }; wrap it as the first trip.
      migrate: (persisted, version) => {
        if (version === 0 || !persisted || !(persisted as { trips?: unknown }).trips) {
          const old = (persisted ?? {}) as { plan?: TripPlan | null; messages?: ChatMessage[] };
          const t: Trip = {
            id: makeId(),
            title: "",
            createdAt: Date.now(),
            plan: old.plan ?? null,
            messages: old.messages ?? [],
            attractions: [],
            attractionVotes: {},
          };
          return { trips: [t], activeTripId: t.id };
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        state?.hydrateFromTrips();
      },
    },
  ),
);

// Mirror every change to the active trip's working copy back into the saved
// `trips` entry, so switching trips and reloading both see current data. The
// guard keeps this from looping (the write only touches `trips`) and from
// firing on purely transient changes (planning/streaming flags).
let lastPlan = useTrip.getState().plan;
let lastMessages = useTrip.getState().messages;
let lastAttractions = useTrip.getState().attractions;
let lastVotes = useTrip.getState().attractionVotes;
useTrip.subscribe((s) => {
  if (
    s.plan === lastPlan &&
    s.messages === lastMessages &&
    s.attractions === lastAttractions &&
    s.attractionVotes === lastVotes
  ) {
    return;
  }
  lastPlan = s.plan;
  lastMessages = s.messages;
  lastAttractions = s.attractions;
  lastVotes = s.attractionVotes;
  if (!s.activeTripId) return;
  useTrip.setState((st) => ({
    trips: st.trips.map((t) =>
      t.id === st.activeTripId
        ? {
            ...t,
            plan: st.plan,
            messages: st.messages,
            attractions: st.attractions,
            attractionVotes: st.attractionVotes,
          }
        : t,
    ),
  }));
});
