import type { TieBreakNote } from "../types.ts";
import type { Criterion, ResolveContext } from "./criteria.ts";

export interface ResolveResult {
  ordered: string[]; // teamIds, best first
  notes: Map<string, TieBreakNote[]>; // decisions attached to the winning team(s)
}

/**
 * A procedure decides, for a given group, which ordered list of criteria to
 * apply. Procedure A (divisional) always uses the same list; procedure B
 * (playoff seeding) branches on whether the group all played each other, so it
 * is a function of the group.
 */
export type Procedure = (group: string[], ctx: ResolveContext) => Criterion[];

const EPS = 1e-9;

/**
 * Fully order a group of teams that are tied on points.
 *
 * For each criterion in order: split the group into buckets of equal value
 * (best first). If a criterion separates the group, every team that breaks out
 * into its own bucket is placed, and any bucket that is still tied RESTARTS the
 * whole procedure from the top (head-to-head is recomputed for the smaller
 * group). Every separation is logged so the result is explainable.
 */
export function orderGroup(
  group: string[],
  procedure: Procedure,
  ctx: ResolveContext,
): ResolveResult {
  const notes = new Map<string, TieBreakNote[]>();
  const ordered = orderRecursive(group, procedure, ctx, notes);
  return { ordered, notes };
}

function orderRecursive(
  group: string[],
  procedure: Procedure,
  ctx: ResolveContext,
  notes: Map<string, TieBreakNote[]>,
): string[] {
  if (group.length <= 1) return [...group];

  const criteria = procedure(group, ctx);
  for (const criterion of criteria) {
    const buckets = bucketByScore(group, criterion, ctx);
    if (buckets.length <= 1) continue; // criterion did not separate anyone

    logSeparation(buckets, criterion, ctx, notes);

    const result: string[] = [];
    for (const bucket of buckets) {
      if (bucket.ids.length === 1) {
        result.push(bucket.ids[0]);
      } else {
        // Restart the full procedure for the remaining tied teams.
        result.push(...orderRecursive(bucket.ids, procedure, ctx, notes));
      }
    }
    return result;
  }

  // No criterion separated the group. Coin flip is always last and always
  // separates, so this is unreachable in practice; fall back to input order.
  return [...group];
}

interface Bucket {
  score: number;
  ids: string[];
}

function bucketByScore(group: string[], criterion: Criterion, ctx: ResolveContext): Bucket[] {
  const scored = group.map((id) => ({ id, score: criterion.score(id, ctx, group) }));
  scored.sort((a, b) => b.score - a.score);

  const buckets: Bucket[] = [];
  for (const { id, score } of scored) {
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(last.score - score) < EPS) {
      last.ids.push(id);
    } else {
      buckets.push({ score, ids: [id] });
    }
  }
  return buckets;
}

function logSeparation(
  buckets: Bucket[],
  criterion: Criterion,
  ctx: ResolveContext,
  notes: Map<string, TieBreakNote[]>,
): void {
  for (let i = 0; i < buckets.length - 1; i++) {
    const higher = buckets[i];
    const lower = buckets[i + 1];
    const hVal = criterion.format(higher.ids[0], ctx, [...higher.ids, ...lower.ids]);
    const lVal = criterion.format(lower.ids[0], ctx, [...higher.ids, ...lower.ids]);
    const hNames = higher.ids.map(ctx.name).join(", ");
    const lNames = lower.ids.map(ctx.name).join(", ");
    const text = `${hNames} over ${lNames}: ${criterion.label} (${hVal} vs ${lVal})`;
    const note: TieBreakNote = {
      text,
      criterion: criterion.label,
      ...(criterion.random ? { timestamp: ctx.now() } : {}),
    };
    for (const id of higher.ids) {
      const arr = notes.get(id) ?? [];
      arr.push(note);
      notes.set(id, arr);
    }
  }
}
