"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { BlockInner, TransitLeg } from "@/components/ScheduleBoard";
import type { QueryStop } from "@/components/DayMap";
import { dateForDay } from "@/lib/dates";
import { useTrip } from "@/store/trip";
import { useSyncStatus } from "@/store/syncStatus";
import type { DayPlan, TripPlan } from "@/lib/types";

const DayMap = dynamic(() => import("@/components/DayMap"), { ssr: false });

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/**
 * All pins for a day, as place-name queries geocoded on the fly by DayMap:
 * where the traveler wakes up (previous night's lodging), every block
 * (airport arrivals/departures are ordinary blocks, so they get pins too),
 * and tonight's lodging.
 */
function dayStops(plan: TripPlan, day: DayPlan): QueryStop[] {
  const stops: QueryStop[] = [];
  const prev = plan.days.find((d) => d.day === day.day - 1);
  if (prev?.lodging) {
    stops.push({
      id: "prev-hotel",
      label: `🛏️ ${prev.lodging.name}`,
      sublabel: "Starting point (last night)",
      query: `${prev.lodging.name}, ${prev.lodging.area}, ${plan.destination}`,
    });
  }
  for (const b of day.blocks) {
    stops.push({
      id: b.id,
      label: b.title,
      sublabel: b.location,
      query: `${b.title}, ${b.location}, ${plan.destination}`,
    });
  }
  if (day.lodging) {
    stops.push({
      id: "hotel",
      label: `🛏️ ${day.lodging.name}`,
      sublabel: "Tonight",
      query: `${day.lodging.name}, ${day.lodging.area}, ${plan.destination}`,
    });
  }
  return stops;
}

export default function ExecutePage() {
  const hasHydrated = useTrip((s) => s.hasHydrated);
  const synced = useSyncStatus((s) => s.synced);
  const plan = useTrip((s) => s.plan);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);

  if (!hasHydrated || !synced) return null;

  if (!plan || plan.days.length === 0) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-4xl">🧭</p>
        <p className="text-lg font-medium text-zinc-700">No itinerary to execute yet</p>
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← Go plan a trip first
        </Link>
      </main>
    );
  }

  const day = plan.days.find((d) => d.day === selectedDay) ?? plan.days[0];
  const dateLabel = dateForDay(plan.startDate, day.day);
  const legByPair = new Map(day.legs.map((l) => [`${l.fromBlockId}->${l.toBlockId}`, l]));
  const stops = dayStops(plan, day);

  function switchDay(d: number) {
    setSelectedDay(d);
    setSelectedStop(null);
  }

  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex items-center gap-4 border-b border-zinc-200 px-4 py-2.5">
        <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-zinc-700">
          ← Planning
        </Link>
        <h1 className="font-bold text-zinc-900">
          {plan.destination} <span className="font-normal text-zinc-400">· execute</span>
        </h1>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
          {plan.days.map((d) => (
            <button
              key={d.day}
              onClick={() => switchDay(d.day)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                d.day === day.day
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Day {d.day}
            </button>
          ))}
        </nav>
        {/* Account menu / sign-out (no chat column on this page). */}
        <UserButton />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 shrink-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-bold text-zinc-900">Day {day.day}</h2>
            {dateLabel && <span className="text-sm font-medium text-zinc-400">{dateLabel}</span>}
          </div>
          <p className="mb-4 text-sm text-zinc-500">{day.theme}</p>

          <div className="flex flex-col">
            {day.blocks.map((block, i) => {
              const next = day.blocks[i + 1];
              const leg = next ? legByPair.get(`${block.id}->${next.id}`) : undefined;
              return (
                <div key={block.id}>
                  <button
                    onClick={() => setSelectedStop(block.id)}
                    className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 ${
                      selectedStop === block.id
                        ? "border-indigo-500 ring-2 ring-indigo-200"
                        : "border-zinc-200"
                    }`}
                  >
                    <BlockInner block={block} stale={false} />
                  </button>
                  {next && (leg ? <TransitLeg leg={leg} /> : <div className="h-3" />)}
                </div>
              );
            })}
          </div>

          {day.lodging && (
            <button
              onClick={() => setSelectedStop("hotel")}
              className={`mt-4 w-full rounded-xl border bg-white p-3 text-left text-sm transition hover:border-indigo-300 ${
                selectedStop === "hotel"
                  ? "border-indigo-500 ring-2 ring-indigo-200"
                  : "border-zinc-200"
              }`}
            >
              <p className="font-medium text-zinc-800">🛏️ Tonight: {day.lodging.name}</p>
              <p className="text-xs text-zinc-500">
                {day.lodging.area} — {day.lodging.reason}
              </p>
            </button>
          )}

          <div className="mt-4 flex justify-between text-sm font-medium">
            <button
              onClick={() => switchDay(day.day - 1)}
              disabled={day.day <= 1}
              className="text-indigo-600 hover:text-indigo-500 disabled:invisible"
            >
              ← Day {day.day - 1}
            </button>
            <button
              onClick={() => switchDay(day.day + 1)}
              disabled={day.day >= plan.days.length}
              className="text-indigo-600 hover:text-indigo-500 disabled:invisible"
            >
              Day {day.day + 1} →
            </button>
          </div>
        </aside>

        <section className="flex-1">
          {!MAPS_API_KEY ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-500">
              <p>
                Set <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
                in <code className="rounded bg-zinc-100 px-1">.env.local</code> and restart the dev
                server to show the map.
              </p>
            </div>
          ) : stops.length === 0 ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-500">
              <p>No locations on this day.</p>
            </div>
          ) : (
            <DayMap
              apiKey={MAPS_API_KEY}
              stops={stops}
              selectedId={selectedStop}
              onSelect={setSelectedStop}
            />
          )}
        </section>
      </div>
    </main>
  );
}
