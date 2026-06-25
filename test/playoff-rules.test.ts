import { describe, expect, it } from "vitest";
import { buildPlayoffField } from "../src/engine/playoff/field.ts";
import { playoffSeedingRules } from "../src/engine/playoff/rules.ts";
import type { Division, Game, HnibEvent, Team } from "../src/engine/types.ts";
import { DEFAULT_POINT_SYSTEM } from "../src/engine/pointSystem.ts";

const event = (overrides: Partial<HnibEvent> = {}): HnibEvent => ({
  id: "e", name: "Test", year: 2025, venues: [], format: "festival",
  hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { ...DEFAULT_POINT_SYSTEM },
  ...overrides,
});

describe("playoffSeedingRules text", () => {
  it("reads like the Jr. High blurb for two divisions", () => {
    const r = playoffSeedingRules(event(), 2);
    expect(r.seedingLines[0]).toContain("ranked 1st and 2nd");
    expect(r.seedingLines[1]).toContain("ranked 3rd and 4th");
    expect(r.seedingLines[2]).toContain("5th, 6th, 7th, and 8th");
    expect(r.tiebreakRules[1]).toContain("Most Wins");
    expect(r.tiebreakRules[2]).toContain("two teams are tied");
  });

  it("reads like the Sophomore blurb for three divisions", () => {
    const r = playoffSeedingRules(event(), 3);
    expect(r.seedingLines[0]).toContain("ranked 1st, 2nd, and 3rd");
    expect(r.seedingLines[1]).toContain("ranked 4th, 5th, and 6th");
    expect(r.seedingLines[2]).toContain("7th and 8th");
  });
});

describe("Sophomore-style field (3 divisions, top two per division)", () => {
  // 3 divisions of 3 teams; distinct points so the order is unambiguous.
  const teams: Team[] = [];
  const divisions: Division[] = [];
  const games: Game[] = [];
  let g = 0;
  const score = (home: string, away: string, hs: number, as: number): Game => ({
    id: `g${g++}`, divisionId: null, round: "rr", rink: null, slotStart: null,
    homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, status: "final", decidedBy: "regulation",
  });
  ["RED", "WHITE", "BLUE"].forEach((d, di) => {
    const ids = [0, 1, 2].map((i) => `t-${d}-${i}`);
    divisions.push({ id: d, eventId: "e", name: d, teamIds: ids });
    ids.forEach((id) => teams.push({ id, eventId: "e", divisionId: d, name: id }));
    // Round robin within the division engineered for distinct standings:
    // team 0 beats 1 and 2, team 1 beats 2. Add cross-division spread so the
    // overall winners/runners differ by division strength.
    games.push(score(ids[0], ids[1], 5 - di, 0));
    games.push(score(ids[0], ids[2], 5 - di, 0));
    games.push(score(ids[1], ids[2], 3 - di, 1));
  });

  it("seeds winners 1-3, runners-up 4-6, then two wildcards", () => {
    const field = buildPlayoffField(event(), divisions, teams, games, { now: () => "2026-01-01T00:00:00Z" });
    expect(field.seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Seeds 1-6 are the three winners then three runners-up (auto), 7-8 wildcards.
    expect(field.seeds.slice(0, 6).every((s) => s.source === "auto")).toBe(true);
    expect(field.seeds.slice(6).every((s) => s.source === "wildcard")).toBe(true);
    // Every division winner (team 0 of each) is in the top three seeds.
    const top3 = new Set(field.seeds.slice(0, 3).map((s) => s.teamId));
    expect(top3).toEqual(new Set(["t-RED-0", "t-WHITE-0", "t-BLUE-0"]));
    // Exactly one team misses the 8-team field, and it is a third-place team.
    const seeded = field.seeds.map((s) => s.teamId);
    const missing = teams.map((t) => t.id).filter((id) => !seeded.includes(id));
    expect(missing).toHaveLength(1);
    expect(missing[0].endsWith("-2")).toBe(true);
  });
});
