import { beforeEach, describe, expect, it } from "vitest";
import { tripLabel, useTrip } from "@/store/trip";
import { block, day, lodging, logisticsUpdate, plan } from "@/test/fixtures";

const reset = () =>
  useTrip.setState({
    plan: null,
    messages: [],
    planError: null,
    planning: false,
    streaming: false,
    streamingPlan: null,
    recomputingDays: [],
    chatDraft: null,
  });

describe("trip store", () => {
  beforeEach(reset);

  // Spec (AGENTS.md "Reorders are optimistic"): reorderDay changes only the
  // target day's block order, by id, leaving other days untouched.
  it("reorderDay reorders blocks within one day only", () => {
    const s = useTrip.getState();
    s.setPlan(plan({ durationDays: 2 }));
    const day2Before = useTrip.getState().plan!.days[1].blocks.map((b) => b.id);

    s.reorderDay(1, ["d1-b2", "d1-b1"]);

    const after = useTrip.getState().plan!;
    expect(after.days[0].blocks.map((b) => b.id)).toEqual(["d1-b2", "d1-b1"]);
    expect(after.days[1].blocks.map((b) => b.id)).toEqual(day2Before); // other day intact
  });

  // Spec: applyLogistics lands recomputed start times (by id) + new legs/lodging.
  it("applyLogistics updates start times by id and replaces legs/lodging", () => {
    const s = useTrip.getState();
    s.setPlan(plan({ durationDays: 1, days: [day({ day: 1 })] }));

    s.applyLogistics(1, logisticsUpdate({
      blocks: [{ id: "d1-b1", startTime: "10:30" }],
      legs: [],
      lodging: lodging({ name: "Moved Hotel" }),
    }));

    const d = useTrip.getState().plan!.days[0];
    expect(d.blocks.find((b) => b.id === "d1-b1")!.startTime).toBe("10:30");
    expect(d.blocks.find((b) => b.id === "d1-b2")!.startTime).toBe("12:00"); // unchanged
    expect(d.legs).toEqual([]);
    expect(d.lodging!.name).toBe("Moved Hotel");
  });

  // Spec (request): merge lodging entries that refer to the same hotel.
  it("mergeLodgings renames matching lodging and ignores the rest", () => {
    const s = useTrip.getState();
    s.setPlan(
      plan({
        durationDays: 2,
        days: [
          day({ day: 1, lodging: lodging({ name: "Gracery Shinjuku" }) }),
          day({ day: 2, lodging: lodging({ name: "Hotel Gracery Shinjuku Tokyo" }) }),
        ],
      }),
    );

    s.mergeLodgings({
      "Hotel Gracery Shinjuku Tokyo": { name: "Gracery Shinjuku", area: "Shinjuku" },
    });

    const days = useTrip.getState().plan!.days;
    expect(days[0].lodging!.name).toBe("Gracery Shinjuku"); // untouched
    expect(days[1].lodging!.name).toBe("Gracery Shinjuku"); // merged
    expect(days[1].lodging!.area).toBe("Shinjuku");
  });

  it("mergeLodgings leaves null lodging alone", () => {
    const s = useTrip.getState();
    s.setPlan(
      plan({ durationDays: 1, days: [day({ day: 1, lodging: null })] }),
    );
    s.mergeLodgings({ Whatever: { name: "X", area: "Y" } });
    expect(useTrip.getState().plan!.days[0].lodging).toBeNull();
  });

  // Spec (AGENTS.md "Start date"): setStartDate sets day 1's date in place.
  it("setStartDate updates the plan's start date", () => {
    const s = useTrip.getState();
    s.setPlan(plan({ startDate: "" }));
    s.setStartDate("2026-09-01");
    expect(useTrip.getState().plan!.startDate).toBe("2026-09-01");
  });

  // Spec: recompute flags track which days are mid-recompute.
  it("start/finishRecompute toggle the recomputing day set", () => {
    const s = useTrip.getState();
    s.startRecompute(2);
    expect(useTrip.getState().recomputingDays).toContain(2);
    s.finishRecompute(2);
    expect(useTrip.getState().recomputingDays).not.toContain(2);
  });

  // Spec (AGENTS.md "reset() clears plan + chat together").
  it("reset clears the plan and the conversation", () => {
    const s = useTrip.getState();
    s.setPlan(plan());
    s.addMessage({ role: "user", text: "hi" });
    s.reset();
    const st = useTrip.getState();
    expect(st.plan).toBeNull();
    expect(st.messages).toEqual([]);
  });
});

// Spec (request): users keep multiple trips in localStorage and switch between
// them; the active trip's plan/messages mirror is what every component reads.
describe("multi-trip", () => {
  beforeEach(() => useTrip.setState({ trips: [], activeTripId: null, plan: null, messages: [] }));

  it("createTrip adds an empty trip and makes it active", () => {
    useTrip.getState().createTrip();
    const a = useTrip.getState();
    expect(a.trips).toHaveLength(1);
    expect(a.activeTripId).toBe(a.trips[0].id);
    expect(a.plan).toBeNull();

    useTrip.getState().createTrip();
    const b = useTrip.getState();
    expect(b.trips).toHaveLength(2);
    expect(b.activeTripId).toBe(b.trips[1].id); // newest is active
  });

  it("switchTrip preserves each trip's plan independently", () => {
    const s = useTrip.getState();
    s.createTrip();
    s.setPlan(plan({ destination: "Kyoto" }));
    const kyotoId = useTrip.getState().activeTripId!;

    s.createTrip();
    s.setPlan(plan({ destination: "Lisbon" }));
    const lisbonId = useTrip.getState().activeTripId!;

    s.switchTrip(kyotoId);
    expect(useTrip.getState().plan!.destination).toBe("Kyoto");

    s.switchTrip(lisbonId);
    expect(useTrip.getState().plan!.destination).toBe("Lisbon");
  });

  it("deleteTrip falls back to another trip and never reaches zero", () => {
    const s = useTrip.getState();
    s.createTrip();
    const first = useTrip.getState().activeTripId!;
    s.createTrip();
    const second = useTrip.getState().activeTripId!;

    s.deleteTrip(second); // delete the active one
    const a = useTrip.getState();
    expect(a.trips.map((t) => t.id)).toEqual([first]);
    expect(a.activeTripId).toBe(first);

    s.deleteTrip(first); // deleting the last trip seeds a fresh one
    const b = useTrip.getState();
    expect(b.trips).toHaveLength(1);
    expect(b.activeTripId).toBe(b.trips[0].id);
    expect(b.plan).toBeNull();
  });

  it("tripLabel prefers the title, then the destination, then a default", () => {
    expect(tripLabel({ title: "Honeymoon", plan: plan({ destination: "Bali" }) })).toBe("Honeymoon");
    expect(tripLabel({ title: "  ", plan: plan({ destination: "Bali" }) })).toBe("Bali");
    expect(tripLabel({ title: "", plan: null })).toBe("New trip");
  });
});
