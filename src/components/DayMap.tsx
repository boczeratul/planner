"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

/** A stop is identified by a free-text place query; coordinates are resolved
 *  on the fly by the Maps JS Geocoder when the day is viewed. */
export interface QueryStop {
  id: string;
  label: string;
  sublabel?: string;
  query: string;
}

interface ResolvedStop extends QueryStop {
  lat: number;
  lng: number;
}

// ---- localStorage geocode cache (one billing hit per unique place, ever) ----

const CACHE_KEY = "tour-planner-geocache";
const CACHE_MAX = 300;

function readCache(): Record<string, { lat: number; lng: number }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(query: string, coords: { lat: number; lng: number }) {
  try {
    const cache = readCache();
    cache[query] = coords;
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full/unavailable — geocoding still works, just uncached
  }
}

/** Resolve stops to coordinates with the Geocoder, cache-first, in order. */
function useGeocodedStops(stops: QueryStop[]): { pins: ResolvedStop[]; resolving: boolean } {
  const geocoding = useMapsLibrary("geocoding");
  const [pins, setPins] = useState<ResolvedStop[]>([]);
  const [resolving, setResolving] = useState(false);
  const stopsKey = useMemo(() => stops.map((s) => s.id + s.query).join("|"), [stops]);

  useEffect(() => {
    if (!geocoding) return;
    let cancelled = false;
    const geocoder = new geocoding.Geocoder();

    (async () => {
      setPins([]);
      setResolving(true);
      const cache = readCache();
      const resolved: ResolvedStop[] = [];
      for (const stop of stops) {
        let coords = cache[stop.query];
        if (!coords) {
          try {
            const res = await geocoder.geocode({ address: stop.query });
            const loc = res.results[0]?.geometry.location;
            if (!loc) continue;
            coords = { lat: loc.lat(), lng: loc.lng() };
            writeCache(stop.query, coords);
          } catch {
            continue; // unresolvable place — no pin for this stop
          }
        }
        resolved.push({ ...stop, ...coords });
        if (cancelled) return;
        setPins([...resolved]); // pins appear as they resolve
      }
      if (!cancelled) setResolving(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocoding, stopsKey]);

  return { pins, resolving };
}

/** Fits the camera to the day's pins, and pans/zooms to the selected one. */
function CameraController({
  pins,
  selectedId,
}: {
  pins: ResolvedStop[];
  selectedId: string | null;
}) {
  const map = useMap();
  const pinsKey = pins.map((p) => p.id).join("|");

  useEffect(() => {
    if (!map || pins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of pins) bounds.extend({ lat: p.lat, lng: p.lng });
    map.fitBounds(bounds, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinsKey]);

  useEffect(() => {
    if (!map || !selectedId) return;
    const p = pins.find((x) => x.id === selectedId);
    if (!p) return;
    map.panTo({ lat: p.lat, lng: p.lng });
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, pinsKey]);

  return null;
}

function PinsMap({
  stops,
  selectedId,
  onSelect,
}: {
  stops: QueryStop[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { pins, resolving } = useGeocodedStops(stops);
  const selected = pins.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="relative h-full w-full">
      <Map
        className="h-full w-full"
        defaultCenter={{ lat: 20, lng: 0 }}
        defaultZoom={2}
        gestureHandling="greedy"
      >
        {pins.map((p, i) => (
          <Marker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            label={{ text: String(i + 1), color: "white", fontWeight: "bold" }}
            title={p.label}
            onClick={() => onSelect(p.id)}
          />
        ))}
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => onSelect(null)}
          >
            <div className="text-sm">
              <p className="font-semibold text-zinc-900">{selected.label}</p>
              {selected.sublabel && <p className="text-zinc-500">{selected.sublabel}</p>}
            </div>
          </InfoWindow>
        )}
        <CameraController pins={pins} selectedId={selectedId} />
      </Map>
      {resolving && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-medium text-zinc-600 shadow">
          📍 Locating places… {pins.length}/{stops.length}
        </div>
      )}
    </div>
  );
}

export default function DayMap({
  apiKey,
  stops,
  selectedId,
  onSelect,
}: {
  apiKey: string;
  stops: QueryStop[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <APIProvider apiKey={apiKey}>
      <PinsMap stops={stops} selectedId={selectedId} onSelect={onSelect} />
    </APIProvider>
  );
}
