import { describe, expect, it } from "vitest";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { playerSummaries, teamGamesPlayed } from "../../src/ui/state/store.ts";
import { StatsView } from "../../src/ui/views/StatsView.tsx";
import type { Dataset } from "../../src/io/dataset.ts";
import type { Game, Player } from "../../src/engine/types.ts";
import { DEFAULT_POINT_SYSTEM } from "../../src/engine/pointSystem.ts";

function game(id: string, home: string, away: string): Game {
  return { id, divisionId: null, round: "rr", rink: null, slotStart: null, homeTeamId: home, awayTeamId: away, homeScore: 3, awayScore: 1, status: "final", decidedBy: "regulation" };
}

function dataset(): Dataset {
  const players: Player[] = [
    { id: "p1", eventId: "e", teamId: "t-mid", jersey: 9, firstName: "Jack", lastName: "Sullivan", position: "F" },
    { id: "p2", eventId: "e", teamId: "t-mid", jersey: 1, firstName: "Brady", lastName: "Olsen", position: "G" },
  ];
  return {
    event: { id: "e", name: "E", year: 2025, venues: [], format: "festival", hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { ...DEFAULT_POINT_SYSTEM } },
    divisions: [{ id: "d", eventId: "e", name: "D", teamIds: ["t-mid", "t-opp"] }],
    teams: [
      { id: "t-mid", eventId: "e", divisionId: "d", name: "Middlesex" },
      { id: "t-opp", eventId: "e", divisionId: "d", name: "Opp" },
    ],
    games: [game("g1", "t-mid", "t-opp"), game("g2", "t-mid", "t-opp"), game("g3", "t-mid", "t-opp")],
    players,
    // Box stats report GP 0 (the Tourno quirk); real stats present.
    playerStats: [
      { playerId: "p1", gameId: null, gp: 0, goals: 5, assists: 4 },
      { playerId: "p2", gameId: null, gp: 0, goals: 0, assists: 0, saves: 40, shots: 44 },
    ],
  };
}

describe("games-played fallback", () => {
  it("counts a team's completed games", () => {
    expect(teamGamesPlayed(dataset()).get("t-mid")).toBe(3);
  });

  it("uses the team game count when the box score reports GP 0", () => {
    const s = playerSummaries(dataset());
    expect(s.get("p1")!.gp).toBe(3); // not 0
    expect(s.get("p2")!.gp).toBe(3);
    expect(s.get("p1")!.points).toBe(9); // real scoring still summed
  });

  it("keeps an explicit non-zero GP from the stat line", () => {
    const d = dataset();
    d.playerStats = [{ playerId: "p1", gameId: null, gp: 7, goals: 5, assists: 4 }];
    expect(playerSummaries(d).get("p1")!.gp).toBe(7);
  });
});

describe("StatsView", () => {
  it("renders the all-star pool and a sortable skaters table", () => {
    const html = renderToString(h(StatsView, { dataset: dataset(), update: () => {} }));
    expect(html).toContain("All-Star Pool");
    expect(html).toContain("Sullivan");
    expect(html).toContain("Skaters");
    expect(html).toContain("Goaltenders");
  });
});
