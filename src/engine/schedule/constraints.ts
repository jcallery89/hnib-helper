import type { Slot } from "./slotGrid.ts";

export interface TeamAvailability {
  teamId: string;
  date: string; // YYYY-MM-DD
  earliest?: string; // HH:MM - no game may start before this
  latest?: string; // HH:MM - no game may start at/after this
}

export interface Blackout {
  date: string;
  sheet?: string; // omit to black out all sheets that day
  start?: string; // HH:MM window start (inclusive)
  end?: string; // HH:MM window end (exclusive)
}

export interface ScheduleConstraints {
  minRestMinutes: number; // confirmed default 120
  availability: TeamAvailability[];
  blackouts: Blackout[];
}

export const DEFAULT_CONSTRAINTS: ScheduleConstraints = {
  minRestMinutes: 120,
  availability: [],
  blackouts: [],
};

function timeOf(slot: Slot): string {
  return slot.start.slice(11, 16); // HH:MM
}

/** A slot blocked by a sheet/venue blackout cannot host any game. */
export function slotBlocked(slot: Slot, blackouts: Blackout[]): boolean {
  const t = timeOf(slot);
  return blackouts.some((b) => {
    if (b.date !== slot.date) return false;
    if (b.sheet && b.sheet !== slot.sheet) return false;
    if (b.start && t < b.start) return false;
    if (b.end && t >= b.end) return false;
    return true;
  });
}

/** Respect a team's availability window for the slot's date. */
export function teamAllowedInSlot(
  teamId: string,
  slot: Slot,
  availability: TeamAvailability[],
): boolean {
  const t = timeOf(slot);
  for (const a of availability) {
    if (a.teamId !== teamId || a.date !== slot.date) continue;
    if (a.earliest && t < a.earliest) return false;
    if (a.latest && t >= a.latest) return false;
  }
  return true;
}

/**
 * True when placing a team in `candidate` keeps every gap to the team's other
 * slots at or above the minimum rest window. This also blocks two games in the
 * same slot (gap 0) and back-to-backs.
 */
export function restOk(
  candidate: Slot,
  teamSlots: Slot[],
  minRestMinutes: number,
): boolean {
  for (const s of teamSlots) {
    if (s.id === candidate.id) continue;
    if (Math.abs(s.startMinutes - candidate.startMinutes) < minRestMinutes) return false;
  }
  return true;
}
