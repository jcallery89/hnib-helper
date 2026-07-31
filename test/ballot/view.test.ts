import { describe, expect, it } from "vitest";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { BallotView } from "../../src/ui/views/BallotView.tsx";
import type { Dataset } from "../../src/io/dataset.ts";
import type { Player } from "../../src/engine/types.ts";
import { DEFAULT_POINT_SYSTEM } from "../../src/engine/pointSystem.ts";

function dataset(): Dataset {
  const players: Player[] = [
    { id: "p1", eventId: "e", teamId: "t-mid", jersey: 9, firstName: "Jack", lastName: "Sullivan", position: "F" },
    { id: "p2", eventId: "e", teamId: "t-mid", jersey: 4, firstName: "Sam", lastName: "Carrier", position: "D" },
    // Blank position + goalie stats: must land in the goalie section.
    { id: "p3", eventId: "e", teamId: "t-opp", jersey: 1, firstName: "Brady", lastName: "Olsen" },
  ];
  return {
    event: { id: "e", name: "E", year: 2026, venues: [], format: "festival", hasPlayoffBracket: true, seedingRule: "soph_division_winners", pointSystem: { ...DEFAULT_POINT_SYSTEM } },
    divisions: [{ id: "d", eventId: "e", name: "D", teamIds: ["t-mid", "t-opp"] }],
    teams: [
      { id: "t-mid", eventId: "e", divisionId: "d", name: "Middlesex" },
      { id: "t-opp", eventId: "e", divisionId: "d", name: "Northeast" },
    ],
    games: [],
    players,
    playerStats: [
      { playerId: "p1", gameId: null, gp: 4, goals: 3, assists: 2 },
      { playerId: "p2", gameId: null, gp: 4, goals: 1, assists: 1 },
      { playerId: "p3", gameId: null, gp: 3, goals: 0, assists: 0, saves: 40, shots: 44, savePct: 0.909, gaa: 1.33 },
    ],
    allStarIds: ["p1", "p2", "p3"],
    ballot: {
      targets: { F: 16, D: 10, G: 3 },
      coaches: [
        { id: "c1", coachName: "Pat Doyle", team: "Teal", ranks: { p1: 1, p2: 2 } },
        { id: "c2", coachName: "Lee Ryan", ranks: { p1: 2 } },
      ],
      finalRanks: { p1: 1 },
      selections: { p1: "roster", p2: "alternate" },
    },
  };
}

describe("BallotView", () => {
  it("renders position sections with coach columns, consensus, and the final roster", () => {
    const html = renderToString(h(BallotView, { dataset: dataset(), update: () => {} }));
    expect(html).toContain("All-Star Coaches Ballot (3 eligible)");
    expect(html).toContain("Forwards (1) - rank about 16");
    expect(html).toContain("Defense (1) - rank about 10");
    expect(html).toContain("Goaltenders (1) - rank about 3");
    expect(html).toContain("Sullivan");
    // Blank-position goalie classified by stats, not dropped.
    expect(html).toContain("Olsen");
    // Coach columns and their entered ranks.
    expect(html).toContain("P. Doyle");
    expect(html).toContain("L. Ryan");
    // Avg rank for p1 across ranks 1 and 2.
    expect(html).toContain(">1.5<");
    // Final roster card with the alternate marked.
    expect(html).toContain("Final at-large roster");
    expect(html).toContain("(alt)");
  });

  it("points the operator at the Stats tab when nothing is flagged", () => {
    const d = dataset();
    d.allStarIds = [];
    const html = renderToString(h(BallotView, { dataset: d, update: () => {} }));
    expect(html).toContain("ballot pool is empty");
    expect(html).toContain("Stats tab");
  });

  it("surfaces duplicate ranks from one coach in one section", () => {
    const d = dataset();
    d.players!.push({ id: "p4", eventId: "e", teamId: "t-opp", jersey: 7, firstName: "Ty", lastName: "Tapper", position: "F" });
    d.playerStats!.push({ playerId: "p4", gameId: null, gp: 4, goals: 2, assists: 0 });
    d.allStarIds!.push("p4");
    d.ballot!.coaches[0].ranks.p4 = 1; // same rank as p1, both forwards
    const html = renderToString(h(BallotView, { dataset: d, update: () => {} }));
    expect(html).toContain("Duplicate ranks to resolve");
    expect(html).toContain("Pat Doyle gave Forwards rank 1 to");
  });
});
