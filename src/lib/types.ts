import { z } from "zod";

// ---------- Preferences (onboarding) ----------

export interface PreferenceQuestion {
  id: string;
  prompt: string;
  optionA: { id: string; label: string; description: string };
  optionB: { id: string; label: string; description: string };
}

/** questionId -> chosen option id */
export type PreferenceAnswers = Record<string, string>;

/** A preference inferred from how the user adjusted a plan (chat or drag). */
export interface MicroPreference {
  id: string;
  /** Short generalizable statement, e.g. "prefers dinners after 20:00" */
  text: string;
  source: "chat" | "drag";
  learnedAt: number;
}

// ---------- Itinerary ----------

export const ScheduleBlockSchema = z.object({
  id: z.string().describe("Stable unique id, e.g. 'd1-b2'"),
  type: z.enum(["breakfast", "lunch", "dinner", "attraction", "activity", "rest"]),
  title: z.string(),
  description: z.string().describe("1-2 sentences on why this fits the traveler"),
  location: z.string().describe("Neighborhood or address-level location"),
  startTime: z.string().describe("24h local time, e.g. '09:30'"),
  durationMinutes: z.number().int(),
});

export const LogisticsLegSchema = z.object({
  fromBlockId: z.string(),
  toBlockId: z.string(),
  mode: z.enum(["walk", "bus", "train", "subway", "tram", "taxi", "ferry", "flight"]),
  summary: z
    .string()
    .describe("Concrete instructions, e.g. 'JR Yamanote Line from Shibuya to Ueno, ~35 min'"),
  durationMinutes: z.number().int(),
});

export const LodgingSchema = z.object({
  name: z.string().describe("Hotel name or area recommendation"),
  area: z.string(),
  reason: z.string(),
});

export const DayPlanSchema = z.object({
  day: z.number().int().describe("1-based day index"),
  theme: z.string().describe("Short theme for the day, e.g. 'Old town & street food'"),
  blocks: z.array(ScheduleBlockSchema),
  legs: z.array(LogisticsLegSchema).describe("Transit between consecutive blocks"),
  lodging: LodgingSchema.describe("Where to stay this night"),
});

export const TripPlanSchema = z.object({
  destination: z.string(),
  durationDays: z.number().int(),
  summary: z.string().describe("2-3 sentence overview of the trip"),
  days: z.array(DayPlanSchema),
});

const LearnedPreferencesSchema = z
  .array(z.string())
  .describe(
    "Durable, generalizable travel preferences this adjustment reveals about the traveler, " +
      "each a short statement like 'prefers dinners after 20:00' or 'avoids museums'. " +
      "Empty if the request is one-off/situational (weather, a specific booking) or already " +
      "covered by the stated profile. Be conservative: most adjustments reveal nothing durable.",
  );

// Envelope returned by /api/plan for INITIAL generation: reply + the full plan
export const PlanResponseSchema = z.object({
  reply: z
    .string()
    .describe(
      "Short conversational reply to the traveler (1-3 sentences): what was planned, or what changed and why",
    ),
  plan: TripPlanSchema,
  learnedPreferences: LearnedPreferencesSchema,
});

// Envelope returned by /api/plan for REFINEMENTS: only the days that changed,
// as complete day objects — emitting the untouched days again would waste
// output tokens, which dominate response time.
export const PlanRefineResponseSchema = z.object({
  reply: z
    .string()
    .describe("Short conversational reply (1-3 sentences): what changed and why"),
  destination: z.string().describe("Unchanged unless the traveler moved the trip"),
  durationDays: z.number().int(),
  summary: z.string().describe("Trip overview; update only if the trip materially changed"),
  changedDays: z
    .array(DayPlanSchema)
    .describe(
      "ONLY the days affected by this request, as complete day objects (blocks, legs, lodging). " +
        "Days not listed are kept exactly as they were.",
    ),
  learnedPreferences: LearnedPreferencesSchema,
});

// Chat message shown in the left panel ("note" = a 📌 learned-preference line)
export interface ChatMessage {
  role: "user" | "assistant" | "note";
  text: string;
}

// Returned when the user reorders blocks and logistics must be recomputed
export const LogisticsUpdateSchema = z.object({
  blocks: z
    .array(z.object({ id: z.string(), startTime: z.string() }))
    .describe("Recomputed start times for the reordered blocks, same order as given"),
  legs: z.array(LogisticsLegSchema),
  lodging: LodgingSchema,
  notes: z.string().describe("Brief note on what changed or any warnings, e.g. tight transfers"),
  learnedPreferences: LearnedPreferencesSchema,
});

export type ScheduleBlock = z.infer<typeof ScheduleBlockSchema>;
export type LogisticsLeg = z.infer<typeof LogisticsLegSchema>;
export type Lodging = z.infer<typeof LodgingSchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type TripPlan = z.infer<typeof TripPlanSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type PlanRefineResponse = z.infer<typeof PlanRefineResponseSchema>;

// Lenient shapes used while /api/plan is still streaming: only fully-formed
// blocks/legs are included; later fields of a day may not have arrived yet.
export interface PartialDayPlan {
  day: number;
  theme?: string;
  blocks: ScheduleBlock[];
  legs: LogisticsLeg[];
  lodging?: Lodging;
}

export interface PartialTripPlan {
  destination?: string;
  durationDays?: number;
  summary?: string;
  days: PartialDayPlan[];
}
export type LogisticsUpdate = z.infer<typeof LogisticsUpdateSchema>;
