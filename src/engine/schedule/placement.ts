import type { Game } from "../types.ts";
import type { Slot } from "./slotGrid.ts";
import {
  restOk,
  slotBlocked,
  teamAllowedInSlot,
  type ScheduleConstraints,
} from "./constraints.ts";

export type Assignment = Map<string, string>; // gameId -> slotId

export interface PlacementResult {
  assignment: Assignment;
  placed: Game[]; // games with rink + slotStart filled in
  unplaced: Game[];
  warnings: string[];
}

export interface PlacementOptions {
  /** Keep these placements if still feasible (used by re-flow for minimal diff). */
  seed?: Assignment;
  /** Local-search iterations to improve soft objectives. */
  iterations?: number;
}

/**
 * Phase 2 - assign every matchup to a slot. Greedy most-constrained-first
 * placement honours all hard constraints, then a feasibility-preserving local
 * search improves the soft objectives (even day spread, early/late balance).
 */
export function placeSchedule(
  games: Game[],
  slots: Slot[],
  constraints: ScheduleConstraints,
  opts: PlacementOptions = {},
): PlacementResult {
  const warnings: string[] = [];
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const gameById = new Map(games.map((g) => [g.id, g]));
  const openSlots = slots.filter((s) => !slotBlocked(s, constraints.blackouts));

  const assignment: Assignment = new Map();
  const usedSlots = new Set<string>();

  // 1. Honour seed placements that are still feasible.
  if (opts.seed) {
    for (const g of games) {
      const slotId = opts.seed.get(g.id);
      if (!slotId) continue;
      const slot = slotById.get(slotId);
      if (slot && canPlace(g, slot, assignment, usedSlots, gameById, slotById, constraints)) {
        assignment.set(g.id, slotId);
        usedSlots.add(slotId);
      }
    }
  }

  // 2. Greedy placement of the rest, most-constrained game first.
  const remaining = games.filter((g) => !assignment.has(g.id));
  const candidateCount = new Map<string, number>();
  for (const g of remaining) {
    const n = openSlots.filter(
      (s) =>
        teamAllowedInSlot(g.homeTeamId, s, constraints.availability) &&
        teamAllowedInSlot(g.awayTeamId, s, constraints.availability),
    ).length;
    candidateCount.set(g.id, n);
  }
  remaining.sort((a, b) => (candidateCount.get(a.id) ?? 0) - (candidateCount.get(b.id) ?? 0));

  for (const g of remaining) {
    const slot = openSlots.find(
      (s) =>
        !usedSlots.has(s.id) &&
        canPlace(g, s, assignment, usedSlots, gameById, slotById, constraints),
    );
    if (slot) {
      assignment.set(g.id, slot.id);
      usedSlots.add(slot.id);
    } else {
      warnings.push(`No feasible slot for ${g.homeTeamId} vs ${g.awayTeamId} (${g.id}).`);
    }
  }

  // 3. Local search to improve soft objectives.
  localSearch(assignment, games, openSlots, slotById, gameById, constraints, opts.iterations ?? 400);

  const placed: Game[] = [];
  const unplaced: Game[] = [];
  for (const g of games) {
    const slotId = assignment.get(g.id);
    if (slotId) {
      const slot = slotById.get(slotId) as Slot;
      placed.push({ ...g, rink: slot.sheet, slotStart: slot.start });
    } else {
      unplaced.push({ ...g });
    }
  }

  return { assignment, placed, unplaced, warnings };
}

/** Slots currently occupied by the given team under an assignment. */
function teamSlots(
  teamId: string,
  assignment: Assignment,
  gameById: Map<string, Game>,
  slotById: Map<string, Slot>,
  exceptGameId?: string,
): Slot[] {
  const out: Slot[] = [];
  for (const [gid, sid] of assignment) {
    if (gid === exceptGameId) continue;
    const g = gameById.get(gid);
    if (!g || (g.homeTeamId !== teamId && g.awayTeamId !== teamId)) continue;
    const s = slotById.get(sid);
    if (s) out.push(s);
  }
  return out;
}

