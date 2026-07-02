"use client";

// The single place that talks to /api/attractions and /api/plan. ChatPanel,
// the AttractionPicker's "Build itinerary" button, and the Attractions tab's
// checkboxes all funnel through here so every path shares the same streaming,
// merging, and error handling.

import { usePreferences } from "@/store/preferences";
import { useTrip } from "@/store/trip";
import {
  attractionIdsInPlan,
  dedupeNewAttractions,
  groupByVote,
  mergeVotes,
} from "@/lib/attractions";
import {
  mergeRefinedPlan,
  overlayPartialDays,
  parsePartialPlanResponse,
  parsePartialRefineResponse,
  planToPartial,
} from "@/lib/streaming";
import {
  AttractionProposalSchema,
  PlanRefineResponseSchema,
  PlanResponseSchema,
  type AttractionVote,
  type TripPlan,
} from "@/lib/types";

function profileBody() {
  const prefs = usePreferences.getState();
  return {
    preferences: prefs.answers,
    learned: prefs.microPreferences.map((m) => m.text),
  };
}

/** Chat history to send along — excluding 📌 notes and the message being sent. */
function historySnapshot() {
  return useTrip.getState().messages.filter((m) => m.role !== "note");
}

function recordLearned(learnedPreferences: string[]) {
  const addMicroPreferences = usePreferences.getState().addMicroPreferences;
  for (const t of addMicroPreferences(learnedPreferences ?? [], "chat")) {
    useTrip.getState().addMessage({ role: "note", text: `📌 Noted: ${t}` });
  }
}

async function throwHttpError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error((data as { error?: string }).error ?? `${fallback} (${res.status})`);
}

/** Step 1: generate — or, when a list already exists, refine — the proposal. */
async function requestProposal(request: string, history: object[]): Promise<void> {
  const t = useTrip.getState();
  const res = await fetch("/api/attractions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request,
      ...profileBody(),
      history,
      currentAttractions: t.attractions.length > 0 ? t.attractions : undefined,
    }),
  });
  if (!res.ok) await throwHttpError(res, "Suggestion failed");
  const proposal = AttractionProposalSchema.parse(await res.json());
  const store = useTrip.getState();
  store.setProposal(
    proposal.attractions,
    mergeVotes(store.attractionVotes, proposal.attractions),
  );
  store.addMessage({ role: "assistant", text: proposal.reply });
}

/** Step 2 / refinements: the streamed /api/plan request with progressive render. */
async function streamPlan(body: Record<string, unknown>, refining: TripPlan | null): Promise<void> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwHttpError(res, "Planning failed");
  if (!res.body) throw new Error("No response stream");

  // The body is the structured-output JSON document, streamed as generated.
  // Re-parse the accumulated fragment per chunk so the board fills in block by
  // block; refinements stream only the changed days, overlaid onto the plan.
  const t = () => useTrip.getState();
  t().setStreaming(true);
  t().setStreamingPlan(refining ? planToPartial(refining) : null);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    if (refining) {
      const partial = parsePartialRefineResponse(acc);
      if (partial) {
        if (partial.reply) t().setLiveReply(partial.reply);
        if (partial.changedDays.length > 0) {
          const overlaid = overlayPartialDays(refining, partial.changedDays);
          // the day still being written is the last changed day so far
          overlaid.activeDay = partial.changedDays[partial.changedDays.length - 1].day;
          t().setStreamingPlan(overlaid);
        }
      }
    } else {
      const partial = parsePartialPlanResponse(acc);
      if (partial) {
        if (partial.reply) t().setLiveReply(partial.reply);
        if (partial.plan) {
          const days = partial.plan.days;
          t().setStreamingPlan({
            ...partial.plan,
            activeDay: days.length > 0 ? days[days.length - 1].day : undefined,
          });
        }
      }
    }
  }
  acc += decoder.decode();

  if (refining) {
    const refine = PlanRefineResponseSchema.parse(JSON.parse(acc));
    t().setPlan(mergeRefinedPlan(refining, refine));
    t().addMessage({ role: "assistant", text: refine.reply });
    recordLearned(refine.learnedPreferences);
  } else {
    const full = PlanResponseSchema.parse(JSON.parse(acc));
    t().setPlan(full.plan);
    t().addMessage({ role: "assistant", text: full.reply });
    recordLearned(full.learnedPreferences);
  }
}

