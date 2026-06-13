import { describe, expect, it } from "vitest";
import { PREFERENCE_QUESTIONS, describePreferences } from "@/lib/preferences";

// Spec (original request): onboarding asks a series of A-vs-B scenario
// questions; the resulting profile feeds the planner prompt, augmented by
// learned micro-preferences.
describe("PREFERENCE_QUESTIONS", () => {
  it("are A-vs-B scenarios with unique, distinct option ids", () => {
    expect(PREFERENCE_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    const ids = PREFERENCE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length); // unique question ids
    for (const q of PREFERENCE_QUESTIONS) {
      expect(q.optionA.id).not.toBe(q.optionB.id);
      expect(q.optionA.label).toBeTruthy();
      expect(q.optionB.label).toBeTruthy();
    }
  });
});

describe("describePreferences", () => {
  it("falls back to a balanced traveler when no answers are given", () => {
    expect(describePreferences({})).toContain("No stated preferences");
  });

  it("renders the chosen option's label for each answered question", () => {
    const q = PREFERENCE_QUESTIONS[0];
    const profile = describePreferences({ [q.id]: q.optionB.id });
    expect(profile).toContain(q.optionB.label);
    expect(profile).not.toContain(q.optionA.label);
  });

  it("appends a learned-preferences section when present", () => {
    const profile = describePreferences({}, ["prefers later dinners", "avoids museums"]);
    expect(profile).toContain("Learned from how this traveler");
    expect(profile).toContain("- prefers later dinners");
    expect(profile).toContain("- avoids museums");
  });

  it("omits the learned section when there are none", () => {
    expect(describePreferences({})).not.toContain("Learned from how this traveler");
  });
});
