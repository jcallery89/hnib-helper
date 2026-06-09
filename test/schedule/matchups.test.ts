import { describe, expect, it } from "vitest";
import { generateMatchups } from "../../src/engine/schedule/matchups.ts";
import type { Division } from "../../src/engine/types.ts";

function division(id: string, teamIds: string[]): Division {
  return { id, eventId: "e", name: id, teamIds };
}

describe("Phase 1 matchups", () => {
  it("gives every team the target games with no repeat opponents (8 teams, 4/4)", () => {
    const divisions = [
      division("A", ["a1", "a2", "a3", "a4"]),
      division("B", ["b1", "b2", "b3", "b4"]),
    ];
    const { games, warnings } = generateMatchups(divisions, 4);
    expect(warnings).toEqual([]);

    const count = new Map<string, number>();
    const seenPairs = new Set<string>();
    for (const g of games) {
      count.set(g.homeTeamId, (count.get(g.homeTeamId) ?? 0) + 1);
      count.set(g.awayTeamId, (count.get(g.awayTeamId) ?? 0) + 1);
      const key = [g.homeTeamId, g.awayTeamId].sort().join("|");
      expect(seenPairs.has(key)).toBe(false); // no duplicate matchup
      seenPairs.add(key);
    }
    for (const c of count.values()) expect(c).toBe(4);
    // 8 teams * 4 games / 2 = 16 matchups.
    expect(games.length).toBe(16);
  });

  it("needs no crossovers when a division round robin already meets the target", () => {
    // A 5-team division at target 4 is complete internally (each plays 4).
    const divisions = [division("A", ["a1", "a2", "a3", "a4", "a5"])];
    const { games } = generateMatchups(divisions, 4);
    expect(games.every((g) => g.divisionId === "A")).toBe(true);
    expect(games.length).toBe(10); // C(5,2)
  });
});
