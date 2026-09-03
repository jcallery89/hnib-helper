import { describe, expect, it } from "vitest";
import { calibrateFromActuals, emptyActuals, newScenario, planScenario } from "../../src/engine/planner/index.ts";
import { structureFromEvent } from "../../src/io/plannerFromEvent.ts";
import type { Dataset } from "../../src/io/dataset.ts";
import fixture from "../../src/fixtures/jrhigh-2025.json";

describe("model vs actual", () => {
  it("is absent until an actual figure is entered", () => {
    const s = newScenario("satellite");
    expect(planScenario(s).actuals).toBeNull();
    s.actuals = emptyActuals();
    expect(planScenario(s).actuals).toBeNull();
  });

  it("lines up the books against the model and backs out unit rates", () => {
    const s = newScenario("ma-showcase");
    s.actuals = { ...emptyActuals(), players: 130, grossRevenue: 60000, processingFees: 1500, ice: 12000, officials: 3000, travel: 500 };
    const r = planScenario(s);
    const cmp = r.actuals;
    expect(cmp).not.toBeNull();
    const line = (k: string) => cmp!.lines.find((l) => l.key === k)!;
    expect(line("grossRevenue").actual).toBe(60000);
    expect(line("grossRevenue").variance).toBeCloseTo(60000 - r.pnl.grossRevenue, 2);
    expect(line("netRevenue").actual).toBe(58500);
    // Costs sum only the lines that were entered; fixed costs likewise.
    expect(line("eventFixed").actual).toBe(500);
    expect(line("totalCost").actual).toBe(12000 + 3000 + 500);
    expect(line("netProfit").actual).toBe(58500 - 15500);
    expect(line("scorekeepers").actual).toBeNull();
    const rate = (k: string) => cmp!.rates.find((x) => x.key === k)!;
    expect(rate("price").value).toBeCloseTo(60000 / 130, 2);
    expect(rate("iceHourly").value).toBeCloseTo(12000 / r.schedule.bookedHours, 2);
    expect(rate("refRate").value).toBeCloseTo(3000 / (r.schedule.totalGames * 2), 2);
    expect(cmp!.rates.some((x) => x.key === "scorekeeperPerGame")).toBe(false);
  });

  it("calibrates a scenario so the model reproduces the books", () => {
    const s = newScenario("ma-showcase");
    s.actuals = { ...emptyActuals(), players: 130, grossRevenue: 60000, processingFees: 1500, ice: 12000, officials: 3000, scorekeepers: 900, coaches: 2400, travel: 500, misc: 100 };
    const before = planScenario(s);
    const { scenario, changes } = calibrateFromActuals(s, before);
    expect(changes.length).toBeGreaterThan(5);
    const after = planScenario(scenario);
    expect(after.pnl.players).toBe(130);
    expect(after.pnl.grossRevenue).toBeCloseTo(60000, 0);
    expect(after.pnl.processingFees).toBeCloseTo(1500, 0);
    expect(after.pnl.groups.find((g) => g.key === "ice")!.amount).toBeCloseTo(12000, 0);
    expect(after.pnl.groups.find((g) => g.key === "officials")!.amount).toBeCloseTo(3000, 0);
    expect(after.pnl.groups.find((g) => g.key === "coaches")!.amount).toBeCloseTo(2400, 0);
    expect(scenario.costs.travel).toBe(500);
    expect(scenario.costs.misc).toBe(100);
    // Untouched lines keep their profile defaults.
    expect(scenario.costs.marketing).toBe(200);
    // The original scenario is not mutated.
    expect(s.costs.iceHourly).toBe(350);
  });

  it("does not trust headcount from half-synced rosters", () => {
    const derived = structureFromEvent(fixture as unknown as Dataset);
    expect(derived.link.teams).toHaveLength(9);
    expect(derived.rosterComplete).toBe(false);
    expect(derived.fillRate).toBeNull();
    expect(derived.structure.forwards).toBeUndefined();
    expect(derived.notes.some((n) => n.includes("Rosters look incomplete"))).toBe(true);
  });

  it("carries real team names, roster counts, and coaches from a synced event into the schedule", () => {
    const base = fixture as unknown as Dataset;
    // Give every team a full roster: 9 F / 6 D / 2 G.
    const players = base.teams.flatMap((t, ti) =>
      Array.from({ length: 17 }, (_, i) => ({
        id: `${t.id}-p${i}`,
        eventId: base.event.id,
        teamId: t.id,
        jersey: i + 1,
        firstName: "P",
        lastName: `${ti}-${i}`,
        position: (i < 9 ? "F" : i < 15 ? "D" : "G") as "F" | "D" | "G",
      })),
    );
    const derived = structureFromEvent({ ...base, players, teams: base.teams.map((t, i) => ({ ...t, coach: i % 2 ? "Coach" : undefined })) });
    expect(derived.rosterComplete).toBe(true);
    expect(derived.link.players).toBe(9 * 17);
    expect(derived.link.coachesNamed).toBe(4);
    expect(derived.link.teams[0].name).toBeTruthy();
    expect(derived.link.players).toBe(derived.link.teams.reduce((s, t) => s + t.players, 0));
    expect(derived.structure.forwards).toBe(9);
    expect(derived.fillRate).toBe(100);

    const s = newScenario("ma-festival", `${derived.link.eventName} as run`);
    Object.assign(s.structure, derived.structure);
    s.pricing.fillRate = derived.fillRate as number;
    s.event = derived.link;
    const r = planScenario(s);
    expect(r.schedule.teamNames).toEqual(derived.link.teams.map((t) => t.name));
    const firstGame = r.schedule.sessions.find((x) => x.kind === "game")!;
    expect(firstGame.label).toContain(derived.link.teams[firstGame.teams[0]].name);
    expect(firstGame.label).not.toContain("Team 1 vs");
    expect(r.pnl.players).toBe(derived.link.players);
  });
});
