import type { Game, PointSystem, Standing, Team } from "./types.ts";
import { DEFAULT_POINT_SYSTEM } from "./pointSystem.ts";

function emptyStanding(teamId: string): Standing {
  return {
    teamId,
    gp: 0,
    w: 0,
    l: 0,
    t: 0,
    points: 0,
    gf: 0,
    ga: 0,
    plusMinus: 0,
    rank: 0,
    tieBreakNotes: [],
  };
}

/**
 * A game counts toward standings only if it is a final round-robin game with
 * both scores recorded. Playoff games never affect standings.
 */
export function countsForStandings(game: Game): boolean {
  return (
    game.round === "rr" &&
    game.status === "final" &&
    game.homeScore !== null &&
    game.awayScore !== null
  );
}

/**
 * Compute standings for a set of teams from game results.
 * Pure: no mutation of inputs, no I/O. Standings are NOT ranked here
 * (rank is left 0); ranking + tiebreaks are applied by the tiebreak module.
 */
export function computeStandings(
  teams: Team[],
  games: Game[],
  pointSystem: PointSystem = DEFAULT_POINT_SYSTEM,
): Standing[] {
  const byTeam = new Map<string, Standing>();
  for (const team of teams) byTeam.set(team.id, emptyStanding(team.id));

  for (const game of games) {
    if (!countsForStandings(game)) continue;
    const home = byTeam.get(game.homeTeamId);
    const away = byTeam.get(game.awayTeamId);
    if (!home || !away) continue; // game references a team outside this set

    const hs = game.homeScore as number;
    const as = game.awayScore as number;

    home.gp++;
    away.gp++;
    home.gf += hs;
    home.ga += as;
    away.gf += as;
    away.ga += hs;

    if (hs > as) {
      home.w++;
      away.l++;
      home.points += pointSystem.win;
      away.points += pointSystem.loss;
    } else if (hs < as) {
      away.w++;
      home.l++;
      away.points += pointSystem.win;
      home.points += pointSystem.loss;
    } else {
      home.t++;
      away.t++;
      home.points += pointSystem.tie;
      away.points += pointSystem.tie;
    }
  }

  for (const s of byTeam.values()) {
    s.plusMinus = s.gf - s.ga;
  }

  return [...byTeam.values()];
}

/**
 * Returns true when the given standings reflect an unequal number of games
 * played across teams. "Most Wins", goals-against, and plus/minus comparisons
 * assume equal schedules, so callers should flag this rather than compare raw
 * totals blindly.
 */
export function hasUnequalSchedules(standings: Standing[]): boolean {
  const played = standings.filter((s) => s.gp > 0);
  if (played.length < 2) return false;
  const first = played[0].gp;
  return played.some((s) => s.gp !== first);
}

/**
 * Assert every team carries the same number of round-robin games on its
 * schedule, played plus remaining (4 at HNIB festivals). A team off the common
 * count means the schedule data is broken - a missing, duplicated, or
 * misclassified game - and standings and the playoff picture would silently
 * skew, so callers should show these loudly.
 */
export function scheduleCountWarnings(teams: Team[], games: Game[]): string[] {
  const count = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const g of games) {
    if (g.round !== "rr") continue;
    if (count.has(g.homeTeamId)) count.set(g.homeTeamId, (count.get(g.homeTeamId) ?? 0) + 1);
    if (count.has(g.awayTeamId)) count.set(g.awayTeamId, (count.get(g.awayTeamId) ?? 0) + 1);
  }
  if (count.size < 2) return [];

  // The expected count is the mode across teams, so one broken team does not
  // flag every other team instead.
  const freq = new Map<number, number>();
  for (const n of count.values()) freq.set(n, (freq.get(n) ?? 0) + 1);
  const expected = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];

  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const warnings: string[] = [];
  for (const [id, n] of count) {
    if (n !== expected) {
      warnings.push(
        `DATA WARNING: ${nameById.get(id) ?? id} has ${n} round-robin game${n === 1 ? "" : "s"} on the schedule (played plus remaining); every other team has ${expected}.`,
      );
    }
  }
  return warnings;
}
