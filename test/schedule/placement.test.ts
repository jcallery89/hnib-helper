import { describe, expect, it } from "vitest";
import { generateMatchups } from "../../src/engine/schedule/matchups.ts";
import { buildSlotGrid, type VenueConfig } from "../../src/engine/schedule/slotGrid.ts";
import { placeSchedule } from "../../src/engine/schedule/placement.ts";
import { DEFAULT_CONSTRAINTS } from "../../src/engine/schedule/constraints.ts";
import type { Division, Game } from "../../src/engine/types.ts";

const venue: VenueConfig = {
  sheets: ["Gray", "Lamacchia"],
  days: [
    { date: "2025-06-27", start: "08:00", end: "18:00", slotMinutes: 105, staggerMinutes: 15 },
    { date: "2025-06-28", start: "08:00", end: "18:00", slotMinutes: 105, staggerMinutes: 15 },
    { date: "2025-06-29", start: "08:00", end: "18:00", slotMinutes: 105, staggerMinutes: 15 },
  ],
};

const divisions: Division[] = [
  { id: "A", eventId: "e", name: "A", teamIds: ["a1", "a2", "a3", "a4"] },
  { id: "B", eventId: "e", name: "B", teamIds: ["b1", "b2", "b3", "b4"] },
];

function noTeamDoubleBookedOrTooClose(placed: Game[], minRest: number): void {
  const byTeam = new Map<string, number[]>();
  for (const g of placed) {
    const minutes = Date.parse(g.slotStart as string) / 60000;
    for (const t of [g.homeTeamId, g.awayTeamId]) {
      const arr = byTeam.get(t) ?? [];
      arr.push(minutes);
      byTeam.set(t, arr);
    }
  }
  for (const times of byTeam.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(minRest);
    }
  }
}

describe("Phase 2 placement", () => {
  const { games } = generateMatchups(divisions, 4);
  const slots = buildSlotGrid(venue);

  it("places every matchup", () => {
    const result = placeSchedule(games, slots, DEFAULT_CONSTRAINTS);
    expect(result.unplaced).toEqual([]);
    expect(result.placed.length).toBe(games.length);
  });

  it("never double-books a slot", () => {
    const result = placeSchedule(games, slots, DEFAULT_CONSTRAINTS);
    const usedSlots = result.placed.map((g) => `${g.slotStart}|${g.rink}`);
    expect(new Set(usedSlots).size).toBe(usedSlots.length);
  });

  it("honours the 120-minute minimum rest window", () => {
    const result = placeSchedule(games, slots, DEFAULT_CONSTRAINTS);
    noTeamDoubleBookedOrTooClose(result.placed, 120);
  });
});
