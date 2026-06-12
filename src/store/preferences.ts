"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MicroPreference, PreferenceAnswers } from "@/lib/types";

const MAX_MICRO_PREFERENCES = 30;

interface PreferencesState {
  answers: PreferenceAnswers;
  /** Preferences inferred from how the user adjusts plans (chat edits, drags). */
  microPreferences: MicroPreference[];
  onboardingComplete: boolean;
  hasHydrated: boolean;
  setAnswer: (questionId: string, optionId: string) => void;
  /**
   * Add inferred preferences, skipping (case-insensitive) duplicates.
   * Returns the texts that were actually new.
   */
  addMicroPreferences: (texts: string[], source: MicroPreference["source"]) => string[];
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => ({
      answers: {},
      microPreferences: [],
      onboardingComplete: false,
      hasHydrated: false,
      setAnswer: (questionId, optionId) =>
        set((s) => ({ answers: { ...s.answers, [questionId]: optionId } })),
      addMicroPreferences: (texts, source) => {
        const existing = new Set(
          get().microPreferences.map((m) => m.text.trim().toLowerCase()),
        );
        const fresh = texts
          .map((t) => t.trim())
          .filter((t) => t && !existing.has(t.toLowerCase()));
        if (fresh.length === 0) return [];
        set((s) => ({
          microPreferences: [
            ...s.microPreferences,
            ...fresh.map((text) => ({
              id: crypto.randomUUID(),
              text,
              source,
              learnedAt: Date.now(),
            })),
          ].slice(-MAX_MICRO_PREFERENCES),
        }));
        return fresh;
      },
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding: () =>
        set({ answers: {}, microPreferences: [], onboardingComplete: false }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "tour-planner-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        answers: s.answers,
        microPreferences: s.microPreferences,
        onboardingComplete: s.onboardingComplete,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