/** Wraps a request with the shared planning/error/cleanup lifecycle. */
async function withPlanningLifecycle(run: () => Promise<void>): Promise<void> {
  const t = useTrip.getState();
  t.setPlanning(true);
  t.setPlanError(null);
  try {
    await run();
  } catch (err) {
    useTrip.getState().setPlanError(err instanceof Error ? err.message : "Request failed");
  } finally {
    const s = useTrip.getState();
    s.setPlanning(false);
    s.setStreaming(false);
    s.setStreamingPlan(null);
    s.setLiveReply("");
  }
}

/**
 * A chat message routes by stage:
 * - plan exists           -> refine the itinerary
 * - no plan, no proposal  -> generate the attraction proposal (step 1)
 * - no plan, proposal up  -> refine the proposal list
 */
export async function sendChatMessage(text: string): Promise<void> {
  const request = text.trim();
  const t = useTrip.getState();
  if (!request || t.planning) return;
  const history = historySnapshot();
  t.addMessage({ role: "user", text: request });
  await withPlanningLifecycle(async () => {
    const s = useTrip.getState();
    if (s.plan) {
      await streamPlan(
        { request, ...profileBody(), currentPlan: s.plan, history },
        s.plan,
      );
    } else {
      await requestProposal(request, history);
    }
  });
}

/** The proposal view's confirm button: build the itinerary from the votes. */
export async function buildItinerary(): Promise<void> {
  const t = useTrip.getState();
  if (t.planning || t.plan || t.attractions.length === 0) return;
  const { mustInclude, mustSkip, flexible } = groupByVote(t.attractions, t.attractionVotes);
  const history = historySnapshot();
  t.addMessage({ role: "user", text: "Build my itinerary from my votes on the suggestions." });
  await withPlanningLifecycle(async () => {
    await streamPlan(
      {
        request: "Build my itinerary from my votes on the suggestions.",
        ...profileBody(),
        history,
        mustIncludeAttractions: mustInclude.map((a) => ({ name: a.name, location: a.location })),
        mustSkipAttractions: mustSkip.map((a) => a.name),
        flexibleAttractions: flexible.map((a) => ({ name: a.name, location: a.location })),
      },
      null,
    );
  });
}

function makeLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `a-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// Module-level guard: at most one load-more request in flight.
let loadingMore = false;

/**
 * Infinite scroll in the proposal view: silently fetch additional suggestions
 * (no chat messages, doesn't block the chat's `planning` flag) and append the
 * genuinely new ones. Returns the number appended (0 = the well is dry, the
 * caller should stop observing), or null when skipped (busy / wrong stage).
 */
export async function loadMoreAttractions(): Promise<number | null> {
  const t = useTrip.getState();
  if (loadingMore || t.planning || t.plan || t.attractions.length === 0) return null;
  loadingMore = true;
  try {
    const res = await fetch("/api/attractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: "Suggest more attractions for this trip.",
        ...profileBody(),
        history: historySnapshot(),
        currentAttractions: t.attractions,
        more: true,
      }),
    });
    if (!res.ok) await throwHttpError(res, "Loading more suggestions failed");
    const proposal = AttractionProposalSchema.parse(await res.json());

    const s = useTrip.getState();
    if (s.plan || s.attractions.length === 0) return null; // stage changed mid-flight
    const fresh = dedupeNewAttractions(s.attractions, proposal.attractions, makeLocalId);
    if (fresh.length > 0) {
      s.setProposal([...s.attractions, ...fresh], s.attractionVotes);
    }
    return fresh.length;
  } finally {
    loadingMore = false;
  }
}

/**
 * A tri-state vote from the proposal view or the Attractions tab. The vote is
 * always recorded; once a plan exists, a vote that contradicts the current
 * itinerary triggers a refinement ("up" & missing -> add, "down" & included
 * -> remove — the tab's shown state is derived from the resulting plan).
 */
export async function voteAttraction(id: string, vote: AttractionVote): Promise<void> {
  const t = useTrip.getState();
  const a = t.attractions.find((x) => x.id === id);
  if (!a) return;
  if (t.plan && (t.planning || t.streaming)) return; // a replan may be needed — wait
  t.setAttractionVote(id, vote);
  if (!t.plan) return;
  const included = attractionIdsInPlan(t.attractions, t.plan).has(id);
  if (vote === "up" && !included) {
    await sendChatMessage(`Add "${a.name}" (${a.location}) to the itinerary where it fits best.`);
  } else if (vote === "down" && included) {
    await sendChatMessage(`Remove "${a.name}" from the itinerary.`);
  }
}
