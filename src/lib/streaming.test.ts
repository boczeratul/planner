import { describe, expect, it } from "vitest";
import {
  mergeRefinedPlan,
  overlayPartialDays,
  parsePartialPlanResponse,
  parsePartialRefineResponse,
  planToPartial,
  repairAndParse,
} from "@/lib/streaming";
import { block, day, leg, lodging, plan, refine } from "@/test/fixtures";

// Spec (AGENTS.md "Streaming render" + streaming.ts): progressive parsing of
// truncated JSON, and the refinement merge contract.
describe("repairAndParse", () => {
  it("returns null when there is no JSON object", () => {
    expect(repairAndParse("")).toBeNull();
    expect(repairAndParse("not json")).toBeNull();
  });

  it("closes an open string", () => {
    expect(repairAndParse('{"reply":"hel')).toEqual({ reply: "hel" });
  });

  it("closes open arrays and objects", () => {
    expect(repairAndParse('{"a":[1,2')).toEqual({ a: [1, 2] });
    expect(repairAndParse('{"a":{"b":1')).toEqual({ a: { b: 1 } });
  });

  it("drops a dangling comma", () => {
    expect(repairAndParse('{"a":1,')).toEqual({ a: 1 });
  });

  it("fills a dangling key with null", () => {
    expect(repairAndParse('{"a":')).toEqual({ a: null });
  });

  it("parses an already-complete document", () => {
    expect(repairAndParse('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
  });
});

describe("parsePartialPlanResponse", () => {
  it("extracts the reply and only the blocks that already validate", () => {
    const valid = block({ id: "d1-b1" });
    const partial =
      `{"reply":"Planning","plan":{"destination":"Tokyo","days":[` +
      `{"day":1,"blocks":[${JSON.stringify(valid)},{"id":"d1-b2","title":"hal`;
    const res = parsePartialPlanResponse(partial);
    expect(res?.reply).toBe("Planning");
    expect(res?.plan?.destination).toBe("Tokyo");
    // the half-written second block is dropped until it validates
    expect(res?.plan?.days[0].blocks).toHaveLength(1);
    expect(res?.plan?.days[0].blocks[0].id).toBe("d1-b1");
  });

  it("returns null when nothing is parseable yet", () => {
    expect(parsePartialPlanResponse("")).toBeNull();
  });
});

describe("parsePartialRefineResponse", () => {
  it("exposes changedDays as they stream in", () => {
    const d = day({ day: 2 });
    const text = `{"reply":"ok","changedDays":[${JSON.stringify(d)}]}`;
    const res = parsePartialRefineResponse(text);
    expect(res?.changedDays).toHaveLength(1);
    expect(res?.changedDays[0].day).toBe(2);
  });
});

describe("planToPartial", () => {
  it("carries startDate through", () => {
    const p = plan({ startDate: "2026-07-03" });
    expect(planToPartial(p).startDate).toBe("2026-07-03");
  });
});

describe("overlayPartialDays", () => {
  it("replaces a changed day and keeps the others in order", () => {
    const p = plan({ durationDays: 2 });
    const replacement = day({ day: 1, theme: "REVISED" });
    const merged = overlayPartialDays(p, [replacement]);
    expect(merged.days.map((d) => d.day)).toEqual([1, 2]);
    expect(merged.days[0].theme).toBe("REVISED");
    expect(merged.days[1].theme).toBe(p.days[1].theme); // untouched
  });

  it("appends a brand-new day (trip extension preview)", () => {
    const p = plan({ durationDays: 2 });
    const newDay = day({ day: 3, theme: "EXTRA" });
    const merged = overlayPartialDays(p, [newDay]);
    expect(merged.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });
});

// Spec (AGENTS.md "Refinement contract"): only changed days come back; merge
// must preserve untouched days' block ids, handle extensions/shortenings, and
// never blank an existing start date.
describe("mergeRefinedPlan", () => {
  it("replaces the changed day and preserves untouched days' block ids", () => {
    const p = plan({ durationDays: 2 });
    const day2Ids = p.days[1].blocks.map((b) => b.id);
    const newDay1 = day({
      day: 1,
      blocks: [block({ id: "d1-new", title: "Replaced" })],
      legs: [],
    });
    const merged = mergeRefinedPlan(p, refine({ changedDays: [newDay1] }));
    expect(merged.days[0].blocks.map((b) => b.id)).toEqual(["d1-new"]);
    expect(merged.days[1].blocks.map((b) => b.id)).toEqual(day2Ids); // untouched
  });

  it("appends new days when the trip is extended", () => {
    const p = plan({ durationDays: 2 });
    const merged = mergeRefinedPlan(
      p,
      refine({ durationDays: 3, changedDays: [day({ day: 3, theme: "New day" })] }),
    );
    expect(merged.durationDays).toBe(3);
    expect(merged.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  it("drops days beyond durationDays when the trip is shortened", () => {
    const p = plan({ durationDays: 3, days: [day({ day: 1 }), day({ day: 2 }), day({ day: 3 })] });
    const merged = mergeRefinedPlan(p, refine({ durationDays: 2, changedDays: [] }));
    expect(merged.days.map((d) => d.day)).toEqual([1, 2]);
  });

  it("never blanks an existing start date when the refine omits it", () => {
    const p = plan({ startDate: "2026-07-03" });
    const merged = mergeRefinedPlan(p, refine({ startDate: "" }));
    expect(merged.startDate).toBe("2026-07-03");
  });

  it("updates the start date when the refine provides a new one", () => {
    const p = plan({ startDate: "2026-07-03" });
    const merged = mergeRefinedPlan(p, refine({ startDate: "2026-08-01" }));
    expect(merged.startDate).toBe("2026-08-01");
  });
});
