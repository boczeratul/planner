import { describe, expect, it } from "vitest";
import {
  attractionIdsInPlan,
  dedupeNewAttractions,
  groupByVote,
  mergeVotes,
  voteOf,
} from "@/lib/attractions";
import { attraction, block, day, plan } from "@/test/fixtures";

// Spec (request): tri-state voting — neutral (default, planner's choice),
// up (must include), down (must skip). The Attractions tab derives inclusion
// from the current plan.
describe("voteOf", () => {
  it("treats a missing entry as neutral", () => {
    expect(voteOf({}, "a1")).toBe("neutral");
    expect(voteOf({ a1: "up" }, "a1")).toBe("up");
    expect(voteOf({ a1: "down" }, "a1")).toBe("down");
  });
});

describe("mergeVotes", () => {
  it("keeps up/down votes for surviving items, drops removed items", () => {
    const merged = mergeVotes(
      { a1: "up", a2: "down", gone: "up" },
      [attraction({ id: "a1" }), attraction({ id: "a2" }), attraction({ id: "a3" })],
    );
    expect(merged).toEqual({ a1: "up", a2: "down" }); // a3 defaults to neutral (absent)
  });

  it("yields an empty record (all neutral) for a first proposal", () => {
    expect(mergeVotes({}, [attraction({ id: "a1" }), attraction({ id: "a2" })])).toEqual({});
  });
});

describe("groupByVote", () => {
  it("partitions into must-include / must-skip / flexible (missing = flexible)", () => {
    const list = [attraction({ id: "a1" }), attraction({ id: "a2" }), attraction({ id: "a3" })];
    const { mustInclude, mustSkip, flexible } = groupByVote(list, { a1: "up", a2: "down" });
    expect(mustInclude.map((a) => a.id)).toEqual(["a1"]);
    expect(mustSkip.map((a) => a.id)).toEqual(["a2"]);
    expect(flexible.map((a) => a.id)).toEqual(["a3"]);
  });

  it("puts everything in flexible when nobody voted", () => {
    const list = [attraction({ id: "a1" }), attraction({ id: "a2" })];
    const groups = groupByVote(list, {});
    expect(groups.mustInclude).toEqual([]);
    expect(groups.mustSkip).toEqual([]);
    expect(groups.flexible).toHaveLength(2);
  });
});

// Spec (request): infinite scrolling appends only genuinely new suggestions.
describe("dedupeNewAttractions", () => {
  const nextId = () => "fresh-id";

  it("drops incoming items whose name already exists (case-insensitive)", () => {
    const existing = [attraction({ id: "a1", name: "Fushimi Inari Shrine" })];
    const incoming = [
      attraction({ id: "a9", name: "FUSHIMI INARI SHRINE" }), // duplicate name
      attraction({ id: "a10", name: "Kinkaku-ji" }),
    ];
    const fresh = dedupeNewAttractions(existing, incoming, nextId);
    expect(fresh.map((a) => a.name)).toEqual(["Kinkaku-ji"]);
  });

  it("remaps an incoming id that collides with the existing list", () => {
    const existing = [attraction({ id: "a1", name: "Fushimi Inari Shrine" })];
    const incoming = [attraction({ id: "a1", name: "Kinkaku-ji" })]; // id collision
    const fresh = dedupeNewAttractions(existing, incoming, nextId);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe("fresh-id");
    expect(fresh[0].name).toBe("Kinkaku-ji");
  });

  it("dedupes within the incoming batch itself", () => {
    const incoming = [
      attraction({ id: "a1", name: "Kinkaku-ji" }),
      attraction({ id: "a2", name: "kinkaku-ji " }),
    ];
    expect(dedupeNewAttractions([], incoming, nextId)).toHaveLength(1);
  });

  it("returns empty when nothing is new (the exhausted signal)", () => {
    const existing = [attraction({ id: "a1", name: "Kinkaku-ji" })];
    const incoming = [attraction({ id: "a2", name: "Kinkaku-ji" })];
    expect(dedupeNewAttractions(existing, incoming, nextId)).toEqual([]);
  });
});

describe("attractionIdsInPlan", () => {
  const p = plan({
    days: [
      day({
        day: 1,
        blocks: [
          block({ id: "d1-b1", type: "attraction", title: "Fushimi Inari Shrine hike" }),
          block({ id: "d1-b2", type: "lunch", title: "Lunch crawl at Nishiki Market" }),
          block({ id: "d1-b3", type: "activity", title: "Tea ceremony" }),
          block({
            id: "d1-b4",
            type: "attraction",
            title: "Walk through the Arashiyama Bamboo Forest",
          }),
          block({ id: "d1-b5", type: "arrival", title: "Arrive at Kansai Airport" }),
        ],
        legs: [],
      }),
    ],
  });

  it("matches attraction names contained in block titles (and vice versa)", () => {
    const list = [
      attraction({ id: "a1", name: "Fushimi Inari Shrine" }), // contained in title
      attraction({ id: "a2", name: "A very long tea ceremony experience" }), // contains title
    ];
    const ids = attractionIdsInPlan(list, p);
    expect(ids.has("a1")).toBe(true);
    expect(ids.has("a2")).toBe(true);
  });

  it("matches on word overlap when neither string contains the other", () => {
    // "Grove" vs "Forest" — shares {arashiyama, bamboo}
    const list = [attraction({ id: "a1", name: "Arashiyama Bamboo Grove" })];
    expect(attractionIdsInPlan(list, p).has("a1")).toBe(true);
  });

  it("matches food suggestions planned as meal blocks", () => {
    const list = [attraction({ id: "a1", name: "Nishiki Market" })];
    expect(attractionIdsInPlan(list, p).has("a1")).toBe(true);
  });

  it("does not match on a single shared non-identifying token", () => {
    // shares only {fushimi} with "Fushimi Inari Shrine hike"
    const list = [attraction({ id: "a1", name: "Fushimi Sake District" })];
    expect(attractionIdsInPlan(list, p).has("a1")).toBe(false);
  });

  it("ignores arrival/departure blocks", () => {
    const list = [attraction({ id: "a1", name: "Kansai Airport" })];
    expect(attractionIdsInPlan(list, p).has("a1")).toBe(false);
  });

  it("excludes attractions absent from the plan", () => {
    const list = [attraction({ id: "a1", name: "Kinkaku-ji Golden Pavilion" })];
    expect(attractionIdsInPlan(list, p).has("a1")).toBe(false);
  });
});
