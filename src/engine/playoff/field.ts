import type {
  Division,
  Game,
  HnibEvent,
  PlayoffSeed,
  Standing,
  Team,
} from "../types.ts";
import { computeStandings, hasUnequalSchedules } from "../standings.ts";
import {
  buildContext,
  rankStandings,
  tiebreakProcedure,
  type ContextOptions,
} from "../tiebreak/index.ts";

export interface PlayoffField {
  seeds: PlayoffSeed[];
  /** Division standings, ranked within each division (divisional placing). */
  divisionStandings: Map<string, Standing[]>;
  warnings: string[];
}

export interface FieldOptions extends ContextOptions {
  fieldSize?: number; // overrides event.fieldSize
}

/** The playoff field size for an event: explicit override, else event, else 8. */
export function fieldSizeFor(event: HnibEvent, override?: number): number {
  return override ?? event.fieldSize ?? 8;
}

/**
 * Build the seeded playoff field for an event.
 *
 * Seeding by rule:
 * - jrhigh_top2_per_division (Sophomore): division winners, then runners-up, then
 *   wildcards fill the rest (3 divisions -> 1-3, 4-6, then 7-8).
 * - jrhigh_winners_next_two (Jr. High): division winners take the top seeds, then
 *   the next two teams from each division are POOLED and ranked for the remaining
 *   seeds (2 divisions, 6 teams -> 1-2 winners, 3-6 the four next-up teams). No
 *   wildcards - each division is capped.
 * - soph_division_winners (legacy): winners only, then wildcards.
 * Every tier is ranked by the HNIB tie-breaking procedure.
 */
export function buildPlayoffField(
  event: HnibEvent,
  divisions: Division[],
  teams: Team[],
  games: Game[],
  opts: FieldOptions = {},
): PlayoffField {
  const fieldSize = fieldSizeFor(event, opts.fieldSize);
  const warnings: string[] = [];

  const overall = computeStandings(teams, games, event.pointSystem);
  const ctx = buildContext(overall, games, {
    pointSystem: event.pointSystem,
    teams,
    rng: opts.rng,
    now: opts.now,
  });

  // 1. Divisional placing: rank teams within each division.
  const divisionStandings = new Map<string, Standing[]>();
  const overallById = new Map(overall.map((s) => [s.teamId, s]));
  for (const div of divisions) {
    const subset = div.teamIds
      .map((id) => overallById.get(id))
      .filter((s): s is Standing => Boolean(s));
    if (hasUnequalSchedules(subset)) {
      warnings.push(
        `Division "${div.name}" has teams with different game counts; ranking compares raw totals.`,
      );
    }
    divisionStandings.set(div.id, rankStandings(subset, tiebreakProcedure, ctx));
  }

  // 2. Auto-qualifier tiers by event rule, plus whether wildcards fill the rest.
  const d = divisions.length;
  let autoTiers: string[][];
  let allowWildcards: boolean;
  if (event.seedingRule === "soph_division_winners") {
    autoTiers = [collectByRank(divisionStandings, [1])];
    allowWildcards = true;
  } else if (event.seedingRule === "jrhigh_winners_next_two") {
    // Winners first; then the next N per division (the rest of the field) pooled
    // into one ranked tier. No wildcards, so a division's lower teams cannot
    // bump another division's qualifiers.
    const perDiv = d > 0 ? Math.max(0, Math.floor((fieldSize - d) / d)) : 0;
    const nextRanks: number[] = [];
    for (let r = 2; r <= 1 + perDiv; r++) nextRanks.push(r);
    autoTiers = [collectByRank(divisionStandings, [1]), collectByRank(divisionStandings, nextRanks)];
    allowWildcards = false;
  } else {
    autoTiers = [collectByRank(divisionStandings, [1]), collectByRank(divisionStandings, [2])];
    allowWildcards = true;
  }

  const seeds: PlayoffSeed[] = [];
  const taken = new Set<string>();
  let nextSeed = 1;

  for (const tier of autoTiers) {
    if (nextSeed > fieldSize) break;
    const tierStandings = tier
      .map((id) => overallById.get(id))
      .filter((s): s is Standing => Boolean(s));
    const ranked = rankStandings(tierStandings, tiebreakProcedure, ctx);
    for (const s of ranked) {
      if (nextSeed > fieldSize) break;
      seeds.push({ seed: nextSeed++, teamId: s.teamId, source: "auto", notes: s.tieBreakNotes });
      taken.add(s.teamId);
    }
  }

  // 3. Wildcards: best of the rest across all divisions (rules that allow them).
  if (allowWildcards) {
    const rest = overall.filter((s) => !taken.has(s.teamId));
    const rankedRest = rankStandings(rest, tiebreakProcedure, ctx);
    for (const s of rankedRest) {
      if (nextSeed > fieldSize) break;
      seeds.push({
        seed: nextSeed++,
        teamId: s.teamId,
        source: "wildcard",
        notes: s.tieBreakNotes,
      });
    }
  }

  if (seeds.length < fieldSize) {
    warnings.push(
      `Only ${seeds.length} teams available for a ${fieldSize}-team field.`,
    );
  }

  return { seeds, divisionStandings, warnings };
}

function collectByRank(
  divisionStandings: Map<string, Standing[]>,
  ranks: number[],
): string[] {
  const ids: string[] = [];
  for (const standings of divisionStandings.values()) {
    for (const r of ranks) {
      const s = standings[r - 1];
      if (s) ids.push(s.teamId);
    }
  }
  return ids;
}
