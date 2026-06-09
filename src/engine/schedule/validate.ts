import type { Game } from "../types.ts";

/**
 * Flag game-count imbalance across teams in a matchup set. "Most Wins" and raw
 * goals-against / plus-minus assume equal schedules, so an uneven count should
 * be surfaced rather than compared blindly.
 */
export function unequalGameCounts(games: Game[]): { balanced: boolean; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const g of games) {
    if (g.round !== "rr") continue;
    counts[g.homeTeamId] = (counts[g.homeTeamId] ?? 0) + 1;
    counts[g.awayTeamId] = (counts[g.awayTeamId] ?? 0) + 1;
  }
  const values = Object.values(counts);
  const balanced = values.length === 0 || values.every((v) => v === values[0]);
  return { balanced, counts };
}
