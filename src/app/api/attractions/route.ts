import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAuthUserId } from "@/lib/requireUser";
import { anthropic, PLANNER_MODEL } from "@/lib/anthropic";
import { describePreferences } from "@/lib/preferences";
import {
  AttractionProposalSchema,
  type Attraction,
  type ChatMessage,
  type PreferenceAnswers,
} from "@/lib/types";

export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an expert travel curator. Before an itinerary is planned, you
propose a list of recommended attractions, activities and experiences for the trip. The
traveler will tick the items they like and untick the ones they don't; the itinerary is built
afterwards from their picks.

Rules:
- Propose 12-18 items: a diverse mix of major sights, local experiences, food experiences
  (markets, food streets — not individual meals), nature/outdoors, and, when the trip is long
  enough, day trips — weighted toward the traveler's profile.
- Do NOT include hotels, airport transfers, or plain restaurant meals — only things worth
  choosing between.
- description: 1-2 sentences on what it is and why it fits this traveler.
- location: neighborhood or area name. category: one short lowercase tag (e.g. "temple",
  "food", "market", "nature", "museum", "day trip").
- ids "a1", "a2", ... unique across the list.
- When refining an existing list: keep the ids and content of items you retain, drop what the
  traveler doesn't want, and give newly added items fresh ids not used before.
- When asked for MORE suggestions on top of an existing list: return ONLY 8-12 new items —
  none may repeat or near-duplicate anything on the current list — with fresh ids continuing
  past the existing ones, and keep reply to one short sentence.
- reply: 1-2 conversational sentences asking the traveler to tick what interests them (or
  summarizing what changed, when refining).`;

export async function POST(req: Request) {
  if (!(await getAuthUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { request, preferences, learned, currentAttractions, history, more } =
    (await req.json()) as {
      request: string;
      preferences: PreferenceAnswers;
      learned?: string[];
      currentAttractions?: Attraction[];
      history?: ChatMessage[];
      /** infinite scroll: append-only mode — return ONLY new items */
      more?: boolean;
    };

  if (!request?.trim()) {
    return NextResponse.json({ error: "Missing trip request" }, { status: 400 });
  }

  const sections = [
    `Traveler preference profile (from an A/B onboarding quiz):
${describePreferences(preferences ?? {}, learned ?? [])}`,
  ];
  if (currentAttractions && currentAttractions.length > 0) {
    sections.push(`Current suggestion list (JSON):
${JSON.stringify(currentAttractions)}`);
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
    more && currentAttractions && currentAttractions.length > 0
      ? `The traveler scrolled for MORE suggestions.

Return ONLY 8-12 additional items that are not on the current list (no repeats, no
near-duplicates), with fresh ids.`
      : currentAttractions && currentAttractions.length > 0
        ? `The traveler's request: ${request}

Refine the suggestion list accordingly.`
        : `Trip request: ${request}

Propose the suggestion list for this trip.`,
  );

  try {
    // Small response — stream server-side (SDK long-request guard) but return
    // the complete JSON to the client in one go.
    const stream = anthropic.messages.stream({
      model: PLANNER_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
      output_config: { format: zodOutputFormat(AttractionProposalSchema) },
    });
    const message = await stream.finalMessage();
    const text = message.content.find((b) => b.type === "text")?.text;
    if (!text) {
      return NextResponse.json({ error: "Curator returned nothing" }, { status: 502 });
    }
    const proposal = AttractionProposalSchema.parse(JSON.parse(text));
    return NextResponse.json(proposal);
  } catch (err) {
    console.error("attractions route failed:", err);
    const message = err instanceof Error ? err.message : "Suggestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
