import type { Game, PointSystem, Standing, Team } from "../types.ts";
import { DEFAULT_POINT_SYSTEM } from "../pointSystem.ts";
import {
  bestPlusMinus,
  coinFlip,
  headToHead,
  leastGoalsAllowed,
  mostWins,
  type Criterion,
  type ResolveContext,
} from "./criteria.ts";
import { allPlayedEachOther } from "./headToHead.ts";
import { orderGroup, type Procedure, type ResolveResult } from "./resolver.ts";

export type { ResolveContext } from "./criteria.ts";
export type { ResolveResult } from "./resolver.ts";

/**
 * Procedure A - DIVISIONAL PLACING. Teams in a division have all played each
 * other, so head-to-head always applies:
 *   Head-to-Head -> Least Goals Allowed -> Best Plus/Minus -> Coin flip
 */
export const divisionalProcedure: Procedure = () => [
  headToHead,
  leastGoalsAllowed,
  bestPlusMinus,
  coinFlip,
];

/**
 * Procedure B - PLAYOFF SEEDING. Branches on whether the tied teams all played
 * each other. Re-evaluated per (sub)group:
 *   all played:    Head-to-Head -> Least Goals Allowed -> Best Plus/Minus -> Coin flip
 *   not all played: Most Wins   -> Least Goals Allowed -> Best Plus/Minus -> Coin flip
 */
export const playoffSeedingProcedure: Procedure = (group, ctx): Criterion[] => {
  const base = [leastGoalsAllowed, bestPlusMinus, coinFlip];
  return allPlayedEachOther(group, ctx.games)
    ? [headToHead, ...base]
    : [mostWins, ...base];
};

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

export function resolveDivisional(group: string[], ctx: ResolveContext): ResolveResult {
  return orderGroup(group, divisionalProcedure, ctx);
}

export function resolvePlayoffSeeding(group: string[], ctx: ResolveContext): ResolveResult {
  return orderGroup(group, playoffSeedingProcedure, ctx);
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
