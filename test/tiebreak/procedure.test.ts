import { describe, expect, it } from "vitest";
import { resolveTiebreak } from "../../src/engine/tiebreak/index.ts";
import { headToHead } from "../../src/engine/tiebreak/criteria.ts";
import { ctxFrom, rr, team } from "../helpers.ts";

// The single HNIB procedure for teams tied on points:
//   Most Wins -> Head-to-Head (2 teams only) -> Goals Against -> Goals For ->
//   coin flip -> director discretion.
describe("unified HNIB tie-breaking procedure", () => {
  it("breaks a points tie by Most Wins first", () => {
    // A and B both reach the group tied on points; B has more wins.
    const teams = [team("A"), team("B"), team("X"), team("Y"), team("Z"), team("W")];
    const games = [
      rr("A", "B", 1, 0), // A beat B head-to-head...
      rr("A", "X", 1, 0), // A: 2 wins
      rr("B", "Y", 1, 0),
      rr("B", "Z", 1, 0),
      rr("B", "W", 1, 0), // B: 3 wins
    ];
    const { ordered, notes } = resolveTiebreak(["A", "B"], ctxFrom(teams, games));
    // ...but Most Wins outranks head-to-head, so B is first.
    expect(ordered).toEqual(["B", "A"]);
    expect(notes.get("B")?.[0].criterion).toBe("Most Wins");
  });

  it("uses head-to-head when exactly two teams are tied on wins", () => {
    const teams = [team("A"), team("B"), team("X"), team("Y"), team("Z")];
    const games = [
      rr("A", "B", 1, 0), // A beat B
      rr("A", "X", 2, 0), // A: 2 wins
      rr("B", "Y", 1, 0),
      rr("B", "Z", 1, 0), // B: 2 wins (tied with A)
    ];
    const { ordered, notes } = resolveTiebreak(["A", "B"], ctxFrom(teams, games));
    expect(ordered).toEqual(["A", "B"]);
    expect(notes.get("A")?.[0].criterion).toBe("Head-to-Head");
  });

  it("skips head-to-head for three or more tied teams and uses Goals Against", () => {
    // Each team has one win; goals against are distinct.
    const teams = [team("A"), team("B"), team("C"), team("X"), team("Y"), team("Z")];
    const games = [
      rr("A", "X", 1, 0), // A: GA 0
      rr("B", "Y", 2, 1), // B: GA 1
      rr("C", "Z", 3, 2), // C: GA 2
    ];
    const ctx = ctxFrom(teams, games);
    // The head-to-head criterion is a no-op for a 3-team group.
    expect(headToHead.score("A", ctx, ["A", "B", "C"])).toBe(0);

    const { ordered, notes } = resolveTiebreak(["A", "B", "C"], ctx);
    expect(ordered).toEqual(["A", "B", "C"]);
    expect(notes.get("A")?.[0].criterion).toBe("Goals Against");
  });

  it("breaks a Goals Against tie by Goals For", () => {
    // A and B: one win each, same goals against, A scored more.
    const teams = [team("A"), team("B"), team("X"), team("Y")];
    const games = [
      rr("A", "X", 3, 1), // A: GA 1, GF 3
      rr("B", "Y", 2, 1), // B: GA 1, GF 2 (never played A -> no head-to-head)
    ];
    const { ordered, notes } = resolveTiebreak(["A", "B"], ctxFrom(teams, games));
    expect(ordered).toEqual(["A", "B"]);
    expect(notes.get("A")?.[0].criterion).toBe("Goals For");
  });

  it("restarts after a breakout so the final two teams get head-to-head", () => {
    // A has the most wins and breaks out; B and C then resolve head-to-head.
    const teams = [team("A"), team("B"), team("C"), team("X"), team("Y"), team("Z"), team("W"), team("V")];
    const games = [
      rr("A", "X", 1, 0),
      rr("A", "Y", 1, 0),
      rr("A", "Z", 1, 0), // A: 3 wins
      rr("B", "C", 1, 0), // B beat C
      rr("B", "W", 1, 0), // B: 2 wins
      rr("C", "V", 1, 0),
      rr("C", "X", 1, 0), // C: 2 wins
    ];
    const { ordered, notes } = resolveTiebreak(["A", "B", "C"], ctxFrom(teams, games));
    expect(ordered).toEqual(["A", "B", "C"]);
    expect(notes.get("A")?.some((n) => n.criterion === "Most Wins")).toBe(true);
    expect(notes.get("B")?.some((n) => n.criterion === "Head-to-Head")).toBe(true);
  });
});
