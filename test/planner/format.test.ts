import { describe, expect, it } from "vitest";
import { candidatePlans, resolveFormat } from "../../src/engine/planner/format.ts";
import type { FormatPlan } from "../../src/engine/planner/types.ts";

function pairKeys(plan: FormatPlan): string[] {
  return plan.games.map((g) => [g.a, g.b].sort((x, y) => x - y).join("-"));
}

describe("format resolution", () => {
  it("3 teams cannot each play 3 games and offers single (2) or double (4) round robin", () => {
    const r = resolveFormat(3, 3);
    expect(r.exact).toBe(false);
    expect(r.notes[0]).toContain("3 x 3 must be even");
    const titles = r.alternatives.map((a) => `${a.teams}:${a.title}:${a.guaranteed.join("")}`);
    expect(titles).toContain("3:Double round robin:444");
    expect(titles.some((t) => t.startsWith("4:Single round robin:3333"))).toBe(true);
    // The plan in use is the closest workable one and is never listed twice.
    expect(r.plan.title).toBe("Single round robin");
    expect(r.alternatives.some((a) => a.teams === 3 && a.title === "Single round robin")).toBe(false);
    // "One team plays an extra game" style options are offered and flagged uneven.
    const uneven = r.alternatives.filter((a) => !a.equal);
    expect(uneven.length).toBeGreaterThan(0);
    for (const u of uneven) expect(Math.max(...u.guaranteed) - Math.min(...u.guaranteed)).toBe(1);
  });

  it("3 teams: 2 games is a single round robin, 4 games a double", () => {
    expect(resolveFormat(3, 2).plan.kind).toBe("single-rr");
    expect(resolveFormat(3, 2).exact).toBe(true);
    expect(resolveFormat(3, 4).plan.kind).toBe("double-rr");
    expect(resolveFormat(3, 4).exact).toBe(true);
  });

  it("4 teams: 3 games is a single round robin, 4 games adds a placement round", () => {
    const three = resolveFormat(4, 3);
    expect(three.plan.kind).toBe("single-rr");
    expect(three.plan.games).toHaveLength(6);
    const four = resolveFormat(4, 4);
    expect(four.exact).toBe(true);
    expect(four.plan.kind).toBe("rr-placement");
    expect(four.plan.placementRound).toBe(true);
    expect(four.plan.guaranteed).toEqual([4, 4, 4, 4]);
  });

  it("6 teams: pools of 3 plus crossovers for 3 and 4 games, full round robin for 5", () => {
    const three = resolveFormat(6, 3);
    expect(three.plan.kind).toBe("pools");
    expect(three.plan.pools).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(three.plan.games.filter((g) => g.stage === "crossover")).toHaveLength(3);
    expect(three.alternatives.some((a) => a.kind === "partial-rr" && a.exact)).toBe(true);

    const four = resolveFormat(6, 4);
    expect(four.plan.kind).toBe("pools");
    expect(four.plan.games.filter((g) => g.stage === "crossover")).toHaveLength(6);
    expect(four.plan.guaranteed).toEqual([4, 4, 4, 4, 4, 4]);

    expect(resolveFormat(6, 5).plan.kind).toBe("single-rr");
  });

  it("8 teams: two pools of 4 give 3 games; one crossover makes the 4-game guarantee", () => {
    const three = resolveFormat(8, 3);
    expect(three.plan.kind).toBe("pools");
    expect(three.plan.games).toHaveLength(12);
    const four = resolveFormat(8, 4);
    expect(four.plan.kind).toBe("pools");
    expect(four.plan.games).toHaveLength(16);
    expect(four.plan.guaranteed.every((g) => g === 4)).toBe(true);
    // Crossover opponents are all from the other pool and never repeat.
    for (const g of four.plan.games.filter((x) => x.stage === "crossover")) {
      expect(g.a < 4 && g.b >= 4).toBe(true);
    }
    expect(new Set(pairKeys(four.plan)).size).toBe(16);
  });

  it("honours a preferred format when it exists", () => {
    const r = resolveFormat(6, 3, "partial-rr");
    expect(r.plan.kind).toBe("partial-rr");
    expect(r.exact).toBe(true);
    const missing = resolveFormat(4, 3, "pools");
    expect(missing.plan.kind).toBe("single-rr");
    expect(missing.notes[0]).toContain("No pools plus crossover format");
  });

  it("gives odd team counts an equal partial round robin when the game count is even (9 teams x 4, like the 2025 Jr. High)", () => {
    const r = resolveFormat(9, 4);
    expect(r.exact).toBe(true);
    expect(r.plan.kind).toBe("partial-rr");
    expect(r.plan.games).toHaveLength(18);
    expect(r.plan.guaranteed).toEqual(new Array(9).fill(4));
    expect(new Set(pairKeys(r.plan)).size).toBe(18);
    for (const g of r.plan.games) expect(g.a).not.toBe(g.b);
    expect(resolveFormat(5, 2).exact).toBe(true);
    expect(resolveFormat(7, 4).exact).toBe(true);
  });

  it("flags an odd team-by-game product for any size", () => {
    expect(resolveFormat(5, 3).exact).toBe(false);
    expect(resolveFormat(7, 5).exact).toBe(false);
    expect(resolveFormat(5, 4).exact).toBe(true);
  });

  it("never pairs a team with itself and never repeats a pairing inside a single round robin", () => {
    for (let n = 2; n <= 12; n++) {
      for (const plan of candidatePlans(n, n - 1)) {
        for (const g of plan.games) expect(g.a).not.toBe(g.b);
        if (plan.kind === "single-rr") expect(new Set(pairKeys(plan)).size).toBe(plan.games.length);
      }
    }
  });
});
