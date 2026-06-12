"use client";

import { useState } from "react";
import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import type { TripPlan } from "@/lib/types";

export function TripInput() {
  const [text, setText] = useState("");
  const answers = usePreferences((s) => s.answers);
  const resetOnboarding = usePreferences((s) => s.resetOnboarding);
  const { planning, planError, setPlanning, setPlan, setPlanError } = useTrip();

  async function submit() {
    const request = text.trim();
    if (!request || planning) return;
    setPlanning(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, preferences: answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Planning failed (${res.status})`);
      setPlan(data as TripPlan);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-12">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-zinc-900">Where to?</h1>
        <button
          onClick={resetOnboarding}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
          title="Redo the preference quiz"
        >
          Retake preference quiz
        </button>
      </div>
      <p className="mb-6 text-zinc-500">
        Describe your trip — destination, how long, anything special.
      </p>

      <div className="flex gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          placeholder='e.g. "Plan a 4-day trip to Kyoto in November, I love food and quiet temples"'
          className="flex-1 resize-none rounded-2xl border-2 border-zinc-200 bg-white p-4 text-zinc-900 outline-none transition focus:border-indigo-400"
        />
        <button
          onClick={submit}
          disabled={planning || !text.trim()}
          className="self-end rounded-2xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {planning ? "Planning…" : "Plan trip"}
        </button>
      </div>

      {planning && (
        <p className="mt-4 animate-pulse text-sm text-indigo-600">
          Designing your itinerary — this can take a minute…
        </p>
      )}
      {planError && <p className="mt-4 text-sm text-red-600">{planError}</p>}
    </div>
  );
}
