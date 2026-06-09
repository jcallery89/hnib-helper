import { describe, expect, it } from "vitest";
import { resolveDivisional } from "../../src/engine/tiebreak/index.ts";
import { ctxFrom, rr, team } from "../helpers.ts";

describe("divisional placing (Procedure A)", () => {
  it("uses head-to-head first when tied teams played", () => {
    const teams = [team("A"), team("B")];
    const games = [rr("A", "B", 3, 1)];
    const { ordered, notes } = resolveDivisional(["A", "B"], ctxFrom(teams, games));
    expect(ordered).toEqual(["A", "B"]);
    expect(notes.get("A")?.[0].criterion).toBe("Head-to-Head");
  });

  it("ranks Least Goals Allowed AHEAD of Plus/Minus when head-to-head is tied", () => {
    // C and D tie head-to-head. C allows fewer goals; D has the better +/-.
    // Defense-first ordering must put C ahead.
    const teams = [team("C"), team("D"), team("X"), team("Y")];
    const games = [
      rr("C", "D", 2, 2), // head-to-head deadlock
      rr("C", "X", 1, 0), // C: GA 2, +/- +1
      rr("D", "Y", 9, 3), // D: GA 5, +/- +6
    ];
    const { ordered, notes } = resolveDivisional(["C", "D"], ctxFrom(teams, games));
    expect(ordered).toEqual(["C", "D"]);
    expect(notes.get("C")?.[0].criterion).toBe("Least Goals Allowed");
    expect(notes.get("C")?.[0].text).toContain("(2 vs 5)");
  });
});
