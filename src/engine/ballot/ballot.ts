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

export interface BallotState {
  /** Players nominated by a coach (or added by the directors). */
  nominatedIds?: string[];
  /** Directors' final roster calls, keyed by player id. */
  selections?: Record<string, BallotSelection>;
  /** Per-player working notes (injury, position change, asterisk). */
  playerNotes?: Record<string, string>;
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
