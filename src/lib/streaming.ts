import {
  LodgingSchema,
  LogisticsLegSchema,
  ScheduleBlockSchema,
  type Lodging,
  type LogisticsLeg,
  type PartialDayPlan,
  type PartialTripPlan,
  type ScheduleBlock,
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

export interface PartialPlanResponse {
  reply?: string;
  plan: PartialTripPlan | null;
}

/**
 * Extract whatever is already complete from a streaming /api/plan response:
 * the (possibly truncated) reply text, and only the blocks/legs/lodging that
 * fully validate against their schemas.
 */
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
    const days: PartialDayPlan[] = [];
    if (Array.isArray(p.days)) {
      for (const d of p.days) {
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
    }
    result.plan = {
      destination: typeof p.destination === "string" ? p.destination : undefined,
      durationDays: typeof p.durationDays === "number" ? p.durationDays : undefined,
      summary: typeof p.summary === "string" ? p.summary : undefined,
      days,
    };
  }

  return result;
}
