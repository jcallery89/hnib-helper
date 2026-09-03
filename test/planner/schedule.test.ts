import { describe, expect, it } from "vitest";
import { newScenario, planScenario, toMinutes } from "../../src/engine/planner/index.ts";
import type { PlanResult, Scenario, Session } from "../../src/engine/planner/types.ts";

/** Hard rules every generated grid must satisfy. */
function assertValidGrid(r: PlanResult): void {
  const st = r.scenario.structure;
  const step = st.blockMinutes + st.bufferMinutes;
  const first = toMinutes(st.firstIce);
  const last = toMinutes(st.lastIce);
  const live = r.schedule.sessions.filter((s) => s.kind !== "idle");

  // Inside the ice window.
  for (const s of live) {
    expect(s.start).toBeGreaterThanOrEqual(first);
    expect(s.end).toBeLessThanOrEqual(last);
    expect(s.end).toBeGreaterThan(s.start);
  }

  // One session at a time per sheet.
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.day !== b.day || a.sheet !== b.sheet) continue;
      expect(a.start >= b.end || b.start >= a.end).toBe(true);
    }
  }

  // A team is never in two places at once, and never back-to-back in games.
  const byTeam = new Map<number, Session[]>();
  for (const s of live) for (const t of s.teams) byTeam.set(t, [...(byTeam.get(t) ?? []), s]);
  for (const sessions of byTeam.values()) {
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];
        if (a.day !== b.day) continue;
        expect(a.start >= b.end || b.start >= a.end).toBe(true);
        if (a.kind === "game" && b.kind === "game") {
          expect(Math.abs(a.start - b.start)).toBeGreaterThanOrEqual((st.restBlocks + 1) * step);
        }
      }
    }
  }
}

function satellite(teams: number, games: number, tweak?: (s: Scenario) => void): PlanResult {
  const s = newScenario("satellite", `${teams} teams`);
  s.structure.teams = teams;
  s.structure.gamesPerTeam = games;
  tweak?.(s);
  return planScenario(s);
}

