import type { Player, PlayerStatLine, PlayerSummary } from "../types.ts";

/**
 * Aggregate stat lines into one summary per player. Pure and side-effect-free.
 * Accepts per-game lines (gameId set) or pre-summed totals (gameId null with an
 * explicit gp); games played is the sum of explicit gp values, otherwise the
 * count of distinct games with a line.
 */
export function summarizePlayers(players: Player[], lines: PlayerStatLine[]): PlayerSummary[] {
  const byPlayer = new Map<string, PlayerStatLine[]>();
  for (const line of lines) {
    const arr = byPlayer.get(line.playerId) ?? [];
    arr.push(line);
    byPlayer.set(line.playerId, arr);
  }

  // A player is a goalie if their roster position says so OR any of their stat
  // lines carry goalie data (saves/shots/GA). The data-based check catches
  // goalies whose roster position did not come through as "G".
  const goalieIds = new Set(players.filter((p) => p.position === "G").map((p) => p.id));
  for (const line of lines) {
    if (line.saves !== undefined || line.goalsAgainst !== undefined || line.shots !== undefined) {
      goalieIds.add(line.playerId);
    }
  }

  const summaries: PlayerSummary[] = [];
  for (const player of players) {
    const pLines = byPlayer.get(player.id) ?? [];
    const isGoalie = goalieIds.has(player.id);

    let gp = 0;
    let goals = 0;
    let assists = 0;
    let pim = 0;
    let saves = 0;
    let goalsAgainst = 0;
    let shots = 0;
    let hasGoalieData = false;
    let providedGaa: number | undefined;
    let providedSavePct: number | undefined;
    const gameIds = new Set<string>();

    for (const l of pLines) {
      gp += l.gp ?? (l.gameId ? 1 : 0);
      if (l.gameId) gameIds.add(l.gameId);
      goals += l.goals ?? 0;
      assists += l.assists ?? 0;
      pim += l.pim ?? 0;
      if (l.saves !== undefined || l.goalsAgainst !== undefined || l.shots !== undefined || l.gaa !== undefined || l.savePct !== undefined) {
        hasGoalieData = true;
        saves += l.saves ?? 0;
        goalsAgainst += l.goalsAgainst ?? 0;
        shots += l.shots ?? 0;
        if (l.gaa !== undefined) providedGaa = l.gaa;
        if (l.savePct !== undefined) providedSavePct = l.savePct;
      }
    }
    if (gp === 0 && gameIds.size > 0) gp = gameIds.size;

    const summary: PlayerSummary = {
      playerId: player.id,
      isGoalie,
      gp,
      goals,
      assists,
      points: goals + assists,
      pim,
    };

    if (isGoalie && hasGoalieData) {
      summary.goalsAgainst = goalsAgainst;
      summary.saves = saves;
      const shotsFaced = shots > 0 ? shots : saves + goalsAgainst;
      // Prefer the source's published rates; they account for split starts that
      // a team-games count cannot.
      summary.savePct = providedSavePct ?? (shotsFaced > 0 ? round3(saves / shotsFaced) : undefined);
      summary.gaa = providedGaa ?? (gp > 0 ? round2(goalsAgainst / gp) : undefined);
    }

    summaries.push(summary);
  }

  return summaries;
}

/** Sort skaters by points then goals; useful for a leaders table. */
export function sortByScoring(summaries: PlayerSummary[]): PlayerSummary[] {
  return [...summaries].sort((a, b) => b.points - a.points || b.goals - a.goals);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
