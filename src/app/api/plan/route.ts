import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, PLANNER_MODEL } from "@/lib/anthropic";
import { describePreferences } from "@/lib/preferences";
import {
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
- Change ONLY what the traveler asked for (and whatever logistics that forces); keep everything
  else — including block ids of untouched blocks — exactly as it was.
- If a request is impossible or unwise (e.g. closed that day, geographically absurd), do your
  best and explain the trade-off in the reply.
- The reply must be short and conversational (1-3 sentences): what changed and why.`;

export async function POST(req: Request) {
  const { request, preferences, currentPlan, history } = (await req.json()) as {
    request: string;
    preferences: PreferenceAnswers;
    currentPlan?: TripPlan | null;
    history?: ChatMessage[];
  };

  if (!request?.trim()) {
    return NextResponse.json({ error: "Missing trip request" }, { status: 400 });
  }

  const sections = [
    `Traveler preference profile (from an A/B onboarding quiz):
${describePreferences(preferences ?? {})}`,
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

Revise the itinerary accordingly and reply conversationally.`
      : `Trip request: ${request}

Design the full itinerary and reply conversationally.`,
  );

  try {
    // Streaming is required for high max_tokens (the SDK rejects long
    // non-streaming requests). The output format still guarantees the
    // text block is schema-valid JSON; we re-validate with zod below.
    const stream = anthropic.messages.stream({
      model: PLANNER_MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
      output_config: { format: zodOutputFormat(PlanResponseSchema) },
    });

    const message = await stream.finalMessage();
    const text = message.content.find((b) => b.type === "text")?.text;
    if (!text) {
      return NextResponse.json({ error: "Planner returned no itinerary" }, { status: 502 });
    }
    const planResponse = PlanResponseSchema.parse(JSON.parse(text));
    return NextResponse.json(planResponse);
  } catch (err) {
    console.error("plan route failed:", err);
    const message = err instanceof Error ? err.message : "Planning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
