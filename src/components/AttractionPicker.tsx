"use client";

import { useEffect, useRef, useState } from "react";
import { useTrip } from "@/store/trip";
import { groupByVote, voteOf } from "@/lib/attractions";
import { buildItinerary, loadMoreAttractions, voteAttraction } from "@/lib/planActions";
import { VoteButtons } from "@/components/VoteButtons";

function googleSearchUrl(name: string, location: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} ${location}`)}`;
}

/** Step 1 of planning (center pane): a single-column list of suggestions,
 *  each shown in full (name, intro, Google Search link) — vote 👍 must
 *  include, 👎 must skip, untouched (default) = the planner decides. */
export function AttractionPicker() {
  const attractions = useTrip((s) => s.attractions);
  const votes = useTrip((s) => s.attractionVotes);
  const planning = useTrip((s) => s.planning);

  // Infinite scroll: when the sentinel under the list becomes visible, fetch
  // more suggestions; stop for good once a fetch yields nothing new.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || exhausted) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || busyRef.current || planning) return;
        busyRef.current = true;
        setLoadingMore(true);
        setLoadError(false);
        void loadMoreAttractions()
          .then((added) => {
            if (added === 0) setExhausted(true); // nothing new — the well is dry
          })
          .catch(() => setLoadError(true))
          .finally(() => {
            busyRef.current = false;
            setLoadingMore(false);
          });
      },
      { rootMargin: "300px" }, // start fetching before the user hits the end
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [exhausted, planning, attractions.length]);

  const { mustInclude, mustSkip, flexible } = groupByVote(attractions, votes);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-zinc-900">Vote on the suggestions</h2>
          <p className="mt-1 text-sm text-zinc-500">
            👍 must be in the itinerary · 👎 must be skipped · leave untouched to let the planner
            decide. You can also ask the chat for different suggestions.
          </p>

          <div className="mt-6 space-y-3">
            {attractions.map((a) => {
              const vote = voteOf(votes, a.id);
              return (
                <div
                  key={a.id}
                  className={`rounded-2xl border-2 bg-white p-4 transition ${
                    vote === "up"
                      ? "border-indigo-500 shadow-sm"
                      : vote === "down"
                        ? "border-red-200 opacity-60"
                        : "border-zinc-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">{a.name}</p>
                      <p className="text-xs font-medium text-indigo-600">
                        {a.category} · {a.location}
                      </p>
                    </div>
                    <VoteButtons
                      vote={vote}
                      disabled={planning}
                      onVote={(v) => void voteAttraction(a.id, v)}
                    />
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">{a.description}</p>
                  <a
                    href={googleSearchUrl(a.name, a.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Google Search ↗
                  </a>
                </div>
              );
            })}
          </div>

          <div ref={sentinelRef} className="py-4 text-center text-sm">
            {loadingMore && (
              <p className="animate-pulse text-indigo-500">Finding more suggestions…</p>
            )}
            {loadError && !loadingMore && (
              <button
                onClick={() => {
                  setLoadError(false);
                  setExhausted(false); // re-arm the observer
                }}
                className="font-medium text-red-500 hover:text-red-400"
              >
                Couldn&apos;t load more — tap to retry
              </button>
            )}
            {exhausted && (
              <p className="text-zinc-400">That&apos;s everything worth suggesting 🎉</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-indigo-700">{mustInclude.length}</span> must-include
            · <span className="font-semibold text-red-600">{mustSkip.length}</span> must-skip ·{" "}
            <span className="font-semibold text-zinc-700">{flexible.length}</span> up to the planner
          </p>
          <button
            onClick={() => void buildItinerary()}
            disabled={planning || attractions.length === 0}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {planning ? "Working…" : "Build itinerary →"}
          </button>
        </div>
      </div>
    </div>
  );
}
