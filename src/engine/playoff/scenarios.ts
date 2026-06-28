import type { Division, Game, HnibEvent, Team } from "../types.ts";
import { buildPlayoffField } from "./field.ts";

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
  fieldSize = 8,
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
