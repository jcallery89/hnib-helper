import { describe, expect, it } from "vitest";
import { buildPlayoffField } from "../src/engine/playoff/field.ts";
import { buildBracket } from "../src/engine/playoff/bracket.ts";
import type { Division, Game, HnibEvent, Team } from "../src/engine/types.ts";
import seed from "../src/fixtures/hnib-2025-seed.json";

const event = seed.event as HnibEvent;
const divisions = seed.divisions as Division[];
const teams = seed.teams as Team[];
const games = seed.games as Game[];

describe("playoff field builder (Jr. High top-two-per-division)", () => {
  const field = buildPlayoffField(event, divisions, teams, games, {
    now: () => "2026-06-09T00:00:00.000Z",
  });

  it("ranks each division by divisional placing (head-to-head breaks the EAST tie)", () => {
    const east = field.divisionStandings.get("div-east")!.map((s) => s.teamId);
    // Chelmsford and Danvers tie on points; Chelmsford won head-to-head.
    expect(east).toEqual(["t-and", "t-bev", "t-che", "t-dan"]);
  });

  it("seeds winners 1-2, runners-up 3-4, then wildcards 5-8", () => {
    const order = field.seeds.map((s) => s.teamId);
    expect(order).toEqual([
      "t-and", // 1 - EAST winner (beat Worcester head-to-head)
      "t-wor", // 2 - WEST winner
      "t-bev", // 3 - EAST runner-up
      "t-wes", // 4 - WEST runner-up
      "t-che", // 5 - wildcard (beat Danvers head-to-head)
      "t-dan", // 6 - wildcard
      "t-wak", // 7 - wildcard
      "t-wal", // 8 - wildcard
    ]);
  });

  it("marks seeds 1-4 as auto-qualifiers and 5-8 as wildcards", () => {
    expect(field.seeds.slice(0, 4).every((s) => s.source === "auto")).toBe(true);
    expect(field.seeds.slice(4).every((s) => s.source === "wildcard")).toBe(true);
  });
});

describe("bracket builder", () => {
  const { seeds } = buildPlayoffField(event, divisions, teams, games, {
    now: () => "2026-06-09T00:00:00.000Z",
  });

  it("pairs 1v8, 4v5, 2v7, 3v6 in the quarterfinals", () => {
    const bracket = buildBracket(seeds);
    const qf = bracket.filter((g) => g.round === "qf");
    expect(qf.map((g) => [g.highSeed, g.lowSeed])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it("advances winners from quarterfinals into semifinals", () => {
    const results = new Map([
      ["qf1", { highScore: 4, lowScore: 1, decidedBy: "regulation" as const }],
      ["qf2", { highScore: 2, lowScore: 3, decidedBy: "regulation" as const }],
    ]);
    const bracket = buildBracket(seeds, results);
    const sf1 = bracket.find((g) => g.id === "sf1")!;
    expect(sf1.highTeamId).toBe("t-and"); // qf1 winner (seed 1)
    expect(sf1.lowTeamId).toBe("t-che"); // qf2 winner (seed 5, the low seed won)
  });

  it("uses an explicit winner when a game is shootout-decided on equal scores", () => {
    const results = new Map([
      ["qf1", { highScore: 2, lowScore: 2, decidedBy: "shootout" as const, winner: "low" as const }],
    ]);
    const bracket = buildBracket(seeds, results);
    expect(bracket.find((g) => g.id === "qf1")!.winnerTeamId).toBe("t-wal");
  });
});
