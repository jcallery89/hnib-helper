import { describe, expect, it } from "vitest";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { App } from "../src/app.tsx";
import { BracketSvg } from "../src/render/bracket/BracketSvg.tsx";
import { buildPlayoffField } from "../src/engine/playoff/field.ts";
import { buildBracket } from "../src/engine/playoff/bracket.ts";
import type { Division, Game, HnibEvent, Team } from "../src/engine/types.ts";
import seed from "../src/fixtures/hnib-2025-seed.json";

describe("render layer", () => {
  it("renders the full App without throwing", () => {
    const html = renderToString(h(App, {}));
    expect(html).toContain("Jr. High Festival");
    expect(html).toContain("Standings");
  });

  it("renders a bracket SVG with the seeded teams and a champion placeholder", () => {
    const field = buildPlayoffField(
      seed.event as HnibEvent,
      seed.divisions as Division[],
      seed.teams as Team[],
      seed.games as Game[],
      { now: () => "2026-06-09T00:00:00.000Z" },
    );
    const bracket = buildBracket(field.seeds);
    const svg = renderToString(
      h(BracketSvg, {
        width: 1080,
        height: 1350,
        title: "Jr. High Festival - Playoffs",
        bracket,
        nameById: (id: string) => seed.teams.find((t) => t.id === id)?.name ?? id,
      }),
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("Andover"); // seed 1
    expect(svg).toContain("QUARTERFINALS");
    expect(svg).toContain("TBD"); // champion not decided yet
  });
});
