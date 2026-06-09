import { describe, expect, it } from "vitest";
import { resolvePlayoffSeeding } from "../../src/engine/tiebreak/index.ts";
import { allPlayedEachOther } from "../../src/engine/tiebreak/headToHead.ts";
import { ctxFrom, rr, team } from "../helpers.ts";

describe("playoff seeding (Procedure B) - tied teams all played each other", () => {
  it("falls to Least Goals Allowed after a head-to-head deadlock (no Most Wins)", () => {
    const teams = [team("C"), team("D"), team("X"), team("Y")];
    const games = [
      rr("C", "D", 2, 2), // they played, head-to-head tied
      rr("C", "X", 1, 0), // C GA 2
      rr("D", "Y", 4, 4), // D GA 6
    ];
    expect(allPlayedEachOther(["C", "D"], games)).toBe(true);
    const { ordered, notes } = resolvePlayoffSeeding(["C", "D"], ctxFrom(teams, games));
    expect(ordered).toEqual(["C", "D"]);
    // Most Wins is NOT used in this branch; Least Goals Allowed decides.
    expect(notes.get("C")?.[0].criterion).toBe("Least Goals Allowed");
  });
});
