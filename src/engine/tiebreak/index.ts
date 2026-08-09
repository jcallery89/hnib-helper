import type { Game, PointSystem, Standing, Team } from "../types.ts";
import { DEFAULT_POINT_SYSTEM } from "../pointSystem.ts";
import {
  coinFlip,
  headToHead,
  leastGoalsAllowed,
  mostGoalsFor,
  mostWins,
  type ResolveContext,
} from "./criteria.ts";
import { orderGroup, type Procedure, type ResolveResult } from "./resolver.ts";

export type { ResolveContext } from "./criteria.ts";
export type { ResolveResult } from "./resolver.ts";

/**
 * The single HNIB tie-breaking procedure (same for Jr. High and Sophomore),
 * applied to teams tied on points after round-robin play:
 *   1. Points (the grouping; tied teams share it)
 *   2. Most Wins
 *   3. Head-to-Head - ONLY when exactly two teams are tied (skipped for 3+)
 *   4. Goals Against (fewest)
 *   5. Goals For (most)
 *   6. Coin flip
 *   7. Director discretion (a manual override, not automated here)
 * When a team breaks out of a 3+ tie the procedure restarts for the rest, so a
 * group that narrows to two teams gets the head-to-head step it earlier skipped.
 */
export const tiebreakProcedure: Procedure = () => [
  mostWins,
  headToHead,
  leastGoalsAllowed,
  mostGoalsFor,
  coinFlip,
];

/**
 * The Girls Major Showcase order, confirmed by JC June 2026: Head-to-Head comes
 * FIRST (still only when exactly two teams are tied), then Most Wins, fewest
 * Goals Against, most Goals For, coin toss. The restart-on-breakout behavior is
 * shared, so a 3+ group that narrows to two teams gets head-to-head next.
 */
export const girlsMajorTiebreakProcedure: Procedure = () => [
  headToHead,
  mostWins,
  leastGoalsAllowed,
  mostGoalsFor,
  coinFlip,
];

/** The procedure an event uses, by its (optional) tiebreakRule. */
export function procedureFor(rule?: import("../types.ts").TiebreakRule): Procedure {
  return rule === "girls_major" ? girlsMajorTiebreakProcedure : tiebreakProcedure;
}

export interface ContextOptions {
  pointSystem?: PointSystem;
  rng?: () => number;
  now?: () => string;
  teams?: Team[]; // used to resolve names for the decision log
}

/** Build a ResolveContext from standings and games, with sensible defaults. */
export function buildContext(
  standings: Standing[],
  games: Game[],
  opts: ContextOptions = {},
): ResolveContext {
  const byId = new Map(standings.map((s) => [s.teamId, s]));
  const names = new Map((opts.teams ?? []).map((t) => [t.id, t.name]));
  return {
    standings: byId,
    games,
    pointSystem: opts.pointSystem ?? DEFAULT_POINT_SYSTEM,
    rng: opts.rng ?? Math.random,
    now: opts.now ?? (() => new Date().toISOString()),
    name: (id) => names.get(id) ?? id,
  };
}

/** Resolve a tied group with the unified HNIB tie-breaking procedure. */
export function resolveTiebreak(group: string[], ctx: ResolveContext): ResolveResult {
  return orderGroup(group, tiebreakProcedure, ctx);
}

/**
 * Rank a full set of standings: primary sort is points (desc); teams tied on
 * points are resolved by the given procedure. Mutates a copy and returns
 * ranked standings (rank set, tieBreakNotes attached). Inputs are not mutated.
 */
export function rankStandings(
  standings: Standing[],
  procedure: Procedure,
  ctx: ResolveContext,
): Standing[] {
  // Group by points.
  const byPoints = new Map<number, string[]>();
  for (const s of standings) {
    const arr = byPoints.get(s.points) ?? [];
    arr.push(s.teamId);
    byPoints.set(s.points, arr);
  }

  const orderedIds: string[] = [];
  const allNotes = new Map<string, import("../types.ts").TieBreakNote[]>();
  const pointBuckets = [...byPoints.keys()].sort((a, b) => b - a);
  for (const pts of pointBuckets) {
    const group = byPoints.get(pts) as string[];
    const { ordered, notes } = orderGroup(group, procedure, ctx);
    orderedIds.push(...ordered);
    for (const [id, n] of notes) allNotes.set(id, n);
  }

  const byId = new Map(standings.map((s) => [s.teamId, s]));
  return orderedIds.map((id, idx) => {
    const s = byId.get(id) as Standing;
    return { ...s, rank: idx + 1, tieBreakNotes: allNotes.get(id) ?? [] };
  });
}
