"use client";

import dynamic from "next/dynamic";
import { AttractionPicker } from "@/components/AttractionPicker";
import { ChatPanel } from "@/components/ChatPanel";
import { RightPanel } from "@/components/RightPanel";

// Client-only: verifies hotels on Google Maps after each plan change
const HotelReconciler = dynamic(() => import("@/components/HotelReconciler"), { ssr: false });
import { Onboarding } from "@/components/Onboarding";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { TripSwitcher } from "@/components/TripSwitcher";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import { useSyncStatus } from "@/store/syncStatus";

export default function Home() {
  const prefsHydrated = usePreferences((s) => s.hasHydrated);
  const tripHydrated = useTrip((s) => s.hasHydrated);
  const synced = useSyncStatus((s) => s.synced);
  const onboardingComplete = usePreferences((s) => s.onboardingComplete);
  const plan = useTrip((s) => s.plan);
  const streaming = useTrip((s) => s.streaming);
  const hasProposal = useTrip((s) => s.attractions.length > 0);
  const activeTripId = useTrip((s) => s.activeTripId);

  // Wait for the local cache AND the server reconcile so a fresh device
  // doesn't flash onboarding before this user's trips arrive.
  if (!prefsHydrated || !tripHydrated || !synced) return null;

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
      <div className="flex h-full w-[380px] shrink-0 flex-col border-r border-zinc-200">
        <TripSwitcher />
        {/* Remount the chat per trip so its local draft/streaming state resets. */}
        <ChatPanel key={activeTripId} />
      </div>
      <section className="flex-1 overflow-y-auto">
        {plan || streaming ? (
          <ScheduleBoard />
        ) : hasProposal ? (
          <AttractionPicker />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div>
              <p className="text-4xl">🗺️</p>
              <p className="mt-4 text-lg font-medium text-zinc-700">Your itinerary will appear here</p>
              <p className="mt-1 text-sm text-zinc-400">
                Tell the planner where you want to go in the panel on the left. You&apos;ll get a
                list of attractions to vote on first, then the itinerary.
              </p>
            </div>
          </div>
        )}
      </section>
      {plan && !streaming && <RightPanel />}
      <HotelReconciler />
    </main>
  );
}
