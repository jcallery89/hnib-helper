import type { Division, Game } from "../types.ts";

export interface MatchupResult {
  games: Game[];
  warnings: string[];
}

interface Pairing {
  a: string;
  b: string;
  divisionId: string | null;
}

/**
 * Phase 1 - deterministic matchup generation. Builds a round robin inside each
 * division (circle method) and then tops up each team with crossover games
 * against other divisions (no repeat opponents) until every team reaches the
 * target games-per-team. Decides WHO plays WHOM; nothing about WHEN.
 */
export function generateMatchups(divisions: Division[], targetGames = 4): MatchupResult {
  const warnings: string[] = [];
  const pairings: Pairing[] = [];
  const opponents = new Map<string, Set<string>>();
  const count = new Map<string, number>();

  const allTeams: string[] = [];
  const divisionOf = new Map<string, string>();
  for (const div of divisions) {
    for (const id of div.teamIds) {
      allTeams.push(id);
      divisionOf.set(id, div.id);
      opponents.set(id, new Set());
      count.set(id, 0);
    }
  }

  const addPairing = (a: string, b: string, divisionId: string | null) => {
    pairings.push({ a, b, divisionId });
    opponents.get(a)?.add(b);
    opponents.get(b)?.add(a);
    count.set(a, (count.get(a) ?? 0) + 1);
    count.set(b, (count.get(b) ?? 0) + 1);
  };

  // Intra-division round robin, capped so no team exceeds the target.
  for (const div of divisions) {
    for (const [a, b] of circleMethodPairs(div.teamIds)) {
      if ((count.get(a) ?? 0) >= targetGames || (count.get(b) ?? 0) >= targetGames) continue;
      addPairing(a, b, div.id);
    }
  }

  // Crossover equalization: top up deficits with cross-division opponents.
  let progress = true;
  while (progress) {
    progress = false;
    const needy = allTeams
      .filter((id) => (count.get(id) ?? 0) < targetGames)
      .sort((x, y) => (count.get(x) ?? 0) - (count.get(y) ?? 0));
    for (const a of needy) {
      if ((count.get(a) ?? 0) >= targetGames) continue;
      const b = needy.find(
        (cand) =>
          cand !== a &&
          divisionOf.get(cand) !== divisionOf.get(a) &&
          (count.get(cand) ?? 0) < targetGames &&
          !opponents.get(a)?.has(cand),
      );
      if (b) {
        addPairing(a, b, null);
        progress = true;
      }
    }
  }

  const short = allTeams.filter((id) => (count.get(id) ?? 0) < targetGames);
  if (short.length > 0) {
    warnings.push(
      `Could not reach ${targetGames} games for: ${short
        .map((id) => `${id} (${count.get(id)})`)
        .join(", ")}. Consider adjusting division sizes or the target.`,
    );
  }

  // Alternate home/away to keep the split roughly even.
  const games: Game[] = pairings.map((p, i) => ({
    id: `g-rr-${i + 1}`,
    divisionId: p.divisionId,
    round: "rr",
    rink: null,
    slotStart: null,
    homeTeamId: i % 2 === 0 ? p.a : p.b,
    awayTeamId: i % 2 === 0 ? p.b : p.a,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    decidedBy: null,
  }));

  return { games, warnings };
}

/**
 * Circle-method round robin: returns every pairing exactly once. Handles odd
 * counts with a bye (pairings against the bye are dropped).
 */
export function circleMethodPairs(teamIds: string[]): Array<[string, string]> {
  const teams = [...teamIds];
  const BYE = "__bye__";
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;

  const arr = [...teams];
  const pairs: Array<[string, string]> = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== BYE && b !== BYE) pairs.push([a, b]);
    }
    // Rotate all but the first element.
    arr.splice(1, 0, arr.pop() as string);
  }
  return pairs;
}
