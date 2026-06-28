import type { HnibEvent } from "../types.ts";
import { playoffSeedingRules, TIEBREAK_RULES } from "./rules.ts";

// Content for an on-brand shareable graphic (Instagram). Pure data so it can be
// unit-tested and rendered the same way for preview and PNG export.
export interface ShareCardItem {
  badge?: string; // small number/letter in a circle (seed number, list index)
  text: string;
  color?: string; // hex fill for a team-color bubble behind the text
}

export interface ShareCardContent {
  kicker: string; // small label above the title (event + context)
  title: string;
  intro: string[]; // short paragraphs, each wrapped by the renderer
  items: ShareCardItem[];
  footnote?: string;
}

export interface SeedLine {
  seed: number;
  name: string;
  color?: string; // team primary color, when known
}

/**
 * "Playoff Seeding" card. Reuses the same seeding explanation shown on the
 * Schedule page (scaled to the event's division count) and, when the field has
 * been seeded, lists the current seeds so the graphic doubles as a live update.
 */
export function seedingCardContent(
  event: HnibEvent,
  divisionCount: number,
  seeds: SeedLine[] = [],
  fieldSize = 8,
): ShareCardContent {
  const rules = playoffSeedingRules(event, divisionCount, fieldSize);
  const intro = [...rules.seedingLines];
  if (fieldSize === 8) {
    intro.push("Eight-team single elimination. Quarterfinals: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6.");
  }
  const items = [...seeds]
    .sort((a, b) => a.seed - b.seed)
    .slice(0, fieldSize)
    .map((s) => ({ badge: String(s.seed), text: s.name, color: s.color }));
  return {
    kicker: `${event.name} - Playoffs`,
    title: "Playoff Seeding",
    intro,
    items,
    footnote: items.length ? "Seeding follows the tiebreakers and updates as results come in." : undefined,
  };
}

/** "Tiebreakers" card: the seven-step procedure, numbered. */
export function tiebreakCardContent(event: HnibEvent): ShareCardContent {
  return {
    kicker: `${event.name} - Tiebreakers`,
    title: "Tiebreakers",
    intro: ["How teams tied on points are ranked, and how every seeding and placing step is decided."],
    items: TIEBREAK_RULES.map((r, i) => ({ badge: String(i + 1), text: r })),
    footnote: "Head to head applies only when exactly two teams are tied. Every decision is logged.",
  };
}

/**
 * A free-form announcement / scenario card from operator-entered text. Bullets
 * are split on newlines. Used for quick posts like clinch and elimination
 * scenarios while the automated version is built.
 */
export function announcementCardContent(
  event: HnibEvent,
  title: string,
  body: string,
  bullets: string,
): ShareCardContent {
  const intro = body
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const items = bullets
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
  return {
    kicker: `${event.name} - Update`,
    title: title.trim() || "Tournament Update",
    intro,
    items,
  };
}
