// Coaches ballot for the at-large All-Star team (Boys Major Showcase).
//
// Mirrors the spreadsheet ballot model: each coach ranks the players they
// have an opinion on (1 = best, blanks are fine), the tool averages the ranks
// across coaches and counts votes, and the directors reconcile the consensus
// into the final roster (finalRanks for their agreed order, selections for
// roster/alternate calls). Pure data in, pure data out.

import type { Player, PlayerSummary } from "../types.ts";

export type BallotPosition = "F" | "D" | "G";

export interface BallotTargets {
  F: number;
  D: number;
  G: number;
}

// 2026 reference: coaches rank about 16 forwards, 8-10 defensemen, 3 goalies.
export const DEFAULT_TARGETS: BallotTargets = { F: 16, D: 10, G: 3 };

export interface CoachBallot {
  id: string;
  coachName: string;
  /** Team coached at the event; useful for spotting home-team bias. */
  team?: string;
  /** Rank per player id; 1 = best. Unranked players are simply absent. */
  ranks: Record<string, number>;
  /** Injuries, position changes, asterisk players. */
  comments?: string;
}

export type BallotSelection = "roster" | "alternate";

/**
 * Who is ballot-eligible. "event" is the Boys Major Showcase case: every
 * player on the event's rosters is on the ballot. "flagged" restricts the
 * pool to the All-Star flags from the Stats tab (the festival case, where the
 * ballot covers only the All-Star game rosters).
 */
export type BallotPoolMode = "event" | "flagged";

export interface BallotState {
  targets: BallotTargets;
  poolMode?: BallotPoolMode; // absent = "event"
  coaches: CoachBallot[];
  /** Directors' agreed final order, keyed by player id. */
  finalRanks: Record<string, number>;
  /** Directors' final roster calls, keyed by player id. */
  selections: Record<string, BallotSelection>;
}

export function emptyBallot(): BallotState {
  return { targets: { ...DEFAULT_TARGETS }, poolMode: "event", coaches: [], finalRanks: {}, selections: {} };
}

export interface BallotLine {
  playerId: string;
  /** Average rank across the coaches who ranked the player (1 decimal); null when unranked. */
  avgRank: number | null;
  /** How many coaches ranked the player. */
  votes: number;
}

/** The Avg Rank / Votes model from the spreadsheet ballot. */
export function aggregateBallots(coaches: CoachBallot[], playerIds: string[]): Map<string, BallotLine> {
  const out = new Map<string, BallotLine>();
  for (const id of playerIds) {
    const ranks = coaches
      .map((c) => c.ranks[id])
      .filter((r): r is number => typeof r === "number" && Number.isFinite(r) && r > 0);
    out.set(id, {
      playerId: id,
      votes: ranks.length,
      avgRank: ranks.length > 0 ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null,
    });
  }
  return out;
}

/** Consensus order: lower average rank first, more votes breaking ties, unranked last. */
export function compareBallotLines(a: BallotLine, b: BallotLine): number {
  if (a.avgRank === null && b.avgRank === null) return 0;
  if (a.avgRank === null) return 1;
  if (b.avgRank === null) return -1;
  if (a.avgRank !== b.avgRank) return a.avgRank - b.avgRank;
  return b.votes - a.votes;
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
 * Section pre-sort so coaches start from a stats reference, not a blank list:
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

export interface DuplicateRank {
  coachId: string;
  position: BallotPosition;
  rank: number;
  playerIds: string[];
}

/**
 * Duplicate picks cannot be prevented at entry time (any number can go in any
 * slot), so they are caught at aggregation time: the same rank value given to
 * two or more players in the same position section by one coach.
 */
export function findDuplicateRanks(
  coaches: CoachBallot[],
  groups: Record<BallotPosition, string[]>,
): DuplicateRank[] {
  const out: DuplicateRank[] = [];
  for (const coach of coaches) {
    for (const position of ["F", "D", "G"] as const) {
      const byRank = new Map<number, string[]>();
      for (const id of groups[position]) {
        const r = coach.ranks[id];
        if (typeof r !== "number") continue;
        byRank.set(r, [...(byRank.get(r) ?? []), id]);
      }
      for (const [rank, playerIds] of byRank) {
        if (playerIds.length > 1) out.push({ coachId: coach.id, position, rank, playerIds });
      }
    }
  }
  return out;
}

/**
 * A Gravity Forms dropdown choice line, one per player, ready for the Bulk
 * Add box: "Last, First - Team (GP-G-A-P)" for skaters, "Last, First - Team
 * (GP, GAA, SV%)" for goalies. Stats travel with the name so free-text
 * spelling never enters the ballot.
 */
export function choiceLabel(
  player: Player,
  teamName: string,
  summary: PlayerSummary | undefined,
  position: BallotPosition,
): string {
  const stats =
    position === "G"
      ? [
          `${summary?.gp ?? 0} GP`,
          summary?.gaa !== undefined ? `${summary.gaa.toFixed(2)} GAA` : "no GAA",
          summary?.savePct !== undefined ? `${summary.savePct.toFixed(3).replace(/^0/, "")} SV%` : "no SV%",
        ].join(", ")
      : `${summary?.gp ?? 0}-${summary?.goals ?? 0}-${summary?.assists ?? 0}-${summary?.points ?? 0}`;
  return `${player.lastName}, ${player.firstName} - ${teamName} (${stats})`;
}

export function positionLabel(position: BallotPosition): string {
  return position === "G" ? "Goaltenders" : position === "D" ? "Defense" : "Forwards";
}
