import { describe, expect, it } from "vitest";
import { newScenario, planScenario, scheduleCsv, summaryText, validateScenario, defaultScenarios } from "../../src/engine/planner/index.ts";

const group = (r: ReturnType<typeof planScenario>, key: string) => r.pnl.groups.find((g) => g.key === key)?.amount ?? NaN;

describe("P&L", () => {
  it("prices the Virginia default case", () => {
    const r = planScenario(newScenario("satellite"));
    expect(r.pnl.rosterPerTeam).toBe(17);
    expect(r.pnl.players).toBe(68);
    expect(r.pnl.grossRevenue).toBe(20332);
    // 3% of 90% of gross, plus $0.30 on 90% of 68 transactions.
    expect(r.pnl.processingFees).toBeCloseTo(548.96 + 18.36, 2);
    expect(r.pnl.netRevenue).toBeCloseTo(20332 - 567.32, 2);
    expect(group(r, "officials")).toBe(8 * 2 * 60);
    expect(group(r, "scorekeepers")).toBe(8 * 40);
    expect(group(r, "coaches")).toBe(4 * 300);
    expect(group(r, "eventFixed")).toBe(800 + 600 + 0 + 200 + 250);
    expect(group(r, "referral")).toBe(0);
    expect(group(r, "perPlayer")).toBe(0);
    expect(group(r, "ice")).toBeCloseTo(r.schedule.bookedHours * 350, 1);
    expect(r.pnl.totalCost).toBeCloseTo(r.pnl.groups.reduce((s, g) => s + g.amount, 0), 2);
    expect(r.pnl.netProfit).toBeCloseTo(r.pnl.netRevenue - r.pnl.totalCost, 2);
    expect(r.pnl.profitPerPlayer).toBeCloseTo(r.pnl.netProfit / 68, 2);
    expect(r.pnl.marginPct).toBeGreaterThan(40);
    // Break-even price: the price at which net revenue at the target roster equals cost.
    const keep = 1 - 0.9 * 0.03;
    expect(r.pnl.breakEvenPrice).toBeCloseTo((r.pnl.totalCost + 68 * 0.9 * 0.3) / (68 * keep), 1);
    expect(r.pnl.breakEvenPlayers).toBeLessThan(68);
    expect(r.pnl.sensitivity.map((s) => s.fillRate)).toEqual([80, 90, 100, 110]);
    expect(r.pnl.sensitivity[0].players).toBe(54);
    expect(r.pnl.sensitivity[2].profit).toBe(r.pnl.netProfit);
    expect(r.pnl.sensitivity[3].profit).toBeGreaterThan(r.pnl.sensitivity[0].profit);
  });

  it("blends an early-bird price into the effective price", () => {
    const s = newScenario("satellite");
    s.pricing.earlyBirdPrice = 249;
    s.pricing.earlyBirdShare = 50;
    const r = planScenario(s);
    expect(r.pnl.effectivePrice).toBe(274);
    expect(r.pnl.grossRevenue).toBe(68 * 274);
  });

  it("applies the flat ice package, the rink minimum, referral commission, and per-player costs", () => {
    const s = newScenario("satellite");
    s.costs.icePackage = 3000;
    s.costs.referralOn = true;
    s.costs.jerseyPerPlayer = 20;
    s.costs.appProfilePerPlayer = 5;
    s.costs.insurancePerPlayer = 3;
    const r = planScenario(s);
    expect(group(r, "ice")).toBe(3000);
    expect(group(r, "referral")).toBe(68 * 25);
    expect(group(r, "perPlayer")).toBe(68 * 28);

    const m = newScenario("satellite");
    m.costs.iceMinimum = 9000;
    expect(group(planScenario(m), "ice")).toBe(9000);

    const half = newScenario("satellite");
    half.costs.referralOn = true;
    half.costs.referredPerTeam = 10;
    expect(group(planScenario(half), "referral")).toBe(40 * 25);
  });

  it("bills active ice only when asked", () => {
    const s = newScenario("satellite");
    s.costs.iceBilling = "active";
    const r = planScenario(s);
    expect(group(r, "ice")).toBeCloseTo(r.schedule.activeHours * 350, 1);
    expect(r.schedule.activeHours).toBeLessThanOrEqual(r.schedule.bookedHours);
  });

  it("has no break-even player count when each registrant loses money", () => {
    const s = newScenario("satellite");
    s.pricing.pricePerPlayer = 10;
    s.costs.jerseyPerPlayer = 50;
    const r = planScenario(s);
    expect(r.pnl.breakEvenPlayers).toBeNull();
    expect(r.pnl.netProfit).toBeLessThan(0);
  });

  it("family value reflects games, ice minutes, and price per game", () => {
    const r = planScenario(newScenario("satellite"));
    expect(r.family.guaranteedGames).toBe(4);
    expect(r.family.pricePerGame).toBe(74.75);
    expect(r.family.skaterIceMinutesPerGame).toBeCloseTo((46 * 5) / 15, 1);
    expect(r.family.goalieIceMinutesPerGame).toBe(23);
    expect(r.family.playoffOpportunity).toBe("None");
  });
});

describe("validation", () => {
  it("clamps and warns instead of producing nonsense", () => {
    const s = newScenario("satellite");
    s.structure.teams = 1;
    s.structure.forwards = 0;
    s.structure.defense = 0;
    s.structure.goalies = 0;
    s.pricing.fillRate = 120;
    s.costs.iceHourly = -5;
    s.structure.firstIce = "20:00";
    s.structure.lastIce = "08:00";
    const { scenario, warnings } = validateScenario(s);
    expect(scenario.structure.teams).toBe(2);
    expect(scenario.costs.iceHourly).toBe(0);
    expect(warnings.some((w) => w.includes("Roster is zero"))).toBe(true);
    expect(warnings.some((w) => w.includes("Fill rate is over 100"))).toBe(true);
    expect(warnings.some((w) => w.includes("Ice hourly cannot be negative"))).toBe(true);
    expect(warnings.some((w) => w.includes("First ice must be before last ice"))).toBe(true);
    // The original is untouched.
    expect(s.structure.teams).toBe(1);
  });
});

describe("exports", () => {
  it("writes a plain-text comparison and a schedule CSV", () => {
    const results = defaultScenarios().map(planScenario);
    const text = summaryText(results);
    for (const r of results) expect(text).toContain(r.scenario.name);
    expect(text).toContain("Break-even price");
    expect(text).not.toContain("\u2014");

    const csv = scheduleCsv(results[0]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Day,Start,End,Sheet,Type,Stage,Session");
    expect(lines).toHaveLength(1 + results[0].schedule.sessions.length + results[0].schedule.unscheduled.length);
    expect(lines[1]).toContain("Saturday");
  });
});
