"use client";

import { useEffect, useRef } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { NOT_A_HOTEL } from "@/lib/stays";
import { useTrip } from "@/store/trip";

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// query -> Google place_id, cached so re-verification after every plan tweak
// doesn't re-bill already-checked hotels. "" means Google found nothing.
const PID_CACHE_KEY = "tour-planner-hotel-pids";

function readPidCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PID_CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writePidCache(query: string, placeId: string) {
  try {
    const cache = readPidCache();
    cache[query] = placeId;
    localStorage.setItem(PID_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable — verification still works, just uncached
  }
}

/**
 * Watches the plan; whenever its set of hotels changes, verifies each one on
 * Google Maps (Geocoder) and merges lodging entries that resolve to the same
 * place_id — i.e. differently-worded names for the same actual hotel.
 * Outcomes surface as 📌 notes in the chat.
 */
function ReconcilerInner() {
  const geocoding = useMapsLibrary("geocoding");
  const plan = useTrip((s) => s.plan);
  const streaming = useTrip((s) => s.streaming);
  const mergeLodgings = useTrip((s) => s.mergeLodgings);
  const addMessage = useTrip((s) => s.addMessage);
  const checkedRef = useRef("");

  useEffect(() => {
    if (!geocoding || !plan || streaming) return;

    // unique hotels in day order (skip legacy checkout placeholders)
    const hotels: { name: string; area: string }[] = [];
    for (const d of plan.days) {
      if (!d.lodging || NOT_A_HOTEL.test(d.lodging.name)) continue;
      if (!hotels.some((h) => h.name === d.lodging!.name)) {
        hotels.push({ name: d.lodging.name, area: d.lodging.area });
      }
    }
    if (hotels.length === 0) return;

    // Survives reloads — otherwise every page load would re-post the notes.
    const SIG_KEY = "tour-planner-hotels-verified";
    if (!checkedRef.current) {
      checkedRef.current = localStorage.getItem(SIG_KEY) ?? "";
    }
    const signature = `${plan.destination}|${hotels.map((h) => h.name).join("|")}`;
    if (signature === checkedRef.current) return;
    checkedRef.current = signature;
    try {
      localStorage.setItem(SIG_KEY, signature);
    } catch {
      // storage unavailable — worst case the notes repeat next load
    }

    let cancelled = false;
    (async () => {
      const geocoder = new geocoding.Geocoder();
      const canonicalByPid = new Map<string, { name: string; area: string }>();
      const mapping: Record<string, { name: string; area: string }> = {};
      const notFound: string[] = [];

      for (const hotel of hotels) {
        const query = `${hotel.name}, ${hotel.area}, ${plan.destination}`;
        let placeId = readPidCache()[query];
        if (placeId === undefined) {
          try {
            const res = await geocoder.geocode({ address: query });
            placeId = res.results[0]?.place_id ?? "";
          } catch {
            placeId = ""; // ZERO_RESULTS rejects
          }
          writePidCache(query, placeId);
        }
        if (cancelled) return;

        if (!placeId) {
          notFound.push(hotel.name);
          continue;
        }
        const canonical = canonicalByPid.get(placeId);
        if (canonical) {
          mapping[hotel.name] = canonical; // same place — fold into first naming
        } else {
          canonicalByPid.set(placeId, hotel);
        }
      }
      if (cancelled) return;

      if (Object.keys(mapping).length > 0) {
        mergeLodgings(mapping);
        for (const [from, to] of Object.entries(mapping)) {
          addMessage({
            role: "note",
            text: `🏨 "${from}" and "${to.name}" point to the same hotel on Google Maps — merged.`,
          });
        }
      }
      for (const name of notFound) {
        addMessage({
          role: "note",
          text: `⚠️ Hotel "${name}" wasn't found on Google Maps — the name may be off; ask me to double-check or replace it.`,
        });
      }
      if (notFound.length === 0 && Object.keys(mapping).length === 0) {
        addMessage({
          role: "note",
          text: `🏨 ${hotels.length === 1 ? "Hotel" : `All ${hotels.length} hotels`} verified on Google Maps.`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [geocoding, plan, streaming, mergeLodgings, addMessage]);

  return null;
}

export default function HotelReconciler() {
  if (!MAPS_API_KEY) return null;
  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <ReconcilerInner />
    </APIProvider>
  );
}
