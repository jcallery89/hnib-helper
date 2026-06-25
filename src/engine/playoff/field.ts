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
  fieldSize?: number; // default 8
}

/**
 * Build the seeded playoff field for an event.
 *
 * Seeding: the division winners take the top tier of seeds, the runners-up the
 * next tier, each tier ranked among itself by the HNIB tie-breaking procedure
 * (so 2 divisions -> seeds 1-2 then 3-4; 3 divisions -> 1-3 then 4-6). Wildcards
 * are the best of the rest across all divisions, by the same procedure.
 */
export function buildPlayoffField(
  event: HnibEvent,
  divisions: Division[],
  teams: Team[],
  games: Game[],
  opts: FieldOptions = {},
): PlayoffField {
  const fieldSize = opts.fieldSize ?? 8;
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

  // 2. Auto-qualifier tiers by event rule.
  const autoTiers: string[][] =
    event.seedingRule === "soph_division_winners"
      ? [collectByRank(divisionStandings, [1])]
      : [collectByRank(divisionStandings, [1]), collectByRank(divisionStandings, [2])];

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

  // 3. Wildcards: best of the rest across all divisions.
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
