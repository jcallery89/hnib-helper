import { describe, expect, it } from "vitest";
import { computeStandings, hasUnequalSchedules, scheduleCountWarnings } from "../src/engine/standings.ts";
import type { Game } from "../src/engine/types.ts";
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

describe("scheduleCountWarnings", () => {
  const T = (id: string) => ({ id, eventId: "e", divisionId: "d", name: id.toUpperCase() });
  const G = (id: string, h: string, a: string): Game =>
    ({ id, divisionId: null, round: "rr", rink: null, slotStart: null, homeTeamId: h, awayTeamId: a, homeScore: null, awayScore: null, status: "scheduled", decidedBy: null });

  it("flags a team whose played-plus-remaining differs from everyone else", () => {
    const teams = [T("a"), T("b"), T("c"), T("d")];
    // a and b have 2 rr games; c has 2; d has only 1 - d is the broken one.
    const games = [G("1", "a", "b"), G("2", "a", "c"), G("3", "b", "c"), G("4", "d", "a")];
    // counts: a 3, b 2, c 2, d 1 -> mode 2; a and d flagged.
    const warnings = scheduleCountWarnings(teams, games);
    expect(warnings.some((w) => w.includes("D has 1 round-robin game "))).toBe(true);
    expect(warnings.some((w) => w.includes("A has 3"))).toBe(true);
    expect(warnings.some((w) => w.includes("B has"))).toBe(false);
  });

  it("stays quiet when every team has the same count", () => {
    const teams = [T("a"), T("b"), T("c"), T("d")];
    const games = [G("1", "a", "b"), G("2", "c", "d"), G("3", "a", "c"), G("4", "b", "d")];
    expect(scheduleCountWarnings(teams, games)).toEqual([]);
  });
});
