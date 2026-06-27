import type { Game, PlayerSummary, PlayoffSeed, Standing } from "../../engine/types.ts";
import { buildPlayoffField } from "../../engine/playoff/field.ts";
import { computeStandings } from "../../engine/standings.ts";
import { summarizePlayers } from "../../engine/players/summary.ts";
import type { Dataset } from "../../io/dataset.ts";

export interface Analysis {
  divisionStandings: Map<string, Standing[]>;
  seeds: PlayoffSeed[];
  warnings: string[];
  resultsEntered: number;
  totalRoundRobin: number;
  nameById: (id: string) => string;
}

/**
 * Keep only games that count as of a cutoff. Games at or before the cutoff are
 * kept as-is; games after it are treated as not-yet-played (so they neither
 * count in standings nor seed the field). Games without a scheduled time are
 * always kept so manually entered results still work.
 */
export function gamesAsOf(games: Game[], asOf: string | null): Game[] {
  if (!asOf) return games;
  return games.filter((g) => !g.slotStart || g.slotStart <= asOf);
}

/**
 * Derive everything the UI shows from the raw dataset, optionally as of a
 * point in time. Pure - safe to call from a useMemo on every edit.
 */
export function analyze(data: Dataset, asOf: string | null = null): Analysis {
  const nameMap = new Map(data.teams.map((t) => [t.id, t.name]));
  const games = gamesAsOf(data.games, asOf);
  const field = buildPlayoffField(data.event, data.divisions, data.teams, games, {
    pointSystem: data.event.pointSystem,
    teams: data.teams,
  });

  const rr = games.filter((g) => g.round === "rr");
  const resultsEntered = rr.filter((g) => g.status === "final").length;

  return {
    divisionStandings: field.divisionStandings,
    seeds: field.seeds,
    warnings: field.warnings,
    resultsEntered,
    totalRoundRobin: data.games.filter((g) => g.round === "rr").length,
    nameById: (id) => nameMap.get(id) ?? id,
  };
}

/** Overall standings (unranked) for quick lookups. */
export function overallStandings(data: Dataset, asOf: string | null = null): Standing[] {
  return computeStandings(data.teams, gamesAsOf(data.games, asOf), data.event.pointSystem);
}

/**
 * Games played per team = the count of that team's completed (final) games of
 * any round. Used as the games-played fallback when the API box score reports
 * GP as 0 (a known Tourno quirk).
 */
export function teamGamesPlayed(data: Dataset): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of data.games) {
    if (g.status !== "final") continue;
    for (const t of [g.homeTeamId, g.awayTeamId]) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/**
 * Player summaries keyed by id, with the games-played fallback applied: when a
 * player's box score reports GP 0, GP becomes their team's completed-game count.
 */
export function playerSummaries(data: Dataset): Map<string, PlayerSummary> {
  const players = data.players ?? [];
  const tgp = teamGamesPlayed(data);
  const byId = new Map(players.map((p) => [p.id, p]));
  const raw = summarizePlayers(players, data.playerStats ?? []);
  return new Map(
    raw.map((s) => {
      const p = byId.get(s.playerId);
      const gp = s.gp > 0 ? s.gp : p ? tgp.get(p.teamId) ?? 0 : 0;
      return [s.playerId, { ...s, gp }];
    }),
  );
}
