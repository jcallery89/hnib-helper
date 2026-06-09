import type { Game } from "../types.ts";

export interface TeamFairness {
  teamId: string;
  games: number;
  byDay: Record<string, number>;
  early: number; // starts before 13:00
  late: number;
  minRestMinutes: number | null;
  avgRestMinutes: number | null;
}

export interface SheetUtilization {
  sheet: string;
  games: number;
}

export interface FairnessReport {
  teams: TeamFairness[];
  sheets: SheetUtilization[];
}

/**
 * Surface fairness metrics for a placed schedule so a coordinator can eyeball
 * balance and re-solve if something looks off. Only games with a placed slot
 * are considered.
 */
export function fairnessReport(placedGames: Game[]): FairnessReport {
  const placed = placedGames.filter((g) => g.slotStart);

  const perTeam = new Map<string, Game[]>();
  for (const g of placed) {
    for (const teamId of [g.homeTeamId, g.awayTeamId]) {
      const arr = perTeam.get(teamId) ?? [];
      arr.push(g);
      perTeam.set(teamId, arr);
    }
  }

  const teams: TeamFairness[] = [];
  for (const [teamId, gs] of perTeam) {
    const starts = gs
      .map((g) => Date.parse(g.slotStart as string) / 60000)
      .sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1]);

    const byDay: Record<string, number> = {};
    let early = 0;
    let late = 0;
    for (const g of gs) {
      const date = (g.slotStart as string).slice(0, 10);
      byDay[date] = (byDay[date] ?? 0) + 1;
      const hour = Number((g.slotStart as string).slice(11, 13));
      if (hour < 13) early++;
      else late++;
    }

    teams.push({
      teamId,
      games: gs.length,
      byDay,
      early,
      late,
      minRestMinutes: gaps.length ? Math.min(...gaps) : null,
      avgRestMinutes: gaps.length
        ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
        : null,
    });
  }
  teams.sort((a, b) => a.teamId.localeCompare(b.teamId));

  const bySheet = new Map<string, number>();
  for (const g of placed) {
    if (!g.rink) continue;
    bySheet.set(g.rink, (bySheet.get(g.rink) ?? 0) + 1);
  }
  const sheets: SheetUtilization[] = [...bySheet.entries()]
    .map(([sheet, games]) => ({ sheet, games }))
    .sort((a, b) => a.sheet.localeCompare(b.sheet));

  return { teams, sheets };
}
