import { describe, expect, it } from "vitest";
import { generateMatchups } from "../../src/engine/schedule/matchups.ts";
import { buildSlotGrid, type VenueConfig } from "../../src/engine/schedule/slotGrid.ts";
import { placeSchedule } from "../../src/engine/schedule/placement.ts";
import { reflow } from "../../src/engine/schedule/reflow.ts";
import { DEFAULT_CONSTRAINTS } from "../../src/engine/schedule/constraints.ts";
import type { Division } from "../../src/engine/types.ts";

const venue: VenueConfig = {
  sheets: ["Gray", "Lamacchia"],
  days: [
    { date: "2026-06-26", start: "08:00", end: "18:00", slotMinutes: 105, staggerMinutes: 15 },
    { date: "2026-06-27", start: "08:00", end: "18:00", slotMinutes: 105, staggerMinutes: 15 },
    { date: "2026-06-28", start: "08:00", end: "18:00", slotMinutes: 105, staggerMinutes: 15 },
  ],
};

const divisions: Division[] = [
  { id: "A", eventId: "e", name: "A", teamIds: ["a1", "a2", "a3", "a4"] },
  { id: "B", eventId: "e", name: "B", teamIds: ["b1", "b2", "b3", "b4"] },
];

describe("re-flow workflow", () => {
  it("re-solves under a new availability constraint and reports a diff", () => {
    const { games } = generateMatchups(divisions, 4);
    const slots = buildSlotGrid(venue);
    const first = placeSchedule(games, slots, DEFAULT_CONSTRAINTS);

    // Team a1 cannot play before 14:00 on 2026-06-26.
    const constraints = {
      ...DEFAULT_CONSTRAINTS,
      availability: [{ teamId: "a1", date: "2026-06-26", earliest: "14:00" }],
    };
    const result = reflow(games, slots, constraints, first.assignment);

    // Every a1 game on that date now starts at or after 14:00.
    for (const g of result.placed) {
      if ((g.homeTeamId === "a1" || g.awayTeamId === "a1") && g.slotStart?.startsWith("2026-06-26")) {
        expect(g.slotStart.slice(11, 16) >= "14:00").toBe(true);
      }
    }

    // The diff lists only games that actually moved, and the schedule stays valid.
    expect(result.unplaced).toEqual([]);
    expect(result.diff.length).toBeGreaterThan(0);
    expect(result.diff.length).toBeLessThan(games.length);
    for (const d of result.diff) {
      expect(JSON.stringify(d.from)).not.toBe(JSON.stringify(d.to));
    }
  });
});
