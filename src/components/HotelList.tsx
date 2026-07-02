"use client";

import { useTrip } from "@/store/trip";
import { collectStays, googleMapsUrl, nightsLabel } from "@/lib/stays";

/** Hotels tab content (rendered inside RightPanel's scrollable body). */
export function HotelList() {
  const plan = useTrip((s) => s.plan);
  if (!plan) return null;

  const stays = collectStays(plan);

  return (
    <div>
      <p className="mb-4 text-xs text-zinc-400">Click a stay to view it on Google Maps ↗</p>

      <div className="space-y-3">
        {stays.map((stay) => (
          <a
            key={`${stay.name}-${stay.nights[0]}`}
            href={googleMapsUrl(stay.name, stay.area, plan.destination)}
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
    </div>
  );
}
