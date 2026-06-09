import { describe, expect, it } from "vitest";
import { resolvePlayoffSeeding } from "../../src/engine/tiebreak/index.ts";
import { allPlayedEachOther } from "../../src/engine/tiebreak/headToHead.ts";
import { ctxFrom, rr, team } from "../helpers.ts";

describe("playoff seeding (Procedure B) - tied teams did NOT all play each other", () => {
  it("uses Most Wins as the proxy when head-to-head is unavailable", () => {
    // A and B never played. A has more wins, so Most Wins seeds A ahead.
    const teams = [team("A"), team("B"), team("X"), team("Y"), team("Z"), team("W")];
    const games = [
      rr("A", "X", 1, 0),
      rr("A", "Y", 1, 0), // A: 2 wins
      rr("B", "Z", 1, 0),
      rr("B", "W", 2, 2), // B: 1 win
    ];
    expect(allPlayedEachOther(["A", "B"], games)).toBe(false);
    const { ordered, notes } = resolvePlayoffSeeding(["A", "B"], ctxFrom(teams, games));
    expect(ordered).toEqual(["A", "B"]);
    expect(notes.get("A")?.[0].criterion).toBe("Most Wins");
  });
});
