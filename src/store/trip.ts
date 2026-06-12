"use client";

import { create } from "zustand";
import type { LogisticsUpdate, TripPlan } from "@/lib/types";

interface TripState {
  plan: TripPlan | null;
  planning: boolean;
  planError: string | null;
  /** day numbers whose logistics are being recomputed */
  recomputingDays: number[];
  setPlanning: (v: boolean) => void;
  setPlan: (plan: TripPlan | null) => void;
  setPlanError: (e: string | null) => void;
  /** Reorder blocks within a day (optimistic, before logistics recompute). */
  reorderDay: (day: number, blockIds: string[]) => void;
  startRecompute: (day: number) => void;
  applyLogistics: (day: number, update: LogisticsUpdate) => void;
  finishRecompute: (day: number) => void;
}

export const useTrip = create<TripState>((set) => ({
  plan: null,
  planning: false,
  planError: null,
  recomputingDays: [],
  setPlanning: (v) => set({ planning: v }),
  setPlan: (plan) => set({ plan, planError: null }),
  setPlanError: (e) => set({ planError: e }),
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
}));
