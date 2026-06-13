import { describe, expect, it } from "vitest";
import {
  PlanRefineResponseSchema,
  ScheduleBlockSchema,
  TripPlanSchema,
} from "@/lib/types";
import { block, plan, refine } from "@/test/fixtures";

// Spec (AGENTS.md "Claude API usage rules"): the zod schemas are the
// structured-output contract — they must accept valid output and reject
// malformed output (so a bad model response fails the client-side parse).
describe("ScheduleBlockSchema", () => {
  it("accepts a well-formed block", () => {
    expect(ScheduleBlockSchema.safeParse(block()).success).toBe(true);
  });

  it("requires the movable flag", () => {
    const { movable, ...withoutMovable } = block();
    void movable;
    expect(ScheduleBlockSchema.safeParse(withoutMovable).success).toBe(false);
  });

  it("accepts arrival and departure block types", () => {
    expect(ScheduleBlockSchema.safeParse(block({ type: "arrival" })).success).toBe(true);
    expect(ScheduleBlockSchema.safeParse(block({ type: "departure" })).success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    expect(
      ScheduleBlockSchema.safeParse(block({ type: "nightclub" as never })).success,
    ).toBe(false);
  });
});

describe("TripPlanSchema", () => {
  it("accepts a full valid plan", () => {
    expect(TripPlanSchema.safeParse(plan()).success).toBe(true);
  });

  it("allows a day with null lodging (final day)", () => {
    const p = plan();
    p.days[p.days.length - 1].lodging = null;
    expect(TripPlanSchema.safeParse(p).success).toBe(true);
  });
});

describe("PlanRefineResponseSchema", () => {
  it("accepts a refinement envelope with changedDays + learnedPreferences", () => {
    expect(PlanRefineResponseSchema.safeParse(refine()).success).toBe(true);
  });

  it("rejects a refinement missing changedDays", () => {
    const r = refine();
    delete (r as Partial<typeof r>).changedDays;
    expect(PlanRefineResponseSchema.safeParse(r).success).toBe(false);
  });
});
