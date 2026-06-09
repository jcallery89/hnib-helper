import { describe, expect, it } from "vitest";
import { computeStandings, hasUnequalSchedules } from "../src/engine/standings.ts";
import { team, rr } from "./helpers.ts";

describe("computeStandings", () => {
  const teams = [team("A"), team("B"), team("C")];

  it("applies the 2/1/0 point system and accumulates GF/GA/+/-", () => {
    const games = [rr("A", "B", 3, 1), rr("A", "C", 2, 2), rr("B", "C", 0, 4)];
    const s = new Map(computeStandings(teams, games).map((x) => [x.teamId, x]));

    expect(s.get("A")).toMatchObject({ gp: 2, w: 1, t: 1, l: 0, points: 3, gf: 5, ga: 3, plusMinus: 2 });
    expect(s.get("B")).toMatchObject({ gp: 2, w: 0, t: 0, l: 2, points: 0, gf: 1, ga: 7, plusMinus: -6 });
    expect(s.get("C")).toMatchObject({ gp: 2, w: 1, t: 1, l: 0, points: 3, gf: 6, ga: 2, plusMinus: 4 });
  });

  it("ignores non-final and playoff games", () => {
    const scheduled = { ...rr("A", "B", 0, 0), status: "scheduled" as const, homeScore: null, awayScore: null };
    const playoff = { ...rr("A", "C", 5, 0), round: "qf" as const };
    const s = computeStandings(teams, [scheduled, playoff]);
    expect(s.every((x) => x.gp === 0)).toBe(true);
  });

  it("flags unequal schedules", () => {
    const balanced = [rr("A", "B", 1, 0), rr("A", "C", 1, 0), rr("B", "C", 1, 0)];
    expect(hasUnequalSchedules(computeStandings(teams, balanced))).toBe(false);

    const lopsided = [rr("A", "B", 1, 0), rr("A", "C", 1, 0)]; // B and C play once, A twice
    expect(hasUnequalSchedules(computeStandings(teams, lopsided))).toBe(true);
  });
});
