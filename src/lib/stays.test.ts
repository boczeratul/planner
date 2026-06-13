import { describe, expect, it } from "vitest";
import { NOT_A_HOTEL, collectStays, googleMapsUrl, nightsLabel } from "@/lib/stays";
import { day, lodging, plan } from "@/test/fixtures";

// Spec (AGENTS.md "Lodging is nullable" + hotel-column requests): consecutive
// nights at the same hotel collapse into one stay; null lodging and legacy
// "checkout" placeholders are never shown as hotels.
describe("collectStays", () => {
  it("collapses consecutive nights at the same hotel into one stay", () => {
    const p = plan({
      durationDays: 3,
      days: [
        day({ day: 1, lodging: lodging({ name: "Hotel A" }) }),
        day({ day: 2, lodging: lodging({ name: "Hotel A" }) }),
        day({ day: 3, lodging: lodging({ name: "Hotel A" }) }),
      ],
    });
    const stays = collectStays(p);
    expect(stays).toHaveLength(1);
    expect(stays[0].name).toBe("Hotel A");
    expect(stays[0].nights).toEqual([1, 2, 3]);
  });

  it("starts a new stay when the hotel changes", () => {
    const p = plan({
      durationDays: 3,
      days: [
        day({ day: 1, lodging: lodging({ name: "Hotel A" }) }),
        day({ day: 2, lodging: lodging({ name: "Hotel B" }) }),
        day({ day: 3, lodging: lodging({ name: "Hotel B" }) }),
      ],
    });
    const stays = collectStays(p);
    expect(stays.map((s) => s.name)).toEqual(["Hotel A", "Hotel B"]);
    expect(stays[1].nights).toEqual([2, 3]);
  });

  it("treats a non-consecutive return to a hotel as a separate stay", () => {
    const p = plan({
      durationDays: 3,
      days: [
        day({ day: 1, lodging: lodging({ name: "Hotel A" }) }),
        day({ day: 2, lodging: lodging({ name: "Hotel B" }) }),
        day({ day: 3, lodging: lodging({ name: "Hotel A" }) }),
      ],
    });
    expect(collectStays(p).map((s) => s.name)).toEqual(["Hotel A", "Hotel B", "Hotel A"]);
  });

  it("skips days with no lodging (final/departure day)", () => {
    const p = plan({
      durationDays: 2,
      days: [day({ day: 1, lodging: lodging({ name: "Hotel A" }) }), day({ day: 2, lodging: null })],
    });
    const stays = collectStays(p);
    expect(stays).toHaveLength(1);
    expect(stays[0].nights).toEqual([1]);
  });

  it("skips legacy 'checkout' placeholder lodging", () => {
    const p = plan({
      durationDays: 2,
      days: [
        day({ day: 1, lodging: lodging({ name: "Hotel A" }) }),
        day({ day: 2, lodging: lodging({ name: "Checkout / no hotel needed" }) }),
      ],
    });
    expect(collectStays(p).map((s) => s.name)).toEqual(["Hotel A"]);
  });
});

describe("nightsLabel", () => {
  it("labels a single night", () => {
    expect(nightsLabel([2])).toBe("Night 2");
  });
  it("labels a night range by its endpoints", () => {
    expect(nightsLabel([1, 2, 3])).toBe("Nights 1–3");
  });
});

describe("googleMapsUrl", () => {
  it("builds a Maps search link with the encoded query", () => {
    const url = googleMapsUrl("Park Hyatt", "Shinjuku", "Tokyo");
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Park Hyatt Shinjuku Tokyo"));
  });
});

describe("NOT_A_HOTEL", () => {
  it("matches placeholder strings, case-insensitively", () => {
    for (const s of ["Checkout", "check-out", "No hotel needed", "Departure day", "N/A"]) {
      expect(NOT_A_HOTEL.test(s)).toBe(true);
    }
  });
  it("does not match a real hotel name", () => {
    for (const s of ["Park Hyatt Tokyo", "Hoshino Resort", "Shibuya Excel"]) {
      expect(NOT_A_HOTEL.test(s)).toBe(false);
    }
  });
});
