"use client";

import { useTrip } from "@/store/trip";
import type { TripPlan } from "@/lib/types";

/**
 * Agoda has no public deep-link by hotel name, so we open their text search
 * pre-filled with hotel + area + destination — it lands on the hotel page (or
 * a near-exact search result) in a new tab.
 */
function agodaSearchUrl(name: string, area: string, destination: string): string {
  const q = encodeURIComponent(`${name} ${area} ${destination}`);
  return `https://www.agoda.com/search?q=${q}`;
}

interface HotelStay {
  name: string;
  area: string;
  reason: string;
  nights: number[]; // day numbers
}

/** Collapse per-day lodging into stays (consecutive nights at the same hotel). */
function collectStays(plan: TripPlan): HotelStay[] {
  const stays: HotelStay[] = [];
  for (const day of plan.days) {
    const last = stays[stays.length - 1];
    if (last && last.name === day.lodging.name) {
      last.nights.push(day.day);
    } else {
      stays.push({ ...day.lodging, nights: [day.day] });
    }
  }
  return stays;
}

function nightsLabel(nights: number[]): string {
  if (nights.length === 1) return `Night ${nights[0]}`;
  return `Nights ${nights[0]}–${nights[nights.length - 1]}`;
}

export function HotelList() {
  const plan = useTrip((s) => s.plan);
  if (!plan) return null;

  const stays = collectStays(plan);

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-4 lg:block">
      <h3 className="mb-1 font-bold text-zinc-900">Hotels</h3>
      <p className="mb-4 text-xs text-zinc-400">Click a stay to book on Agoda ↗</p>

      <div className="space-y-3">
        {stays.map((stay) => (
          <a
            key={`${stay.name}-${stay.nights[0]}`}
            href={agodaSearchUrl(stay.name, stay.area, plan.destination)}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-indigo-400 hover:shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-zinc-900">🛏️ {stay.name}</p>
              <span className="shrink-0 text-xs text-zinc-400">↗</span>
            </div>
            <p className="mt-1 text-xs font-medium text-indigo-600">{nightsLabel(stay.nights)}</p>
            <p className="mt-1 text-xs text-zinc-500">{stay.area}</p>
            <p className="mt-2 text-xs text-zinc-400">{stay.reason}</p>
          </a>
        ))}
      </div>
    </aside>
  );
}
