import {
  LodgingSchema,
  LogisticsLegSchema,
  ScheduleBlockSchema,
  type Lodging,
  type LogisticsLeg,
  type PartialDayPlan,
  type PartialTripPlan,
  type PlanRefineResponse,
  type ScheduleBlock,
  type TripPlan,
} from "./types";

/**
 * Best-effort parse of an incomplete JSON document: close any open string,
 * strip dangling separators, append missing closers, then JSON.parse.
 * Returns null when the fragment isn't parseable yet — callers just try
 * again on the next chunk.
 */
export function repairAndParse(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let s = text.slice(start);

  let inString = false;
  let escape = false;
  const closers: string[] = [];
  for (const ch of s) {
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
  }

  if (escape) s = s.slice(0, -1); // drop a trailing lone backslash
  if (inString) s += '"';
  s = s.replace(/,\s*$/, "").replace(/:\s*$/, ": null");
  s += closers.reverse().join("");

  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Keep only the blocks/legs/lodging of each day that fully validate already. */
function sanitizeDays(raw: unknown): PartialDayPlan[] {
  if (!Array.isArray(raw)) return [];
  const days: PartialDayPlan[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const dd = d as Record<string, unknown>;
    if (typeof dd.day !== "number") continue;
    const blocks = (Array.isArray(dd.blocks) ? dd.blocks : []).filter(
      (b): b is ScheduleBlock => ScheduleBlockSchema.safeParse(b).success,
    );
    const legs = (Array.isArray(dd.legs) ? dd.legs : []).filter(
      (l): l is LogisticsLeg => LogisticsLegSchema.safeParse(l).success,
    );
    const lodging = LodgingSchema.safeParse(dd.lodging).success
      ? (dd.lodging as Lodging)
      : undefined;
    days.push({
      day: dd.day,
      theme: typeof dd.theme === "string" ? dd.theme : undefined,
      blocks,
      legs,
      lodging,
    });
  }
  return days;
}

export interface PartialPlanResponse {
  reply?: string;
  plan: PartialTripPlan | null;
}

/** Progressive view of a streaming INITIAL plan response. */
export function parsePartialPlanResponse(text: string): PartialPlanResponse | null {
  const raw = repairAndParse(text);
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const result: PartialPlanResponse = {
    reply: typeof obj.reply === "string" ? obj.reply : undefined,
    plan: null,
  };

  const planRaw = obj.plan;
  if (planRaw && typeof planRaw === "object") {
    const p = planRaw as Record<string, unknown>;
    result.plan = {
      destination: typeof p.destination === "string" ? p.destination : undefined,
      durationDays: typeof p.durationDays === "number" ? p.durationDays : undefined,
      startDate: typeof p.startDate === "string" ? p.startDate : undefined,
      summary: typeof p.summary === "string" ? p.summary : undefined,
      days: sanitizeDays(p.days),
    };
  }

  return result;
}

export interface PartialRefineResponse {
  reply?: string;
  changedDays: PartialDayPlan[];
}

/** Progressive view of a streaming REFINEMENT response. */
export function parsePartialRefineResponse(text: string): PartialRefineResponse | null {
  const raw = repairAndParse(text);
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    reply: typeof obj.reply === "string" ? obj.reply : undefined,
    changedDays: sanitizeDays(obj.changedDays),
  };
}

/** The current plan, viewed as the lenient streaming shape. */
export function planToPartial(plan: TripPlan): PartialTripPlan {
  return {
    destination: plan.destination,
    durationDays: plan.durationDays,
    startDate: plan.startDate,
    summary: plan.summary,
    days: plan.days,
  };
}

/**
 * Streaming view during a refinement: the existing plan with the days being
 * rewritten substituted by their (possibly half-streamed) replacements.
 */
export function overlayPartialDays(
  plan: TripPlan,
  changedDays: PartialDayPlan[],
): PartialTripPlan {
  const byDay = new Map(changedDays.map((d) => [d.day, d]));
  const days: PartialDayPlan[] = plan.days.map((d) => byDay.get(d.day) ?? d);
  for (const d of changedDays) {
    if (!plan.days.some((pd) => pd.day === d.day)) days.push(d);
  }
  days.sort((a, b) => a.day - b.day);
  return { ...planToPartial(plan), days };
}

/** Merge a validated refinement into the existing plan. */
export function mergeRefinedPlan(plan: TripPlan, refine: PlanRefineResponse): TripPlan {
  const byDay = new Map(refine.changedDays.map((d) => [d.day, d]));
  const days = plan.days.map((d) => byDay.get(d.day) ?? d);
  for (const d of refine.changedDays) {
    if (!plan.days.some((pd) => pd.day === d.day)) days.push(d);
  }
  return {
    destination: refine.destination,
    durationDays: refine.durationDays,
    // Old persisted plans may predate startDate — never let a refinement blank it
    startDate: refine.startDate || plan.startDate || "",
    summary: refine.summary,
    days: days.filter((d) => d.day <= refine.durationDays).sort((a, b) => a.day - b.day),
  };
}
