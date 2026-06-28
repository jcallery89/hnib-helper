import { describe, expect, it } from "vitest";
import { playoffPicture, eliminatedTeamIds } from "../src/engine/playoff/scenarios.ts";
import type { Division, Game, HnibEvent, Team } from "../src/engine/types.ts";

const event: HnibEvent = {
  id: "e1", name: "Test", year: 2026, venues: [], format: "festival",
  hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { win: 2, tie: 1, loss: 0 },
};

// One division, three teams, a 2-team field: exactly one team misses.
const teams: Team[] = [
  { id: "A", eventId: "e1", divisionId: "d1", name: "Aces" },
  { id: "B", eventId: "e1", divisionId: "d1", name: "Bears" },
  { id: "C", eventId: "e1", divisionId: "d1", name: "Cubs" },
];
const divisions: Division[] = [{ id: "d1", eventId: "e1", name: "D1", teamIds: ["A", "B", "C"] }];

function game(id: string, home: string, away: string, hs: number | null, as: number | null): Game {
  const final = hs !== null && as !== null;
  return { id, divisionId: "d1", round: "rr", rink: null, slotStart: null, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, status: final ? "final" : "scheduled", decidedBy: final ? "regulation" : null };
}

describe("playoffPicture", () => {
  it("eliminates a team that cannot reach the field even winning out", () => {
    // A and B each beat C; C has one game left vs A. C's best is 2 pts, still below A and B (4+).
    const games: Game[] = [
      game("g1", "A", "C", 3, 0), // A win
      game("g2", "B", "C", 2, 0), // B win
      game("g3", "A", "B", 1, 1), // A,B tie -> A 3, B 3
      game("g4", "C", "A", null, null), // remaining
    ];
    const pic = playoffPicture(event, divisions, teams, games, 2);
    expect(pic.decided).toBe(true);
    expect(eliminatedTeamIds(pic)).toEqual(["C"]);
    // A and B both clinch the 2-team field regardless of the last game.
    const state = new Map(pic.statuses.map((s) => [s.teamId, s.state]));
    expect(state.get("A")).toBe("clinched");
    expect(state.get("B")).toBe("clinched");
  });

  it("calls a finished season directly from final results", () => {
    const games: Game[] = [
      game("g1", "A", "B", 2, 1),
      game("g2", "A", "C", 2, 0),
      game("g3", "B", "C", 2, 0),
    ];
    const pic = playoffPicture(event, divisions, teams, games, 2);
    expect(pic.decided).toBe(true);
    expect(eliminatedTeamIds(pic)).toEqual(["C"]); // C lost both, finishes 3rd
  });

  it("keeps everyone alive when nothing is decided yet", () => {
    const games: Game[] = [
      game("g1", "A", "B", null, null),
      game("g2", "A", "C", null, null),
      game("g3", "B", "C", null, null),
    ];
    const pic = playoffPicture(event, divisions, teams, games, 2);
    expect(eliminatedTeamIds(pic)).toEqual([]);
  });

  it("reports undecided when too many games remain to enumerate", () => {
    const many: Game[] = Array.from({ length: 9 }, (_, i) => game(`r${i}`, "A", "B", null, null));
    const pic = playoffPicture(event, divisions, teams, many, 2);
    expect(pic.decided).toBe(false);
    expect(pic.remainingGames).toBe(9);
  });
});
