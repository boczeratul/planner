import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, PLANNER_MODEL } from "@/lib/anthropic";
import { describePreferences } from "@/lib/preferences";
import { TripPlanSchema, type PreferenceAnswers } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You are an expert travel planner. You design realistic, geographically sensible
day-by-day itineraries.

Rules:
- Group each day's blocks by neighborhood to minimize backtracking.
- Every day includes breakfast, lunch and dinner blocks plus 2-4 attraction/activity blocks,
  adjusted to the traveler's stated pace.
- Block ids must be unique across the whole trip, formatted "d{day}-b{index}" (e.g. "d2-b3").
- legs must connect consecutive blocks in order: leg[i] goes from blocks[i].id to blocks[i+1].id.
- Transit summaries must be concrete (line names, station names, realistic durations).
- startTime values must be consistent with durations and transit time between blocks.
- Lodging should stay in one area unless the trip geography demands a move, and should match
  the traveler's budget preference.`;

export async function POST(req: Request) {
  const { request, preferences } = (await req.json()) as {
    request: string;
    preferences: PreferenceAnswers;
  };

  if (!request?.trim()) {
    return NextResponse.json({ error: "Missing trip request" }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.parse({
      model: PLANNER_MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Traveler preference profile (from an A/B onboarding quiz):
${describePreferences(preferences ?? {})}

Trip request: ${request}

Design the full itinerary.`,
        },
      ],
      output_config: { format: zodOutputFormat(TripPlanSchema) },
    });

    const plan = response.parsed_output;
    if (!plan) {
      return NextResponse.json({ error: "Planner returned no itinerary" }, { status: 502 });
    }
    return NextResponse.json(plan);
  } catch (err) {
    console.error("plan route failed:", err);
    const message = err instanceof Error ? err.message : "Planning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
