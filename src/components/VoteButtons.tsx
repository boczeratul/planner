"use client";

import type { AttractionVote } from "@/lib/types";

/** Tri-state vote control: 👍 must include · 👎 must skip · neither = neutral
 *  (planner's choice). Clicking the active vote returns to neutral. */
export function VoteButtons({
  vote,
  disabled,
  onVote,
}: {
  vote: AttractionVote;
  disabled?: boolean;
  onVote: (vote: AttractionVote) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => onVote(vote === "up" ? "neutral" : "up")}
        disabled={disabled}
        title={vote === "up" ? "Must include — click to reset" : "Must include"}
        className={`rounded-lg px-2 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
          vote === "up"
            ? "bg-indigo-600 text-white"
            : "bg-zinc-100 text-zinc-400 hover:bg-indigo-100 hover:text-indigo-600"
        }`}
      >
        👍
      </button>
      <button
        onClick={() => onVote(vote === "down" ? "neutral" : "down")}
        disabled={disabled}
        title={vote === "down" ? "Must skip — click to reset" : "Must skip"}
        className={`rounded-lg px-2 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
          vote === "down"
            ? "bg-red-500 text-white"
            : "bg-zinc-100 text-zinc-400 hover:bg-red-100 hover:text-red-600"
        }`}
      >
        👎
      </button>
    </span>
  );
}
