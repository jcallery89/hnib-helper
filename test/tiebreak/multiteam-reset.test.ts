import { describe, expect, it } from "vitest";
import { resolveDivisional } from "../../src/engine/tiebreak/index.ts";
import { ctxFrom, rr, team } from "../helpers.ts";

describe("multi-team tie with restart", () => {
  it("places the team that breaks out, then restarts the procedure for the rest", () => {
    // Head-to-head mini-table among {A,B,C}: A beats both (breaks out top),
    // B and C tie head-to-head. Once A is placed, {B,C} restart from the top:
    // their head-to-head is still tied, so Least Goals Allowed decides.
    const teams = [team("A"), team("B"), team("C"), team("F")];
    const games = [
      rr("A", "B", 2, 1),
      rr("A", "C", 3, 1),
      rr("B", "C", 2, 2), // B/C deadlocked head-to-head
      rr("A", "F", 1, 0), // A GA 2
      rr("B", "F", 5, 0), // B GA 4 (1 from A, 2 from C, 0 here... see totals)
      rr("C", "F", 0, 4), // C GA 9
    ];
    const { ordered, notes } = resolveDivisional(["A", "B", "C"], ctxFrom(teams, games));
    expect(ordered).toEqual(["A", "B", "C"]);
    // A broke out via head-to-head.
    expect(notes.get("A")?.some((n) => n.criterion === "Head-to-Head")).toBe(true);
    // B beat C on the restart via Least Goals Allowed, not head-to-head.
    expect(notes.get("B")?.some((n) => n.criterion === "Least Goals Allowed")).toBe(true);
  });
});
