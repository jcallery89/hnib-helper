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
    ballot: {
      nominatedIds: ["p1", "p3"],
      selections: { p1: "roster" },
      playerNotes: { p1: "confirmed available" },
    },
  };
}

describe("BallotView", () => {
  it("lists every rostered player by position with nomination marks and counts", () => {
    const html = renderToString(h(BallotView, { dataset: dataset(), update: () => {} }));
    expect(html).toContain("Nominations (2)");
    // All three sections render, blank-position goalie classified by stats.
    expect(html).toContain("Forwards (1 nominated of 1)");
    expect(html).toContain("Defense (0 nominated of 1)");
    expect(html).toContain("Goaltenders (1 nominated of 1)");
    expect(html).toContain("Sullivan, Jack");
    expect(html).toContain("Carrier, Sam");
    expect(html).toContain("Olsen, Brady");
    // Roster/Alternate tallies and the saved note.
    expect(html).toContain("Roster 1, Alternates 0");
    expect(html).toContain("confirmed available");
    // Contact join section present with its privacy note.
    expect(html).toContain("Notification export");
    expect(html).toContain("never saved in the app");
  });

  it("checks nominated players and leaves others unchecked", () => {
    const html = renderToString(h(BallotView, { dataset: dataset(), update: () => {} }));
    expect(html).toContain('aria-label="Nominated: Jack Sullivan" checked');
    expect(html).toContain('aria-label="Nominated: Sam Carrier"');
    expect(html).not.toContain('aria-label="Nominated: Sam Carrier" checked');
  });

  it("explains the empty state before rosters are synced", () => {
    const d = dataset();
    d.players = [];
    const html = renderToString(h(BallotView, { dataset: d, update: () => {} }));
    expect(html).toContain("No players yet");
  });
});
