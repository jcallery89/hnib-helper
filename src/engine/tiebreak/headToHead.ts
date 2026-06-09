import type { Game, PointSystem } from "../types.ts";

/**
 * A completed round-robin (or crossover) game between two teams. Playoff games
 * never feed head-to-head. Both scores must be recorded.
 */
function isHeadToHeadGame(game: Game): boolean {
  return (
    game.round === "rr" &&
    game.status === "final" &&
    game.homeScore !== null &&
    game.awayScore !== null
  );
}

/**
 * Build a head-to-head mini-table among ONLY the given group of tied teams.
 * Returns points earned by each team in games played strictly among the group.
 * This is recomputed for every (sub)group, which is what "restart from the top"
 * means when a team breaks out of a multi-team tie.
 */
export function headToHeadPoints(
  group: string[],
  games: Game[],
  pointSystem: PointSystem,
): Map<string, number> {
  const inGroup = new Set(group);
  const points = new Map<string, number>();
  for (const id of group) points.set(id, 0);

  for (const game of games) {
    if (!isHeadToHeadGame(game)) continue;
    if (!inGroup.has(game.homeTeamId) || !inGroup.has(game.awayTeamId)) continue;

    const hs = game.homeScore as number;
    const as = game.awayScore as number;
    if (hs > as) {
      points.set(game.homeTeamId, (points.get(game.homeTeamId) ?? 0) + pointSystem.win);
      points.set(game.awayTeamId, (points.get(game.awayTeamId) ?? 0) + pointSystem.loss);
    } else if (hs < as) {
      points.set(game.awayTeamId, (points.get(game.awayTeamId) ?? 0) + pointSystem.win);
      points.set(game.homeTeamId, (points.get(game.homeTeamId) ?? 0) + pointSystem.loss);
    } else {
      points.set(game.homeTeamId, (points.get(game.homeTeamId) ?? 0) + pointSystem.tie);
      points.set(game.awayTeamId, (points.get(game.awayTeamId) ?? 0) + pointSystem.tie);
    }
  }
  return points;
}

/**
 * True when every pair of teams in the group has played at least one completed
 * game against each other. Drives the playoff-seeding branch: when teams have
 * NOT all played, head-to-head cannot resolve them and "Most Wins" is used.
 */
export function allPlayedEachOther(group: string[], games: Game[]): boolean {
  if (group.length < 2) return true;
  const played = new Set<string>();
  for (const game of games) {
    if (!isHeadToHeadGame(game)) continue;
    played.add(pairKey(game.homeTeamId, game.awayTeamId));
  }
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (!played.has(pairKey(group[i], group[j]))) return false;
    }
  }
  return true;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
