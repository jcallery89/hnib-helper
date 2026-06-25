import type { HnibEvent } from "../types.ts";

// The seven HNIB tie-breaking rules, verbatim and shared by Jr. High and
// Sophomore. Shown on the Schedule page so staff and coaches see exactly how
// seeds are decided.
export const TIEBREAK_RULES: string[] = [
  "Points earned during round-robin games.",
  "Most Wins during round-robin games.",
  "Head to Head competition during round-robin games (only if two teams are tied; if three or more teams are tied, this step is skipped).",
  "Goals Against during the round-robin games.",
  "Goals For during the round-robin games.",
  "Flip of a coin.",
  "Director discretion.",
];

export interface PlayoffSeedingRules {
  heading: string;
  seedingLines: string[];
  tiebreakRules: string[];
}

/**
 * Build the playoff-seeding explanation for an event from its division count
 * and field size. With "top two per division" it reads like the Jr. High blurb
 * for 2 divisions and the Sophomore blurb for 3, scaling to any count.
 */
export function playoffSeedingRules(
  event: HnibEvent,
  divisionCount: number,
  fieldSize = 8,
): PlayoffSeedingRules {
  const lines: string[] = [];
  const d = divisionCount;

  if (event.seedingRule === "soph_division_winners") {
    lines.push(`The division winners are ranked ${ordinalRange(1, d)}, by the tie-breaking rules below.`);
    if (fieldSize > d) {
      lines.push(`The remaining seeds (${ordinalRange(d + 1, fieldSize)}) go to the best of the remaining teams, by the same rules.`);
    }
  } else {
    // Top two per division: winners take the first tier, runners-up the next.
    lines.push(`The winners of each division are ranked ${ordinalRange(1, d)}, by the tie-breaking rules below.`);
    const runnersEnd = Math.min(2 * d, fieldSize);
    if (runnersEnd > d) {
      lines.push(`The runner-up from each division is ranked ${ordinalRange(d + 1, runnersEnd)}, by the tie-breaking rules.`);
    }
    if (fieldSize > runnersEnd) {
      lines.push(`The ${ordinalRange(runnersEnd + 1, fieldSize)} seeds go to the best of the rest of the remaining teams, by the tie-breaking rules.`);
    }
  }

  return { heading: "Playoff Seeding", seedingLines: lines, tiebreakRules: TIEBREAK_RULES };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// "1st and 2nd"; "1st, 2nd, and 3rd"; a single "5th".
function ordinalRange(start: number, end: number): string {
  const parts: string[] = [];
  for (let n = start; n <= end; n++) parts.push(ordinal(n));
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
