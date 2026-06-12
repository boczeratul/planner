import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
- Block ids must be unique across the whole trip, formatted "d{day}-b{index}" (e.g. "d2-b3").
- legs must connect consecutive blocks in order: leg[i] goes from blocks[i].id to blocks[i+1].id.
- Transit summaries must be concrete (line names, station names, realistic durations).
- startTime values must be consistent with durations and transit time between blocks.
- Lodging should stay in one area unless the trip geography demands a move, and should match
  the traveler's budget preference.

When refining an existing itinerary:
- Return ONLY the affected days in changedDays, as complete day objects (all blocks, legs,
  lodging — with times and transit recomputed for that day). Do NOT re-emit untouched days.
- Within a changed day, keep the ids and content of blocks the traveler didn't ask to change.
- If the request changes the trip length or destination, include every day that is new or
  affected, and update durationDays/destination/summary accordingly.
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
  const { request, preferences, learned, currentPlan, history } = (await req.json()) as {
    request: string;
    preferences: PreferenceAnswers;
    learned?: string[];
    currentPlan?: TripPlan | null;
    history?: ChatMessage[];
  };

  if (!request?.trim()) {
    return NextResponse.json({ error: "Missing trip request" }, { status: 400 });
  }

  const sections = [
    `Traveler preference profile (from an A/B onboarding quiz):
${describePreferences(preferences ?? {}, learned ?? [])}`,
  ];

  if (currentPlan) {
    sections.push(`Current itinerary (JSON):
${JSON.stringify(currentPlan)}`);
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
    const stream = anthropic.messages.stream({
      model: PLANNER_MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
      output_config: {
        // medium effort: itinerary generation is fairly mechanical, and less
        // thinking means the first block reaches the screen much sooner
        effort: "medium",
        format: zodOutputFormat(currentPlan ? PlanRefineResponseSchema : PlanResponseSchema),
      },
    });

    // Pipe the structured-output text deltas straight to the browser as they
    // arrive. The full body is the schema-constrained JSON document; the
    // client renders it progressively and zod-validates the final result.
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          await stream.finalMessage();
          controller.close();
        } catch (err) {
          console.error("plan stream failed:", err);
          controller.error(err);
        }
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
