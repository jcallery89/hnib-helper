import { describe, expect, it } from "vitest";
import { generateWriteup } from "../../src/engine/players/writeup.ts";
import type { Player, PlayerSummary } from "../../src/engine/types.ts";

const skater: Player = {
  id: "p1", eventId: "e", teamId: "t", jersey: 9,
  firstName: "Jack", lastName: "Sullivan",
  position: "F", classYear: 2030, shoots: "L", heightInches: 66, hometown: "Andover, MA",
};
const skaterSummary: PlayerSummary = {
  playerId: "p1", isGoalie: false, gp: 7, goals: 8, assists: 6, points: 14, pim: 2,
};

const goalie: Player = {
  id: "p2", eventId: "e", teamId: "t", jersey: 1,
  firstName: "Brady", lastName: "Olsen", position: "G", classYear: 2030,
};
const goalieSummary: PlayerSummary = {
  playerId: "p2", isGoalie: true, gp: 7, goals: 0, assists: 0, points: 0, pim: 0,
  goalsAgainst: 9, saves: 121, savePct: 0.931, gaa: 1.29,
};

describe("generateWriteup", () => {
  it("writes a skater report from bio, totals, and log highlights", () => {
    const text = generateWriteup({
      player: skater,
      summary: skaterSummary,
      teamName: "Middlesex",
      eventName: "2025 Jr. High Festival",
      gameLog: [
        { opponent: "Northeast", goals: 1, assists: 1, points: 2, pim: 0, shots: 5, saves: 0 },
        { opponent: "Essex", goals: 3, assists: 1, points: 4, pim: 0, shots: 8, saves: 0 },
        { opponent: "Western", goals: 0, assists: 0, points: 0, pim: 2, shots: 4, saves: 0 },
      ],
    });
    expect(text).toContain("Jack Sullivan is a 5'6\" Class of 2030 forward from Andover, MA playing for Middlesex.");
    expect(text).toContain("Sullivan put up 8 goals and 6 assists for 14 points in 7 games at the 2025 Jr. High Festival.");
    expect(text).toContain("The best line came against Essex: 3 goals and an assist.");
    expect(text).toContain("hit the scoresheet in 2 of 3 games");
  });

  it("writes a goalie report with GAA, save percentage, and busiest night", () => {
    const text = generateWriteup({
      player: goalie,
      summary: goalieSummary,
      teamName: "Middlesex",
      eventName: "2025 Jr. High Festival",
      gameLog: [
        { opponent: "Essex", goals: 0, assists: 0, points: 0, pim: 0, shots: 26, saves: 24 },
        { opponent: "Western", goals: 0, assists: 0, points: 0, pim: 0, shots: 18, saves: 17 },
      ],
    });
    expect(text).toContain("1.29 goals against average");
    expect(text).toContain(".931 save percentage");
    expect(text).toContain("The busiest night came against Essex: 24 saves on 26 shots.");
  });

  it("counts goalie shutouts when there are any", () => {
    const text = generateWriteup({
      player: goalie,
      summary: goalieSummary,
      teamName: "Middlesex",
      eventName: "Event",
      gameLog: [{ opponent: "Metro", goals: 0, assists: 0, points: 0, pim: 0, shots: 20, saves: 20 }],
    });
    expect(text).toContain("Olsen recorded 1 shutout.");
  });

  it("obeys voice rules: no exclamation points, no em dashes", () => {
    const text = generateWriteup({
      player: skater,
      summary: skaterSummary,
      teamName: "Middlesex",
      eventName: "2025 Jr. High Festival",
    });
    expect(text).not.toContain("!");
    expect(text).not.toContain("—");
  });
});
