import { describe, expect, it } from "vitest";
import { isLocked } from "@/lib/blocks";
import { block } from "@/test/fixtures";

// Spec (request): arrival/departure must not be draggable, and anchored
// blocks like "breakfast near the hotel" (movable === false) must not either.
describe("isLocked", () => {
  it("locks arrival and departure blocks regardless of movable", () => {
    expect(isLocked(block({ type: "arrival", movable: true }))).toBe(true);
    expect(isLocked(block({ type: "departure", movable: true }))).toBe(true);
  });

  it("locks blocks the planner anchored (movable === false)", () => {
    expect(isLocked(block({ type: "breakfast", movable: false }))).toBe(true);
  });

  it("leaves ordinary movable blocks draggable", () => {
    expect(isLocked(block({ type: "attraction", movable: true }))).toBe(false);
    expect(isLocked(block({ type: "lunch", movable: true }))).toBe(false);
  });
});
