import type { Game } from "../types.ts";
import type { Slot } from "./slotGrid.ts";
import type { ScheduleConstraints } from "./constraints.ts";
import { placeSchedule, type Assignment, type PlacementResult } from "./placement.ts";

export interface ScheduleDiff {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  from: { sheet: string; start: string } | null;
  to: { sheet: string; start: string } | null;
}

export interface ReflowResult extends PlacementResult {
  diff: ScheduleDiff[];
}

/**
 * Re-solve placement after a constraint change, seeding from the previous
 * assignment so only the games that MUST move actually move. Returns the new
 * placement plus a diff of which games changed slot, for communicating to
 * coaches.
 */
export function reflow(
  games: Game[],
  slots: Slot[],
  constraints: ScheduleConstraints,
  previous: Assignment,
): ReflowResult {
  const result = placeSchedule(games, slots, constraints, { seed: previous });
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const diff: ScheduleDiff[] = [];
  for (const g of games) {
    const before = previous.get(g.id);
    const after = result.assignment.get(g.id);
    if (before === after) continue;
    diff.push({
      gameId: g.id,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      from: slotMeta(before, slotById),
      to: slotMeta(after, slotById),
    });
  }

  return { ...result, diff };
}

function slotMeta(
  slotId: string | undefined,
  slotById: Map<string, Slot>,
): { sheet: string; start: string } | null {
  if (!slotId) return null;
  const s = slotById.get(slotId);
  return s ? { sheet: s.sheet, start: s.start } : null;
}
