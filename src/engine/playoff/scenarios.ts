import type { Division, Game, HnibEvent, Team } from "../types.ts";
import { buildPlayoffField, fieldSizeFor } from "./field.ts";

// Clinch / elimination picture for the playoff field. Because seeding is
// division-based (a low-points division winner can make it, a high-points team
// can miss as a wildcard), elimination is NOT a simple points cutoff. We enumerate
// every win/loss/tie outcome of the remaining round-robin games, run each through
// the real seeding rules, and label each team by whether it makes the field in
// EVERY outcome (clinched), NO outcome (eliminated), or some-but-not-all (alive).

export type PlayoffState = "clinched" | "alive" | "eliminated";

export interface TeamPlayoffStatus {
  teamId: string;
  state: PlayoffState;
}

export interface PlayoffPicture {
  decided: boolean; // false when too many games remain to enumerate
  remainingGames: number;
  statuses: TeamPlayoffStatus[];
}

// 3^7 = 2187 outcomes - covers a final round comfortably and stays fast. Beyond
// that there are too many games left for the picture to mean much anyway.
const MAX_COMBOS = 2200;

export function playoffPicture(
  event: HnibEvent,
  divisions: Division[],
  teams: Team[],
  games: Game[],
  fieldSize = fieldSizeFor(event),
): PlayoffPicture {
  const remaining = games.filter((g) => g.round === "rr" && g.status !== "final");
  const n = remaining.length;
  if (Math.pow(3, n) > MAX_COMBOS) {
    return { decided: false, remainingGames: n, statuses: teams.map((t) => ({ teamId: t.id, state: "alive" })) };
  }

  const settled = games.filter((g) => !(g.round === "rr" && g.status !== "final"));
  const total = Math.pow(3, n);
  // How many of the enumerated outcomes put each team in the field.
  const fieldCount = new Map<string, number>();

  for (let combo = 0; combo < total; combo++) {
    let c = combo;
    const sim: Game[] = remaining.map((g) => {
      const outcome = c % 3;
      c = Math.floor(c / 3);
      // 0 home win, 1 away win, 2 tie; nominal symmetric scores so the simulated
      // games do not skew the goals-for/against tiebreakers either way.
      const [hs, as] = outcome === 0 ? [1, 0] : outcome === 1 ? [0, 1] : [0, 0];
      return { ...g, homeScore: hs, awayScore: as, status: "final", decidedBy: "regulation" };
    });
    const field = buildPlayoffField(event, divisions, teams, [...settled, ...sim], {
      fieldSize,
      pointSystem: event.pointSystem,
      teams,
      // Deterministic so the enumeration is stable; knife-edge coin-flip seeds are
      // therefore resolved one fixed way (a documented simplification).
      rng: () => 0,
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const ids = new Set(field.seeds.map((s) => s.teamId));
    for (const id of ids) fieldCount.set(id, (fieldCount.get(id) ?? 0) + 1);
  }

  const statuses = teams.map((t) => {
    const cnt = fieldCount.get(t.id) ?? 0;
    const state: PlayoffState = cnt === 0 ? "eliminated" : cnt === total ? "clinched" : "alive";
    return { teamId: t.id, state };
  });
  return { decided: true, remainingGames: n, statuses };
}

export function eliminatedTeamIds(picture: PlayoffPicture): string[] {
  return picture.statuses.filter((s) => s.state === "eliminated").map((s) => s.teamId);
}

export function clinchedTeamIds(picture: PlayoffPicture): string[] {
  return picture.statuses.filter((s) => s.state === "clinched").map((s) => s.teamId);
}

export type Outcome = "home" | "away" | "tie";

const OUTCOME_SCORE: Record<Outcome, [number, number]> = { home: [1, 0], away: [0, 1], tie: [0, 0] };

/**
 * Apply hypothetical results to round-robin games, returning a new games array
 * with those games marked final. Used by the interactive what-if: set some
 * results and re-run the picture on what remains.
 */
export function applyHypotheticals(games: Game[], overrides: Record<string, Outcome>): Game[] {
  return games.map((g) => {
    const o = overrides[g.id];
    if (!o || g.round !== "rr") return g;
    const [hs, as] = OUTCOME_SCORE[o];
    return { ...g, homeScore: hs, awayScore: as, status: "final", decidedBy: "regulation" };
  });
}

export interface ScenarioEffect {
  teamId: string;
  effect: "clinched" | "eliminated";
}

export interface ScenarioTrigger {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  outcome: Outcome;
  effects: ScenarioEffect[];
}

export interface ScenarioForecast {
  decided: boolean;
  remainingGames: number;
  statuses: TeamPlayoffStatus[];
  triggers: ScenarioTrigger[];
}

/**
 * One pass over every remaining-result combination, tracking both the overall
 * clinch/eliminate picture AND, for each remaining game + outcome, which teams
 * that single result would clinch or eliminate on its own (regardless of the
 * other games). Those single-result triggers are the human-readable "key
 * scenarios" (e.g. "if Coastal beats North Shore, Mid-Atlantic is eliminated").
 */
export function forecastScenarios(
  event: HnibEvent,
  divisions: Division[],
  teams: Team[],
  games: Game[],
  fieldSize = fieldSizeFor(event),
): ScenarioForecast {
  const remaining = games.filter((g) => g.round === "rr" && g.status !== "final");
  const n = remaining.length;
  if (n === 0 || Math.pow(3, n) > MAX_COMBOS) {
    const pic = playoffPicture(event, divisions, teams, games, fieldSize);
    return { decided: pic.decided, remainingGames: n, statuses: pic.statuses, triggers: [] };
  }

  const settled = games.filter((g) => !(g.round === "rr" && g.status !== "final"));
  const total = Math.pow(3, n);
  const outcomes: Outcome[] = ["home", "away", "tie"];
  const fieldCount = new Map<string, number>();
  // condCount[gameIndex][outcomeIndex] -> Map<teamId, in-field count>
  const condCount = remaining.map(() => [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()]);

  for (let combo = 0; combo < total; combo++) {
    let c = combo;
    const picks: number[] = [];
    const sim: Game[] = remaining.map((g) => {
      const o = c % 3;
      c = Math.floor(c / 3);
      picks.push(o);
      const [hs, as] = OUTCOME_SCORE[outcomes[o]];
      return { ...g, homeScore: hs, awayScore: as, status: "final", decidedBy: "regulation" };
    });
    const field = buildPlayoffField(event, divisions, teams, [...settled, ...sim], {
      fieldSize, pointSystem: event.pointSystem, teams, rng: () => 0, now: () => "2026-01-01T00:00:00.000Z",
    });
    const ids = field.seeds.map((s) => s.teamId);
    for (const id of ids) {
      fieldCount.set(id, (fieldCount.get(id) ?? 0) + 1);
      for (let i = 0; i < remaining.length; i++) {
        const m = condCount[i][picks[i]];
        m.set(id, (m.get(id) ?? 0) + 1);
      }
    }
  }

  const statuses = teams.map((t) => {
    const cnt = fieldCount.get(t.id) ?? 0;
    const state: PlayoffState = cnt === 0 ? "eliminated" : cnt === total ? "clinched" : "alive";
    return { teamId: t.id, state };
  });

  const perOutcome = total / 3; // combos sharing one game's outcome
  const triggers: ScenarioTrigger[] = [];
  remaining.forEach((g, i) => {
    outcomes.forEach((oc, oi) => {
      const m = condCount[i][oi];
      const effects: ScenarioEffect[] = [];
      for (const t of teams) {
        const condIn = m.get(t.id) ?? 0;
        const overallIn = fieldCount.get(t.id) ?? 0;
        // Eliminated by this result: never in the field when it happens, but
        // reachable otherwise (so it is this specific result that ends it).
        if (condIn === 0 && overallIn > 0) effects.push({ teamId: t.id, effect: "eliminated" });
        // Clinched by this result: always in the field when it happens, but not
        // already locked regardless.
        else if (condIn === perOutcome && overallIn < total) effects.push({ teamId: t.id, effect: "clinched" });
      }
      if (effects.length) triggers.push({ gameId: g.id, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, outcome: oc, effects });
    });
  });

  return { decided: true, remainingGames: n, statuses, triggers };
}
