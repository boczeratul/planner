import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAuthUserId } from "@/lib/requireUser";
import { anthropic, PLANNER_MODEL } from "@/lib/anthropic";
import { describePreferences } from "@/lib/preferences";
import {
  PlanRefineResponseSchema,
  PlanResponseSchema,
  type ChatMessage,
  type PreferenceAnswers,
  type TripPlan,
} from "@/lib/types";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You are an expert travel planner. You design realistic, geographically sensible
day-by-day itineraries, and you refine them through conversation with the traveler.

Rules:
- Group each day's blocks by neighborhood to minimize backtracking.
- Every day includes breakfast, lunch and dinner blocks plus 2-4 attraction/activity blocks,
  adjusted to the traveler's stated pace.
- Day 1 starts with an "arrival" block at the trip's entry point, and the final day ends with
  a "departure" block at the exit point — name the actual place (e.g. "Arrive at OKA airport",
  "Leave from OKA airport"). Use the destination's real airport/station.
- Block ids must be unique across the whole trip, formatted "d{day}-b{index}" (e.g. "d2-b3").
- movable: false for arrival/departure, anything anchored to the lodging ("breakfast near the
  hotel"), and fixed-time reservations; true for blocks the traveler may freely reorder.
- legs must connect consecutive blocks in order: leg[i] goes from blocks[i].id to blocks[i+1].id.
- Transit summaries must be concrete (line names, station names, realistic durations).
- startTime values must be consistent with durations and transit time between blocks.
- Lodging should stay in one area unless the trip geography demands a move, and should match
  the traveler's budget preference. On the final day (or any day with no overnight stay), set
  lodging to null — never emit a "checkout" or "no hotel" placeholder as lodging.
- startDate: if the traveler has said when the trip begins (including relative phrasing like
  "next Friday" or "over Christmas" — resolve against today's date, provided below), set it as
  an ISO date (YYYY-MM-DD). If unknown, set startDate to "" and ASK for the start date in your
  reply.

When refining an existing itinerary:
- Return ONLY the affected days in changedDays, as complete day objects (all blocks, legs,
  lodging — with times and transit recomputed for that day). Do NOT re-emit untouched days.
- Within a changed day, keep the ids and content of blocks the traveler didn't ask to change.
- If the request changes the trip length or destination, include every day that is new or
  affected, and update durationDays/destination/summary accordingly.
- startDate: copy from the current itinerary unless the traveler specified or changed it
  (resolve relative dates against today's date, provided below).
- If a request is impossible or unwise (e.g. closed that day, geographically absurd), do your
  best and explain the trade-off in the reply.
- The reply must be short and conversational (1-3 sentences): what changed and why.

Learning preferences:
- If a refinement request reveals a durable, generalizable taste (e.g. "no more museums" ->
  avoids museums; "dinner is too early" -> prefers later dinners), record it in
  learnedPreferences.
- Do NOT record one-off or situational requests (weather, a specific closure, "my friend joins
  on day 2"), and do NOT repeat anything already in the traveler's profile. Most requests
  reveal nothing durable — an empty list is the normal case.`;

export async function POST(req: Request) {
  if (!(await getAuthUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const {
    request,
    preferences,
    learned,
    currentPlan,
    history,
    mustIncludeAttractions,
    mustSkipAttractions,
    flexibleAttractions,
  } = (await req.json()) as {
      request: string;
      preferences: PreferenceAnswers;
      learned?: string[];
      currentPlan?: TripPlan | null;
      history?: ChatMessage[];
      /** initial mode: upvoted — hard requirement, every one appears */
      mustIncludeAttractions?: { name: string; location: string }[];
      /** initial mode: downvoted — must not appear */
      mustSkipAttractions?: string[];
      /** initial mode: neutral — include or skip at the planner's discretion */
      flexibleAttractions?: { name: string; location: string }[];
    };

  if (!request?.trim()) {
    return NextResponse.json({ error: "Missing trip request" }, { status: 400 });
  }

  const sections = [
    `Today's date: ${new Date().toISOString().slice(0, 10)} (for resolving relative dates).`,
    `Traveler preference profile (from an A/B onboarding quiz):
${describePreferences(preferences ?? {}, learned ?? [])}`,
  ];

  if (currentPlan) {
    sections.push(`Current itinerary (JSON):
${JSON.stringify(currentPlan)}`);
  }
  const voted =
    (mustIncludeAttractions?.length ?? 0) +
    (mustSkipAttractions?.length ?? 0) +
    (flexibleAttractions?.length ?? 0);
  if (!currentPlan && voted > 0) {
    const parts = ["The traveler voted on a list of suggested attractions:"];
    if (mustIncludeAttractions && mustIncludeAttractions.length > 0) {
      parts.push(`MUST include (hard requirement — every one of these appears in the itinerary):
${mustIncludeAttractions.map((a) => `- ${a.name} (${a.location})`).join("\n")}`);
    }
    if (mustSkipAttractions && mustSkipAttractions.length > 0) {
      parts.push(`MUST NOT include under any circumstances:
${mustSkipAttractions.map((n) => `- ${n}`).join("\n")}`);
    }
    if (flexibleAttractions && flexibleAttractions.length > 0) {
      parts.push(`Flexible — your choice; include the ones that fit the days and geography well,
skip the rest freely:
${flexibleAttractions.map((a) => `- ${a.name} (${a.location})`).join("\n")}`);
    }
    parts.push(
      "You may also add fitting attractions that are not on this list, except the MUST NOT ones.",
    );
    sections.push(parts.join("\n\n"));
  }
  if (history && history.length > 0) {
    const transcript = history
      .slice(-12)
      .map((m) => `${m.role === "user" ? "Traveler" : "Planner"}: ${m.text}`)
      .join("\n");
    sections.push(`Conversation so far:
${transcript}`);
  }
  sections.push(
    currentPlan
      ? `The traveler's new request: ${request}

Revise the itinerary accordingly and reply conversationally. Return only the changed days.`
      : `Trip request: ${request}

Design the full itinerary and reply conversationally.`,
  );

  try {
    // Haiku 4.5: no thinking/effort params (both 400 on this model).
    const stream = anthropic.messages.stream({
      model: PLANNER_MODEL,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
      output_config: {
        format: zodOutputFormat(currentPlan ? PlanRefineResponseSchema : PlanResponseSchema),
      },
    });

    // Pipe the structured-output text deltas straight to the browser as they
    // arrive. The full body is the schema-constrained JSON document; the
    // client renders it progressively and zod-validates the final result.
    // The browser can drop the connection mid-stream (reload, aborted fetch),
    // which closes the controller — every controller call must tolerate that,
    // or the route crashes with "Controller is already closed".
    const encoder = new TextEncoder();
    let cancelled = false;
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (cancelled) break;
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              try {
                controller.enqueue(encoder.encode(event.delta.text));
              } catch {
                cancelled = true; // client went away between cancel() and here
                break;
              }
            }
          }
          if (!cancelled) {
            await stream.finalMessage();
            try {
              controller.close();
            } catch {
              // already closed by a late cancellation — nothing to do
            }
          }
        } catch (err) {
          if (!cancelled) {
            console.error("plan stream failed:", err);
            try {
              controller.error(err);
            } catch {
              // controller already closed — the client is gone anyway
            }
          }
        }
      },
      cancel() {
        // Reader disconnected: stop paying for tokens nobody will receive.
        cancelled = true;
        stream.abort();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("plan route failed:", err);
    const message = err instanceof Error ? err.message : "Planning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
