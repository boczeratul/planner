import { describe, expect, it } from "vitest";
import { dateForDay } from "@/lib/dates";

// Spec (AGENTS.md "Start date"): dateForDay renders day N's actual date,
// parsed in LOCAL time so it never shifts a day vs a UTC parse; returns null
// when the start date is missing/invalid.
describe("dateForDay", () => {
  it("returns null when no start date is known", () => {
    expect(dateForDay(undefined, 1)).toBeNull();
    expect(dateForDay("", 1)).toBeNull();
  });

  it("returns null for a non-ISO date string", () => {
    expect(dateForDay("July 3 2026", 1)).toBeNull();
    expect(dateForDay("2026-7-3", 1)).toBeNull();
  });

  it("renders day 1 as the start date itself", () => {
    const expected = new Date(2026, 6, 3).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    expect(dateForDay("2026-07-03", 1)).toBe(expected);
  });

  it("does not shift the day off-by-one (local, not UTC parse)", () => {
    // A UTC parse of 2026-07-03 formatted in a negative-offset TZ would show
    // the 2nd. The day-of-month must still be 3.
    expect(dateForDay("2026-07-03", 1)).toContain("3");
  });

  it("offsets by (day - 1) and rolls across month boundaries", () => {
    const expected = new Date(2026, 6, 3 + 29).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    // day 30 starting Jul 3 -> Aug 1 (mirror avoids locale-specific assertions)
    expect(dateForDay("2026-07-03", 30)).toBe(expected);
  });
});