function canPlace(
  game: Game,
  slot: Slot,
  assignment: Assignment,
  usedSlots: Set<string>,
  gameById: Map<string, Game>,
  slotById: Map<string, Slot>,
  constraints: ScheduleConstraints,
): boolean {
  if (usedSlots.has(slot.id) && assignment.get(game.id) !== slot.id) return false;
  if (!teamAllowedInSlot(game.homeTeamId, slot, constraints.availability)) return false;
  if (!teamAllowedInSlot(game.awayTeamId, slot, constraints.availability)) return false;
  const homeSlots = teamSlots(game.homeTeamId, assignment, gameById, slotById, game.id);
  const awaySlots = teamSlots(game.awayTeamId, assignment, gameById, slotById, game.id);
  if (!restOk(slot, homeSlots, constraints.minRestMinutes)) return false;
  if (!restOk(slot, awaySlots, constraints.minRestMinutes)) return false;
  return true;
}

// ---- Soft objective + local search ----------------------------------------

function softPenalty(
  assignment: Assignment,
  games: Game[],
  slotById: Map<string, Slot>,
): number {
  // Per team: spread games across days evenly, and balance early/late starts.
  const perTeam = new Map<string, { days: Map<string, number>; early: number; late: number }>();
  const touch = (teamId: string) => {
    let rec = perTeam.get(teamId);
    if (!rec) {
      rec = { days: new Map(), early: 0, late: 0 };
      perTeam.set(teamId, rec);
    }
    return rec;
  };

  for (const g of games) {
    const slotId = assignment.get(g.id);
    if (!slotId) continue;
    const slot = slotById.get(slotId);
    if (!slot) continue;
    const hour = Number(slot.start.slice(11, 13));
    for (const teamId of [g.homeTeamId, g.awayTeamId]) {
      const rec = touch(teamId);
      rec.days.set(slot.date, (rec.days.get(slot.date) ?? 0) + 1);
      if (hour < 13) rec.early++;
      else rec.late++;
    }
  }

  let penalty = 0;
  for (const rec of perTeam.values()) {
    const counts = [...rec.days.values()];
    const max = Math.max(...counts, 0);
    const min = Math.min(...counts, 0);
    penalty += (max - min) * 2; // uneven day distribution
    penalty += Math.abs(rec.early - rec.late); // early/late imbalance
  }
  return penalty;
}

function localSearch(
  assignment: Assignment,
  games: Game[],
  openSlots: Slot[],
  slotById: Map<string, Slot>,
  gameById: Map<string, Game>,
  constraints: ScheduleConstraints,
  iterations: number,
): void {
  const placedGames = games.filter((g) => assignment.has(g.id));
  if (placedGames.length === 0) return;
  let current = softPenalty(assignment, games, slotById);

  for (let iter = 0; iter < iterations && current > 0; iter++) {
    const g = placedGames[iter % placedGames.length];
    const fromSlotId = assignment.get(g.id) as string;
    const occupied = new Set(assignment.values());
    let improved = false;

    // Try moving g to an empty feasible slot.
    for (const slot of openSlots) {
      if (occupied.has(slot.id)) continue;
      assignment.set(g.id, slot.id);
      if (canPlace(g, slot, assignment, new Set(), gameById, slotById, constraints)) {
        const next = softPenalty(assignment, games, slotById);
        if (next < current) {
          current = next;
          improved = true;
          break;
        }
      }
      assignment.set(g.id, fromSlotId);
    }
    if (improved) continue;

    // Try swapping g with another placed game.
    for (const other of placedGames) {
      if (other.id === g.id) continue;
      const otherSlotId = assignment.get(other.id) as string;
      assignment.set(g.id, otherSlotId);
      assignment.set(other.id, fromSlotId);
      const gSlot = slotById.get(otherSlotId) as Slot;
      const oSlot = slotById.get(fromSlotId) as Slot;
      const ok =
        canPlace(g, gSlot, assignment, new Set(), gameById, slotById, constraints) &&
        canPlace(other, oSlot, assignment, new Set(), gameById, slotById, constraints);
      if (ok) {
        const next = softPenalty(assignment, games, slotById);
        if (next < current) {
          current = next;
          break;
        }
      }
      assignment.set(g.id, fromSlotId);
      assignment.set(other.id, otherSlotId);
    }
  }
}
