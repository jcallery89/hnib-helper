import type { Game, Team } from "../src/engine/types.ts";
import { computeStandings } from "../src/engine/standings.ts";
import { buildContext, type ResolveContext } from "../src/engine/tiebreak/index.ts";

let gid = 0;

export function team(id: string, name = id, divisionId = "d"): Team {
  return { id, eventId: "e", divisionId, name };
}

/** A final round-robin game between two teams. */
export function rr(home: string, away: string, hs: number, as: number): Game {
  return {
    id: `g${++gid}`,
    divisionId: "d",
    round: "rr",
    rink: null,
    slotStart: null,
    homeTeamId: home,
    awayTeamId: away,
    homeScore: hs,
    awayScore: as,
    status: "final",
    decidedBy: "regulation",
  };
}

/** Build a ResolveContext from teams + games with deterministic rng/clock. */
export function ctxFrom(
  teams: Team[],
  games: Game[],
  rng: () => number = () => 0.5,
  now: () => string = () => "2026-06-09T00:00:00.000Z",
): ResolveContext {
  const standings = computeStandings(teams, games);
  return buildContext(standings, games, { teams, rng, now });
}

/** An rng that yields the given values in order, then repeats the last. */
export function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
