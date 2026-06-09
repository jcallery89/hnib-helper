import { describe, expect, it } from "vitest";
import { buildPlayoffField } from "../src/engine/playoff/field.ts";
import { buildBracket } from "../src/engine/playoff/bracket.ts";
import type { Division, Game, HnibEvent, Team } from "../src/engine/types.ts";
import seed from "../src/fixtures/jrhigh-2025.json";

// Regression test against the REAL 2025 Jr. High Festival: the seeded field and
// quarterfinal matchups the engine produces must match what hnib.app actually
// scheduled that afternoon (Games 19-22).
describe("2025 Jr. High Festival - real event", () => {
  const field = buildPlayoffField(
    seed.event as HnibEvent,
    seed.divisions as Division[],
    seed.teams as Team[],
    seed.games as Game[],
    { now: () => "2026-06-09T00:00:00.000Z" },
  );

  it("seeds the field as of the completed round robin", () => {
    expect(field.seeds.map((s) => s.teamId)).toEqual([
      "t-mid", // 1 EAST winner
      "t-wes", // 2 WEST winner
      "t-bay", // 3 EAST runner-up
      "t-atl", // 4 WEST runner-up
      "t-nor", // 5 wildcard
      "t-ess", // 6 wildcard
      "t-coa", // 7 wildcard
      "t-met", // 8 wildcard
    ]);
    // Suburban (WEST, last) misses the 8-team field.
    expect(field.seeds.map((s) => s.teamId)).not.toContain("t-sub");
  });

  it("produces the quarterfinal matchups hnib.app actually ran", () => {
    const qf = buildBracket(field.seeds).filter((g) => g.round === "qf");
    const matchups = qf.map((g) => [g.highTeamId, g.lowTeamId]);
    expect(matchups).toEqual([
      ["t-mid", "t-met"], // 1v8 Middlesex - Metropolitan (Game 19)
      ["t-atl", "t-nor"], // 4v5 Atlantic - Northeast (Game 22)
      ["t-wes", "t-coa"], // 2v7 Western - Coastal (Game 20)
      ["t-bay", "t-ess"], // 3v6 Bay State - Essex (Game 21)
    ]);
  });
});
