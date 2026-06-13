// Schema-accurate builders for tests. Defaults are valid; pass overrides to vary.
import type {
  DayPlan,
  Lodging,
  LogisticsLeg,
  LogisticsUpdate,
  PlanRefineResponse,
  ScheduleBlock,
  TripPlan,
} from "@/lib/types";

export function block(over: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: "d1-b1",
    type: "attraction",
    title: "Some Sight",
    description: "Worth a look.",
    location: "Downtown",
    startTime: "09:00",
    durationMinutes: 90,
    movable: true,
    ...over,
  };
}

export function leg(over: Partial<LogisticsLeg> = {}): LogisticsLeg {
  return {
    fromBlockId: "d1-b1",
    toBlockId: "d1-b2",
    mode: "walk",
    summary: "Walk 10 min",
    durationMinutes: 10,
    ...over,
  };
}

export function lodging(over: Partial<Lodging> = {}): Lodging {
  return { name: "Hotel One", area: "Center", reason: "Central and clean.", ...over };
}

export function day(over: Partial<DayPlan> = {}): DayPlan {
  return {
    day: 1,
    theme: "Arrival & old town",
    blocks: [block({ id: "d1-b1" }), block({ id: "d1-b2", startTime: "12:00", type: "lunch" })],
    legs: [leg()],
    lodging: lodging(),
    ...over,
  };
}

export function plan(over: Partial<TripPlan> = {}): TripPlan {
  return {
    destination: "Tokyo",
    durationDays: 2,
    startDate: "2026-07-03",
    summary: "A short trip.",
    days: [
      day({ day: 1 }),
      day({
        day: 2,
        blocks: [block({ id: "d2-b1" }), block({ id: "d2-b2", type: "dinner", startTime: "19:00" })],
        legs: [leg({ fromBlockId: "d2-b1", toBlockId: "d2-b2" })],
        lodging: lodging({ name: "Hotel Two" }),
      }),
    ],
    ...over,
  };
}

export function refine(over: Partial<PlanRefineResponse> = {}): PlanRefineResponse {
  return {
    reply: "Done.",
    destination: "Tokyo",
    durationDays: 2,
    startDate: "2026-07-03",
    summary: "A short trip.",
    changedDays: [],
    learnedPreferences: [],
    ...over,
  };
}

export function logisticsUpdate(over: Partial<LogisticsUpdate> = {}): LogisticsUpdate {
  return {
    blocks: [],
    legs: [],
    lodging: lodging(),
    notes: "",
    learnedPreferences: [],
    ...over,
  };
}
