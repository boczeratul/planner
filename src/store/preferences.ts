"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PreferenceAnswers } from "@/lib/types";

interface PreferencesState {
  answers: PreferenceAnswers;
  onboardingComplete: boolean;
  hasHydrated: boolean;
  setAnswer: (questionId: string, optionId: string) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      answers: {},
      onboardingComplete: false,
      hasHydrated: false,
      setAnswer: (questionId, optionId) =>
        set((s) => ({ answers: { ...s.answers, [questionId]: optionId } })),
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding: () => set({ answers: {}, onboardingComplete: false }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "tour-planner-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ answers: s.answers, onboardingComplete: s.onboardingComplete }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
