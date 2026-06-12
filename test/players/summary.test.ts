import { describe, expect, it } from "vitest";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { summarizePlayers } from "../../src/engine/players/summary.ts";
import { PlayerCard } from "../../src/render/player/PlayerCard.tsx";
import type { Player, PlayerStatLine } from "../../src/engine/types.ts";

const skater: Player = { id: "p1", eventId: "e", teamId: "t", jersey: 9, firstName: "Jack", lastName: "Sullivan", position: "F", classYear: 2030 };
const goalie: Player = { id: "p2", eventId: "e", teamId: "t", jersey: 1, firstName: "Brady", lastName: "Olsen", position: "G" };

describe("summarizePlayers", () => {
  it("aggregates per-game skater lines into points and counts games", () => {
    const lines: PlayerStatLine[] = [
      { playerId: "p1", gameId: "g1", goals: 2, assists: 1, pim: 2 },
      { playerId: "p1", gameId: "g2", goals: 1, assists: 3, pim: 0 },
    ];
    const s = summarizePlayers([skater], lines)[0];
    expect(s).toMatchObject({ gp: 2, goals: 3, assists: 4, points: 7, pim: 2, isGoalie: false });
  });

  it("computes goalie GAA and save percentage", () => {
    const lines: PlayerStatLine[] = [
      { playerId: "p2", gameId: null, gp: 4, goals: 0, assists: 0, saves: 36, goalsAgainst: 4, shots: 40 },
    ];
    const s = summarizePlayers([goalie], lines)[0];
    expect(s.isGoalie).toBe(true);
    expect(s.gp).toBe(4);
    expect(s.gaa).toBe(1); // 4 GA / 4 GP
    expect(s.savePct).toBe(0.9); // 36 / 40
  });

  it("returns a zeroed summary for a rostered player with no stats", () => {
    const s = summarizePlayers([skater], [])[0];
    expect(s).toMatchObject({ gp: 0, goals: 0, assists: 0, points: 0 });
  });
});

describe("PlayerCard render", () => {
  it("renders an SVG card with the player's name and stat line", () => {
    const summary = summarizePlayers([skater], [{ playerId: "p1", gameId: null, gp: 7, goals: 8, assists: 6 }])[0];
    const svg = renderToString(
      h(PlayerCard, { width: 1080, height: 1080, player: skater, summary, teamName: "Middlesex", eventName: "2025 Jr. High Festival" }),
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("SULLIVAN");
    expect(svg).toContain("GET SEEN. GET RECRUITED.");
  });
});