describe("weekend schedule builder", () => {
  it("4 teams x 4 games fits two days on one sheet with a placement round", () => {
    const r = satellite(4, 4);
    assertValidGrid(r);
    expect(r.schedule.fits).toBe(true);
    expect(r.schedule.roundRobinGames).toBe(6);
    expect(r.schedule.placementGames).toBe(2);
    expect(r.schedule.totalGames).toBe(8);
    expect(r.schedule.days).toHaveLength(2);
    // Every team plays on both days.
    for (const perDay of r.schedule.teamGamesByDay) expect(perDay.every((n) => n > 0)).toBe(true);
    // Placement games come after the last round-robin game.
    const rr = r.schedule.sessions.filter((s) => s.kind === "game");
    const placement = r.schedule.sessions.filter((s) => s.kind === "placement");
    const lastRr = Math.max(...rr.map((s) => s.day * 10000 + s.start));
    for (const p of placement) expect(p.day * 10000 + p.start).toBeGreaterThan(lastRr);
  });

  it("3 teams at 3 games falls back to the closest plan and still builds a valid grid", () => {
    const r = satellite(3, 3, (s) => (s.structure.playoffs = "semis"));
    assertValidGrid(r);
    expect(r.format.exact).toBe(false);
    expect(r.schedule.fits).toBe(true);
    // Play-in then final, in order.
    const playoff = r.schedule.sessions.filter((s) => s.kind === "playoff");
    expect(playoff).toHaveLength(2);
    expect(playoff[0].label).toContain("Play-in");
    expect(playoff[1].start).toBeGreaterThan(playoff[0].start);
  });

  it("6 teams x 4 games (pools plus two crossovers) fits on one sheet in two days", () => {
    const r = satellite(6, 4);
    assertValidGrid(r);
    expect(r.schedule.fits).toBe(true);
    expect(r.schedule.roundRobinGames).toBe(12);
  });

  it("8 teams x 4 games with semis and final on two sheets", () => {
    const r = satellite(8, 4, (s) => {
      s.structure.sheets = 2;
      s.structure.playoffs = "semis";
    });
    assertValidGrid(r);
    expect(r.schedule.fits).toBe(true);
    expect(r.schedule.roundRobinGames).toBe(16);
    expect(r.schedule.playoffGames).toBe(3);
    const semis = r.schedule.sessions.filter((s) => s.stage === "Semifinals");
    const final = r.schedule.sessions.find((s) => s.stage === "Final") as Session;
    expect(semis).toHaveLength(2);
    // Semis run side by side on the two sheets, final after both with the rest gap.
    expect(semis[0].start).toBe(semis[1].start);
    expect(final.start - semis[0].start).toBeGreaterThanOrEqual(2 * 80);
  });

  it("Massachusetts festival: 8 teams, quarterfinal bracket, two sheets, three days", () => {
    const r = planScenario(newScenario("ma-festival"));
    assertValidGrid(r);
    expect(r.schedule.fits).toBe(true);
    expect(r.schedule.roundRobinGames).toBe(16);
    expect(r.schedule.playoffGames).toBe(7);
    const stageStart = (stage: string) => Math.min(...r.schedule.sessions.filter((s) => s.stage === stage).map((s) => s.start));
    expect(stageStart("Quarterfinals")).toBeLessThan(stageStart("Semifinals"));
    expect(stageStart("Semifinals")).toBeLessThan(stageStart("Final"));
    // All bracket games sit on the last day.
    for (const s of r.schedule.sessions.filter((x) => x.kind === "playoff")) expect(s.day).toBe(2);
  });

  it("9 teams x 4 games (the 2025 Jr. High shape) fits two sheets over three days", () => {
    const r = satellite(9, 4, (s) => {
      s.structure.sheets = 2;
      s.structure.days = 3;
      s.structure.playoffs = "quarters";
    });
    assertValidGrid(r);
    expect(r.format.exact).toBe(true);
    expect(r.schedule.fits).toBe(true);
    expect(r.schedule.roundRobinGames).toBe(18);
    expect(r.schedule.playoffGames).toBe(7);
  });

  it("practices fill open ice first, one per team, never overlapping that team's games", () => {
    const r = satellite(4, 3, (s) => (s.structure.practice = true));
    assertValidGrid(r);
    expect(r.schedule.practiceSessions).toBe(4);
    const practices = r.schedule.sessions.filter((s) => s.kind === "practice");
    expect(new Set(practices.flatMap((p) => p.teams)).size).toBe(4);
    expect(practices.every((p) => p.end - p.start === 60)).toBe(true);
    // Practices before playoffs: none on the schedule here, but they must follow the day ordering rule.
    expect(r.schedule.fits).toBe(true);
  });

  it("puts the All-Star game in the last block of the weekend", () => {
    const r = satellite(4, 3, (s) => {
      s.structure.allStarGame = true;
      s.structure.playoffs = "final";
    });
    assertValidGrid(r);
    const live = r.schedule.sessions.filter((s) => s.kind !== "idle");
    const lastSession = live.reduce((a, b) => (b.day > a.day || (b.day === a.day && b.start > a.start) ? b : a));
    expect(lastSession.kind).toBe("allstar");
    expect(r.schedule.totalGames).toBe(6 + 1 + 1);
  });

  it("reports how many hours the ice window is short when the weekend does not fit", () => {
    const r = satellite(8, 4, (s) => {
      s.structure.days = 1;
      s.structure.firstIce = "08:00";
      s.structure.lastIce = "12:00";
    });
    expect(r.schedule.fits).toBe(false);
    expect(r.schedule.hoursShort).toBeGreaterThan(0);
    expect(r.schedule.unscheduled.length).toBeGreaterThan(0);
    expect(r.schedule.warnings.some((w) => w.includes("does not fit"))).toBe(true);
  });

  it("allows back-to-back games when rest blocks is 0 and books less ice", () => {
    const strict = satellite(4, 4);
    const loose = satellite(4, 4, (s) => (s.structure.restBlocks = 0));
    assertValidGrid(loose);
    expect(loose.schedule.bookedHours).toBeLessThan(strict.schedule.bookedHours);
    expect(loose.schedule.sessions.some((s) => s.kind === "idle")).toBe(false);
  });
});
