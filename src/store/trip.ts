"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatMessage, LogisticsUpdate, PartialTripPlan, TripPlan } from "@/lib/types";

interface TripState {
  plan: TripPlan | null;
  planning: boolean;
  planError: string | null;
  /** true while /api/plan is streaming; the board renders read-only */
  streaming: boolean;
  /** progressively-parsed plan shown while streaming */
  streamingPlan: PartialTripPlan | null;
  /** chat transcript shown in the left panel */
  messages: ChatMessage[];
  /** day numbers whose logistics are being recomputed */
  recomputingDays: number[];
  hasHydrated: boolean;
  setPlanning: (v: boolean) => void;
  setPlan: (plan: TripPlan | null) => void;
  setPlanError: (e: string | null) => void;
  setStreaming: (v: boolean) => void;
  setStreamingPlan: (p: PartialTripPlan | null) => void;
  addMessage: (m: ChatMessage) => void;
  /** Clear the plan and the conversation (Start over). */
  reset: () => void;
  setHasHydrated: (v: boolean) => void;
  /** Reorder blocks within a day (optimistic, before logistics recompute). */
  reorderDay: (day: number, blockIds: string[]) => void;
  startRecompute: (day: number) => void;
  applyLogistics: (day: number, update: LogisticsUpdate) => void;
  finishRecompute: (day: number) => void;
}

export const useTrip = create<TripState>()(
  persist(
    (set) => ({
      plan: null,
      planning: false,
      planError: null,
      streaming: false,
      streamingPlan: null,
      messages: [],
      recomputingDays: [],
      hasHydrated: false,
      setPlanning: (v) => set({ planning: v }),
      setPlan: (plan) => set({ plan, planError: null }),
      setPlanError: (e) => set({ planError: e }),
      setStreaming: (v) => set({ streaming: v }),
      setStreamingPlan: (p) => set({ streamingPlan: p }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      reset: () =>
        set({
          plan: null,
          messages: [],
          planError: null,
          planning: false,
          streaming: false,
          streamingPlan: null,
          recomputingDays: [],
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
      storage: createJSONStorage(() => localStorage),
      // Only the plan and the conversation survive a reload; transient
      // request state (planning, errors, recompute flags) does not.
      partialize: (s) => ({ plan: s.plan, messages: s.messages }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
