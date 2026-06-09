import { describe, expect, it } from "vitest";
import { resolveDivisional } from "../../src/engine/tiebreak/index.ts";
import { ctxFrom, rr, seqRng, team } from "../helpers.ts";

describe("coin flip", () => {
  it("resolves a full deadlock and records a timestamp", () => {
    // P and Q are identical: head-to-head tie, equal GA, equal +/-, equal wins.
    const teams = [team("P"), team("Q"), team("F"), team("G")];
    const games = [
      rr("P", "Q", 1, 1),
      rr("P", "F", 2, 1), // P: GA 2, +/- +1, 1 win
      rr("Q", "G", 2, 1), // Q: GA 2, +/- +1, 1 win
    ];
    const rng = seqRng([0.9, 0.1]); // P draws higher than Q
    const now = () => "2026-06-09T12:00:00.000Z";
    const { ordered, notes } = resolveDivisional(["P", "Q"], ctxFrom(teams, games, rng, now));

    expect(ordered).toEqual(["P", "Q"]);
    const note = notes.get("P")?.[0];
    expect(note?.criterion).toBe("Coin flip");
    expect(note?.timestamp).toBe("2026-06-09T12:00:00.000Z");
  });
});
