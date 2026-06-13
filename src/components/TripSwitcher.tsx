"use client";

import { useState } from "react";
import { tripLabel, useTrip } from "@/store/trip";

export function TripSwitcher() {
  const trips = useTrip((s) => s.trips);
  const activeTripId = useTrip((s) => s.activeTripId);
  const planning = useTrip((s) => s.planning);
  const streaming = useTrip((s) => s.streaming);
  const createTrip = useTrip((s) => s.createTrip);
  const switchTrip = useTrip((s) => s.switchTrip);
  const deleteTrip = useTrip((s) => s.deleteTrip);
  const renameTrip = useTrip((s) => s.renameTrip);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Switching mid-stream would let in-flight stream callbacks land on the wrong
  // trip, so the whole bar is inert while a plan is being generated.
  const busy = planning || streaming;

  function commitRename(id: string) {
    renameTrip(id, draft.trim());
    setEditingId(null);
  }

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-100 px-2 py-2">
      {trips.map((t) => {
        const active = t.id === activeTripId;
        const editing = t.id === editingId;
        return (
          <div
            key={t.id}
            className={`group flex shrink-0 items-center gap-1 rounded-lg px-1 text-sm transition ${
              active ? "bg-white shadow-sm ring-1 ring-zinc-200" : "hover:bg-zinc-200"
            }`}
          >
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(t.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                placeholder={tripLabel(t)}
                className="w-28 rounded border border-indigo-300 px-1.5 py-1 text-zinc-900 outline-none"
              />
            ) : (
              <button
                onClick={() => !busy && switchTrip(t.id)}
                onDoubleClick={() => {
                  setDraft(t.title);
                  setEditingId(t.id);
                }}
                disabled={busy && !active}
                title={busy && !active ? "Finish the current plan first" : "Double-click to rename"}
                className={`max-w-[10rem] truncate px-2 py-1 font-medium disabled:cursor-not-allowed ${
                  active ? "text-zinc-900" : "text-zinc-500"
                }`}
              >
                {tripLabel(t)}
              </button>
            )}
            <button
              onClick={() => {
                if (busy) return;
                if (trips.length === 1 || confirm(`Delete "${tripLabel(t)}"?`)) deleteTrip(t.id);
              }}
              disabled={busy}
              title="Delete trip"
              className="mr-0.5 rounded px-1 text-xs text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        onClick={() => !busy && createTrip()}
        disabled={busy}
        title="Plan a new trip"
        className="shrink-0 rounded-lg px-2.5 py-1 text-lg leading-none font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
