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

// Returned when the user reorders blocks and logistics must be recomputed
export const LogisticsUpdateSchema = z.object({
  blocks: z
    .array(z.object({ id: z.string(), startTime: z.string() }))
    .describe("Recomputed start times for the reordered blocks, same order as given"),
  legs: z.array(LogisticsLegSchema),
  lodging: LodgingSchema,
  notes: z.string().describe("Brief note on what changed or any warnings, e.g. tight transfers"),
});

export type ScheduleBlock = z.infer<typeof ScheduleBlockSchema>;
export type LogisticsLeg = z.infer<typeof LogisticsLegSchema>;
export type Lodging = z.infer<typeof LodgingSchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type TripPlan = z.infer<typeof TripPlanSchema>;
export type LogisticsUpdate = z.infer<typeof LogisticsUpdateSchema>;
