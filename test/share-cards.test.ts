import { describe, expect, it } from "vitest";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { seedingCardContent, tiebreakCardContent, announcementCardContent, playoffPictureCardContent } from "../src/engine/playoff/shareCards.ts";
import { ShareCard } from "../src/render/share/ShareCard.tsx";
import type { HnibEvent } from "../src/engine/types.ts";

const event: HnibEvent = {
  id: "e1", name: "Sophomore Festival", year: 2026, venues: [], format: "festival",
  hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { win: 2, tie: 1, loss: 0 },
};

describe("seedingCardContent", () => {
  it("scales the explanation to the division count and lists current seeds", () => {
    const seeds = [
      { seed: 2, name: "Coastal" },
      { seed: 1, name: "Atlantic" },
    ];
    const c = seedingCardContent(event, 3, seeds);
    expect(c.title).toBe("Playoff Seeding");
    expect(c.intro.join(" ")).toContain("1st, 2nd, and 3rd"); // winners tier for 3 divisions
    expect(c.intro.join(" ")).toContain("1 vs 8"); // 8-team matchups
    // seeds are sorted and badged
    expect(c.items.map((i) => i.badge)).toEqual(["1", "2"]);
    expect(c.items[0].text).toBe("Atlantic");
  });

  it("omits the seed list (and footnote) before the field is seeded", () => {
    const c = seedingCardContent(event, 2, []);
    expect(c.items).toHaveLength(0);
    expect(c.footnote).toBeUndefined();
  });
});

describe("tiebreakCardContent", () => {
  it("lists the seven steps, numbered", () => {
    const c = tiebreakCardContent(event);
    expect(c.items).toHaveLength(7);
    expect(c.items.map((i) => i.badge)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(c.items[0].text).toContain("Points");
  });
});

describe("announcementCardContent", () => {
  it("splits body paragraphs and bullets on newlines", () => {
    const c = announcementCardContent(event, "Elimination Watch", "Line one.\n\nLine two.", "Clinch with a win\nOut with a loss");
    expect(c.title).toBe("Elimination Watch");
    expect(c.intro).toEqual(["Line one.", "Line two."]);
    expect(c.items.map((i) => i.text)).toEqual(["Clinch with a win", "Out with a loss"]);
  });

  it("falls back to a default title when blank", () => {
    expect(announcementCardContent(event, "  ", "", "").title).toBe("Tournament Update");
  });
});

describe("playoffPictureCardContent", () => {
  it("groups current seeds, in the hunt, and eliminated under headings", () => {
    const c = playoffPictureCardContent(
      event,
      [{ seed: 1, name: "Atlantic", color: "#111111" }],
      [{ name: "Western", color: "#222222" }],
      [{ name: "Coastal", color: "#d6453d" }],
      true,
      8,
    );
    const headings = c.items.filter((i) => i.heading).map((i) => i.text);
    expect(headings).toEqual(["Current Seeds", "In the Hunt", "Eliminated"]);
    expect(c.items.find((i) => i.text === "Western" && !i.heading)).toBeTruthy();
  });

  it("omits the In the Hunt heading when nobody is in the hunt", () => {
    const c = playoffPictureCardContent(event, [{ seed: 1, name: "Atlantic" }], [], [], true, 8);
    expect(c.items.filter((i) => i.heading).map((i) => i.text)).toEqual(["Current Seeds"]);
  });
});

describe("ShareCard render", () => {
  it("renders an SVG containing the title and items without throwing", () => {
    const svg = renderToString(h(ShareCard, { width: 1080, height: 1350, content: tiebreakCardContent(event) }));
    expect(svg).toContain("<svg");
    expect(svg).toContain("TIEBREAKERS");
    expect(svg).toContain("GET SEEN. GET RECRUITED.");
  });
});
