import { describe, expect, it } from "vitest";
import { buildPlayoffField } from "../src/engine/playoff/field.ts";
import { buildBracket } from "../src/engine/playoff/bracket.ts";
import type { Division, Game, HnibEvent, PlayoffSeed, Team } from "../src/engine/types.ts";

const event: HnibEvent = {
  id: "e", name: "Jr High", year: 2026, venues: [], format: "festival",
  hasPlayoffBracket: true, seedingRule: "jrhigh_winners_next_two", fieldSize: 6,
  pointSystem: { win: 2, tie: 1, loss: 0 },
};

// East has 3 teams, West has 5. The pooled "next two per division" rule must take
// East's 3rd place (C) even though West's 4th place (H) has more points - a plain
// wildcard would wrongly take H over C.
const teams: Team[] = [
  { id: "A", eventId: "e", divisionId: "dE", name: "A" },
  { id: "B", eventId: "e", divisionId: "dE", name: "B" },
  { id: "C", eventId: "e", divisionId: "dE", name: "C" },
  { id: "E", eventId: "e", divisionId: "dW", name: "E" },
  { id: "F", eventId: "e", divisionId: "dW", name: "F" },
  { id: "G", eventId: "e", divisionId: "dW", name: "G" },
  { id: "H", eventId: "e", divisionId: "dW", name: "H" },
  { id: "I", eventId: "e", divisionId: "dW", name: "I" },
];
const divisions: Division[] = [
  { id: "dE", eventId: "e", name: "East", teamIds: ["A", "B", "C"] },
  { id: "dW", eventId: "e", name: "West", teamIds: ["E", "F", "G", "H", "I"] },
];

let gid = 0;
function win(home: string, away: string): Game {
  return { id: `g${gid++}`, divisionId: null, round: "rr", rink: null, slotStart: null, homeTeamId: home, awayTeamId: away, homeScore: 1, awayScore: 0, status: "final", decidedBy: "regulation" };
}
// East: A > B > C. West: E > F > G > H > I (full ladder).
const games: Game[] = [
  win("A", "B"), win("A", "C"), win("B", "C"),
  win("E", "F"), win("E", "G"), win("E", "H"), win("E", "I"),
  win("F", "G"), win("F", "H"), win("F", "I"),
  win("G", "H"), win("G", "I"),
  win("H", "I"),
];

describe("Jr High winners_next_two seeding", () => {
  const field = buildPlayoffField(event, divisions, teams, games);
  const ids = field.seeds.map((s) => s.teamId);

  it("seeds exactly six teams", () => {
    expect(field.seeds).toHaveLength(6);
    expect(field.seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("seeds the two division winners 1-2", () => {
    expect(new Set([ids[0], ids[1]])).toEqual(new Set(["A", "E"]));
  });

  it("takes the next two per division (pooled), capping each division", () => {
    // East's 3rd place C is IN; West's 4th place H is OUT even with more points.
    expect(ids).toContain("C");
    expect(ids).not.toContain("H");
    expect(ids).not.toContain("I");
  });
});

describe("6-team bracket", () => {
  const seeds: PlayoffSeed[] = [1, 2, 3, 4, 5, 6].map((seed) => ({ seed, teamId: `s${seed}`, source: "auto", notes: [] }));
  const games6 = buildBracket(seeds, new Map(), 6);
  const byId = new Map(games6.map((g) => [g.id, g]));

  it("gives seeds 1 and 2 byes into the semifinals", () => {
    // Two play-in games (4v5, 3v6), two semis, a final.
    expect(games6.filter((g) => g.round === "qf")).toHaveLength(2);
    expect(byId.get("qf1")).toMatchObject({ highSeed: 4, lowSeed: 5 });
    expect(byId.get("qf2")).toMatchObject({ highSeed: 3, lowSeed: 6 });
    expect(byId.get("sf1")).toMatchObject({ highSeed: 1, highTeamId: "s1" });
    expect(byId.get("sf2")).toMatchObject({ highSeed: 2, highTeamId: "s2" });
  });
});
