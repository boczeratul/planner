import type { Lodging, TripPlan } from "./types";

// Plans saved before lodging became nullable may carry a fabricated
// "checkout"-style entry on the final day — filter those defensively.
export const NOT_A_HOTEL =
  /check[\s-]?out|no (hotel|lodging|stay|accommodation)|departure|n\/a|none needed/i;

export interface HotelStay extends Lodging {
  nights: number[]; // day numbers
}

/** Collapse per-day lodging into stays (consecutive nights at the same hotel). */
export function collectStays(plan: TripPlan): HotelStay[] {
  const stays: HotelStay[] = [];
  for (const day of plan.days) {
    if (!day.lodging || NOT_A_HOTEL.test(day.lodging.name)) continue;
    const last = stays[stays.length - 1];
    if (last && last.name === day.lodging.name) {
      last.nights.push(day.day);
    } else {
      stays.push({ ...day.lodging, nights: [day.day] });
    }
  }
  return stays;
}

export function nightsLabel(nights: number[]): string {
  if (nights.length === 1) return `Night ${nights[0]}`;
  return `Nights ${nights[0]}–${nights[nights.length - 1]}`;
}

/**
 * Google Maps search deep link (documented Maps URLs API) — lands on the
 * hotel's place page, from which the user can see photos, reviews and book.
 */
export function googleMapsUrl(name: string, area: string, destination: string): string {
  const q = encodeURIComponent(`${name} ${area} ${destination}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
