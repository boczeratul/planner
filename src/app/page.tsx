"use client";

import { Onboarding } from "@/components/Onboarding";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { TripInput } from "@/components/TripInput";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";

export default function Home() {
  const hasHydrated = usePreferences((s) => s.hasHydrated);
  const onboardingComplete = usePreferences((s) => s.onboardingComplete);
  const plan = useTrip((s) => s.plan);

  // Avoid a hydration flash while the persisted preferences load from localStorage.
  if (!hasHydrated) return null;

  if (!onboardingComplete) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-6 pt-16 text-center">
          <h1 className="text-3xl font-bold text-zinc-900">Let&apos;s learn your travel style</h1>
          <p className="mt-2 text-zinc-500">
            A few quick this-or-that questions so every trip we plan fits you.
          </p>
        </div>
        <Onboarding />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      {plan ? <ScheduleBoard /> : <TripInput />}
    </main>
  );
}
