import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, PLANNER_MODEL } from "@/lib/anthropic";
import { describePreferences } from "@/lib/preferences";
import {
  LogisticsUpdateSchema,
  type PreferenceAnswers,
  type ScheduleBlock,
} from "@/lib/types";

export const maxDuration = 120;

const SYSTEM_PROMPT = `You are a travel logistics engine. The traveler has rearranged the blocks of one
day of their itinerary. Recompute the logistics for the NEW order without changing the order or
contents of the blocks.

Rules:
- Keep the given block order exactly. Only recompute start times, transit legs, and lodging.
- legs must connect consecutive blocks: leg[i] goes from blocks[i].id to blocks[i+1].id.
- Transit summaries must be concrete (mode, line/route names, realistic durations).
- Respect plausible opening hours and meal times where possible; if the new order makes a
  timing awkward (e.g. dinner at 14:00), keep the order but flag it in notes.
- Match the traveler's transport and budget preferences.`;

export async function POST(req: Request) {
  const { destination, day, blocks, preferences } = (await req.json()) as {
    destination: string;
    day: number;
    blocks: ScheduleBlock[];
    preferences: PreferenceAnswers;
  };

  if (!destination || !Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: "Missing destination or blocks" }, { status: 400 });
  }

  try {
    // Streaming sidesteps the SDK's long-request guard; the output format
    // still guarantees schema-valid JSON, re-validated with zod below.
    const stream = anthropic.messages.stream({
      model: PLANNER_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Destination: ${destination}
Day ${day} blocks, in the traveler's new order:
${JSON.stringify(blocks, null, 2)}

Traveler preference profile:
${describePreferences(preferences ?? {})}

Recompute start times, transit legs between consecutive blocks, and tonight's lodging.`,
        },
      ],
      output_config: { format: zodOutputFormat(LogisticsUpdateSchema) },
    });

    const message = await stream.finalMessage();
    const text = message.content.find((b) => b.type === "text")?.text;
    if (!text) {
      return NextResponse.json({ error: "Logistics engine returned nothing" }, { status: 502 });
    }
    const update = LogisticsUpdateSchema.parse(JSON.parse(text));
    return NextResponse.json(update);
  } catch (err) {
    console.error("logistics route failed:", err);
    const message = err instanceof Error ? err.message : "Logistics recompute failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
