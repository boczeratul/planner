import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAuthUserId } from "@/lib/requireUser";
import { anthropic, LOGISTICS_MODEL } from "@/lib/anthropic";
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
- Match the traveler's transport and budget preferences.
- If this day has no overnight stay (e.g. the trip's final day), set lodging to null — never a
  "checkout" placeholder.

Learning preferences:
- Compare the previous order with the new one. If the move clearly signals a durable taste
  (e.g. moved dinner to the end of the day -> prefers late dinners; moved the museum before
  the park -> prefers indoor sights in the morning), record it in learnedPreferences.
- A single drag is weak evidence: only record a preference when the intent is unambiguous,
  and never repeat anything already in the traveler's profile. An empty list is the normal
  case.`;

export async function POST(req: Request) {
  if (!(await getAuthUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { destination, day, blocks, previousBlockIds, preferences, learned } =
    (await req.json()) as {
      destination: string;
      day: number;
      blocks: ScheduleBlock[];
      previousBlockIds?: string[];
      preferences: PreferenceAnswers;
      learned?: string[];
    };

  if (!destination || !Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: "Missing destination or blocks" }, { status: 400 });
  }

  try {
    // Streaming sidesteps the SDK's long-request guard; the output format
    // still guarantees schema-valid JSON, re-validated with zod below.
    // Haiku 4.5: no thinking/effort params — fast mechanical recompute.
    const stream = anthropic.messages.stream({
      model: LOGISTICS_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Destination: ${destination}
Day ${day} blocks, in the traveler's new order:
${JSON.stringify(blocks, null, 2)}

Previous block order (before the traveler's drag): ${
            previousBlockIds ? previousBlockIds.join(" -> ") : "unknown"
          }

Traveler preference profile:
${describePreferences(preferences ?? {}, learned ?? [])}

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
