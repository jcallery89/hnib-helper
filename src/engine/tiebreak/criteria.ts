import type { Game, PointSystem, Standing } from "../types.ts";
import { headToHeadPoints } from "./headToHead.ts";

export interface ResolveContext {
  /** Overall standings by teamId (full schedule, not restricted to a group). */
  standings: Map<string, Standing>;
  /** All games, used to build head-to-head mini-tables. */
  games: Game[];
  pointSystem: PointSystem;
  /** Injectable RNG so coin flips are deterministic in tests, random in app. */
  rng: () => number;
  /** Injectable clock so coin-flip timestamps are stable in tests. */
  now: () => string;
  /** Human-readable team name; defaults to the id when not provided. */
  name: (teamId: string) => string;
}

/**
 * A tiebreaker criterion. Higher `score` ranks better. `format` renders the
 * value for the explainable decision log. Head-to-head is recomputed per group.
 */
export interface Criterion {
  key: string;
  label: string;
  random?: boolean;
  score(teamId: string, ctx: ResolveContext, group: string[]): number;
  format(teamId: string, ctx: ResolveContext, group: string[]): string;
}

export const headToHead: Criterion = {
  key: "h2h",
  label: "Head-to-Head",
  score(teamId, ctx, group) {
    return headToHeadPoints(group, ctx.games, ctx.pointSystem).get(teamId) ?? 0;
  },
  format(teamId, ctx, group) {
    return String(headToHeadPoints(group, ctx.games, ctx.pointSystem).get(teamId) ?? 0);
  },
};

// Fewer goals allowed ranks better, so the score negates GA. This criterion
// intentionally ranks AHEAD of plus/minus (defense-first ordering).
export const leastGoalsAllowed: Criterion = {
  key: "leastGA",
  label: "Least Goals Allowed",
  score(teamId, ctx) {
    return -(ctx.standings.get(teamId)?.ga ?? 0);
  },
  format(teamId, ctx) {
    return String(ctx.standings.get(teamId)?.ga ?? 0);
  },
};

export const bestPlusMinus: Criterion = {
  key: "plusMinus",
  label: "Best Plus/Minus",
  score(teamId, ctx) {
    return ctx.standings.get(teamId)?.plusMinus ?? 0;
  },
  format(teamId, ctx) {
    const pm = ctx.standings.get(teamId)?.plusMinus ?? 0;
    return pm > 0 ? `+${pm}` : String(pm);
  },
};

export const mostWins: Criterion = {
  key: "mostWins",
  label: "Most Wins",
  score(teamId, ctx) {
    return ctx.standings.get(teamId)?.w ?? 0;
  },
  format(teamId, ctx) {
    return String(ctx.standings.get(teamId)?.w ?? 0);
  },
};

// Coin flip: assigns each team a stable random key for this resolution pass.
// Always separates teams (last-resort criterion) and records a timestamp.
export const coinFlip: Criterion = {
  key: "coinFlip",
  label: "Coin flip",
  random: true,
  score(teamId, ctx, group) {
    return coinFlipDraws(ctx, group).get(teamId) ?? 0;
  },
  format(teamId, ctx, group) {
    return coinFlipDraws(ctx, group).get(teamId)?.toFixed(4) ?? "0";
  },
};

// Cache one draw per (group) pass so score() and format() agree within a call.
const drawCache = new WeakMap<ResolveContext, Map<string, Map<string, number>>>();
function coinFlipDraws(ctx: ResolveContext, group: string[]): Map<string, number> {
  let perCtx = drawCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    drawCache.set(ctx, perCtx);
  }
  const cacheKey = [...group].sort().join("|");
  let draws = perCtx.get(cacheKey);
  if (!draws) {
    draws = new Map();
    for (const id of group) draws.set(id, ctx.rng());
    perCtx.set(cacheKey, draws);
  }
  return draws;
}
