"use client";

import { useState } from "react";
import { HotelList } from "@/components/HotelList";
import { AttractionsTab } from "@/components/AttractionsTab";

/** Right column once a plan exists: Hotels | Attractions tabs. */
export function RightPanel() {
  const [tab, setTab] = useState<"hotels" | "attractions">("hotels");

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 lg:flex">
      <div className="flex border-b border-zinc-200">
        {(
          [
            ["hotels", "Hotels"],
            ["attractions", "Attractions"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "hotels" ? <HotelList /> : <AttractionsTab />}
      </div>
    </aside>
  );
}
