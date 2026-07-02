"use client";

import { useTrip } from "@/store/trip";
import { attractionIdsInPlan, voteOf } from "@/lib/attractions";
import { voteAttraction } from "@/lib/planActions";
import { VoteButtons } from "@/components/VoteButtons";
import type { Attraction, AttractionVote } from "@/lib/types";

function Row({
  attraction,
  vote,
  disabled,
}: {
  attraction: Attraction;
  vote: AttractionVote;
  disabled: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-2 rounded-xl border bg-white p-3 shadow-sm ${
        vote === "up"
          ? "border-indigo-300"
          : vote === "down"
            ? "border-red-200 opacity-70"
            : "border-zinc-200"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-zinc-900">
          {attraction.name}
        </span>
        <span className="block text-xs text-zinc-500">
          {attraction.category} · {attraction.location}
        </span>
      </span>
      <VoteButtons
        vote={vote}
        disabled={disabled}
        onVote={(v) => void voteAttraction(attraction.id, v)}
      />
    </div>
  );
}

/** Right-panel tab: which suggested attractions are in the itinerary.
 *  Inclusion is DERIVED from the current plan; votes are tri-state —
 *  👍 (must include) on a missing item adds it, 👎 (must skip) on an included
 *  item removes it, neutral leaves it to the planner. */
export function AttractionsTab() {
  const plan = useTrip((s) => s.plan);
  const attractions = useTrip((s) => s.attractions);
  const votes = useTrip((s) => s.attractionVotes);
  const planning = useTrip((s) => s.planning);
  const streaming = useTrip((s) => s.streaming);
  const recomputing = useTrip((s) => s.recomputingDays.length > 0);
  if (!plan) return null;

  if (attractions.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        This trip has no suggestion list (it was planned before attraction voting existed). Ask
        the chat to add or remove specific attractions instead.
      </p>
    );
  }

  const included = attractionIdsInPlan(attractions, plan);
  const busy = planning || streaming || recomputing;
  const inPlan = attractions.filter((a) => included.has(a.id));
  const others = attractions.filter((a) => !included.has(a.id));

  return (
    <div>
      <p className="mb-3 text-xs text-zinc-400">
        👍 must include · 👎 must skip · neutral = planner&apos;s choice. Voting 👍 on a
        suggestion adds it; 👎 on an included item removes it — each change replans the affected
        days.
      </p>

      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        In your itinerary ({inPlan.length})
      </h4>
      <div className="space-y-2">
        {inPlan.map((a) => (
          <Row key={a.id} attraction={a} vote={voteOf(votes, a.id)} disabled={busy} />
        ))}
        {inPlan.length === 0 && <p className="text-xs text-zinc-400">None yet.</p>}
      </div>

      <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        More suggestions ({others.length})
      </h4>
      <div className="space-y-2">
        {others.map((a) => (
          <Row key={a.id} attraction={a} vote={voteOf(votes, a.id)} disabled={busy} />
        ))}
        {others.length === 0 && <p className="text-xs text-zinc-400">Everything made it in 🎉</p>}
      </div>
    </div>
  );
}
