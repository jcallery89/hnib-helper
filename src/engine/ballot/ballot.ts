// Coaches ballot for the at-large All-Star team (Boys Major Showcase).
//
// Nomination model: each coach nominates the top players from the team they
// coached via the Gravity Forms ballot (3 F / 2 D / 1 G). The operator reads
// the entries and marks nominated players here, the directors make the final
// Roster/Alternate calls, and the nominated list is exported for player
// notification. Pure data in, pure data out.

import type { Player, PlayerSummary } from "../types.ts";

export type BallotPosition = "F" | "D" | "G";

export type BallotSelection = "roster" | "alternate";

/** Invite lifecycle: sent, accepted, or declined. Absent = not invited yet. */
export type InviteStatus = "invited" | "yes" | "no";

export interface BallotState {
  /** Players nominated by a coach (or added by the directors). */
  nominatedIds?: string[];
  /** Directors' final roster calls, keyed by player id. */
  selections?: Record<string, BallotSelection>;
  /** Per-player working notes (injury, position change, asterisk). */
  playerNotes?: Record<string, string>;
  /** Invite/RSVP status per player id, for the selection waves. */
  invites?: Record<string, InviteStatus>;
  /** Final roster size per position (e.g. Girls Major: 36 F / 18 D / 6 G). */
  targets?: { F: number; D: number; G: number };
}

/**
 * Per-position invite arithmetic for the over-invite guard: confirmed and
 * outstanding invites count against the target; declines free the spot.
 */
export interface InviteCount {
  confirmed: number;
  pending: number;
  declined: number;
  target: number | null;
  /** confirmed + pending beyond the target; 0 when under or no target. */
  over: number;
}

export function countInvites(
  ballot: BallotState,
  playerIdsInPosition: string[],
  position: BallotPosition,
): InviteCount {
  const invites = ballot.invites ?? {};
  let confirmed = 0;
  let pending = 0;
  let declined = 0;
  for (const id of playerIdsInPosition) {
    const s = invites[id];
    if (s === "yes") confirmed++;
    else if (s === "invited") pending++;
    else if (s === "no") declined++;
  }
  const target = ballot.targets ? ballot.targets[position] : null;
  const over = target !== null && target > 0 ? Math.max(0, confirmed + pending - target) : 0;
  return { confirmed, pending, declined, target: target !== null && target > 0 ? target : null, over };
}

// Datasets saved before the nomination model may carry extra legacy keys
// (coaches, finalRanks, targets); they parse harmlessly and are ignored.
export function emptyBallot(): BallotState {
  return {};
}

/**
 * The ballot section a player belongs to. Goalie detection follows the
 * summary (position "G" OR goalie stat lines), so blank-position goalies land
 * in the goalie section; remaining blank-position players default to forward
 * rather than silently dropping out of the ballot.
 */
export function ballotPosition(player: Player, summary?: PlayerSummary): BallotPosition {
  if (player.position === "G" || summary?.isGoalie) return "G";
  if (player.position === "D") return "D";
  return "F";
}

/**
 * Section pre-sort so the list reads as a stats reference, not a blank list:
 * points for skaters (goals breaking ties), SV% then GAA for goalies.
 */
export function compareProduction(
  a: PlayerSummary | undefined,
  b: PlayerSummary | undefined,
  position: BallotPosition,
): number {
  if (position === "G") {
    const svA = a?.savePct ?? -1;
    const svB = b?.savePct ?? -1;
    if (svA !== svB) return svB - svA;
    const gaaA = a?.gaa ?? Number.MAX_SAFE_INTEGER;
    const gaaB = b?.gaa ?? Number.MAX_SAFE_INTEGER;
    if (gaaA !== gaaB) return gaaA - gaaB;
    return (b?.gp ?? 0) - (a?.gp ?? 0);
  }
  const ptsA = a?.points ?? 0;
  const ptsB = b?.points ?? 0;
  if (ptsA !== ptsB) return ptsB - ptsA;
  return (b?.goals ?? 0) - (a?.goals ?? 0);
}

export function positionLabel(position: BallotPosition): string {
  return position === "G" ? "Goaltenders" : position === "D" ? "Defense" : "Forwards";
}
