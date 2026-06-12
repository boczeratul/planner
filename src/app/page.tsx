"use client";

import { ChatPanel } from "@/components/ChatPanel";
import { HotelList } from "@/components/HotelList";
import { Onboarding } from "@/components/Onboarding";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";

export default function Home() {
  const prefsHydrated = usePreferences((s) => s.hasHydrated);
  const tripHydrated = useTrip((s) => s.hasHydrated);
  const onboardingComplete = usePreferences((s) => s.onboardingComplete);
  const plan = useTrip((s) => s.plan);
  const streaming = useTrip((s) => s.streaming);

  // Avoid a hydration flash while persisted preferences and the saved plan
  // load from localStorage.
  if (!prefsHydrated || !tripHydrated) return null;

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
    <main className="flex h-screen overflow-hidden bg-white">
      <ChatPanel />
      <section className="flex-1 overflow-y-auto">
        {plan || streaming ? (
          <ScheduleBoard />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div>
              <p className="text-4xl">🗺️</p>
              <p className="mt-4 text-lg font-medium text-zinc-700">Your itinerary will appear here</p>
              <p className="mt-1 text-sm text-zinc-400">
                Tell the planner where you want to go in the panel on the left.
              </p>
            </div>
          </div>
        )}
      </section>
      {plan && !streaming && <HotelList />}
    </main>
  );
}
