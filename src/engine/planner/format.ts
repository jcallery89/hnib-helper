import { circleMethodPairs } from "../schedule/matchups.ts";
import type { FormatKind, FormatPlan, FormatResolution, Pairing } from "./types.ts";

// Format resolution: turn "N teams, G games each" into an actual set of
// pairings, or explain why it cannot be done and offer the closest formats.
//
// The basic arithmetic: every game gives two teams a game, so N x G must be
// even. Three teams at three games each needs 4.5 games, which is why that
// request never resolves and the tool offers 2 (single round robin) or 4
// (double round robin) instead.

const POOL_NAMES = ["A", "B", "C", "D"];

/** Round-robin rounds for the given team indices (each round is a set of pairings). */
function roundRobinRounds(ids: number[]): Array<Array<[number, number]>> {
  const perRound = Math.floor(ids.length / 2);
  if (perRound === 0) return [];
  const flat = circleMethodPairs(ids.map(String)).map(([a, b]) => [Number(a), Number(b)] as [number, number]);
  const rounds: Array<Array<[number, number]>> = [];
  for (let i = 0; i < flat.length; i += perRound) rounds.push(flat.slice(i, i + perRound));
  return rounds;
}

function countGames(teams: number, games: Pairing[], placementRound: boolean): number[] {
  const counts = new Array<number>(teams).fill(0);
  for (const g of games) {
    counts[g.a] += 1;
    counts[g.b] += 1;
  }
  if (placementRound) {
    // Seeded pairs 1v2, 3v4...: with an odd count the last-ranked team sits out.
    const paired = teams - (teams % 2);
    // Which team sits is unknown until standings exist; count it against the
    // last index so the report is honest about the imbalance.
    for (let i = 0; i < paired; i++) counts[i] += 1;
  }
  return counts;
}

function finish(
  kind: FormatPlan["kind"],
  title: string,
  description: string,
  teams: number,
  pools: number[][],
  games: Pairing[],
  placementRound: boolean,
  target: number,
): FormatPlan {
  const guaranteed = countGames(teams, games, placementRound);
  const equal = guaranteed.every((c) => c === guaranteed[0]);
  const exact = equal && guaranteed[0] === target;
  return { kind, title, description, teams, pools, games, placementRound, guaranteed, equal, exact };
}

/** First `rounds` rounds of a (repeating) round robin. Rounds past a full RR repeat opponents. */
function roundsPlan(teams: number, rounds: number, target: number): FormatPlan | null {
  const ids = Array.from({ length: teams }, (_, i) => i);
  const single = roundRobinRounds(ids);
  if (single.length === 0 || rounds <= 0) return null;
  const games: Pairing[] = [];
  for (let r = 0; r < rounds; r++) {
    const src = single[r % single.length];
    const stage: Pairing["stage"] = "rr";
    for (const [a, b] of src) games.push(r >= single.length ? { a: b, b: a, stage, round: r + 1 } : { a, b, stage, round: r + 1 });
  }
  const full = single.length;
  let kind: FormatPlan["kind"];
  let title: string;
  let description: string;
  if (rounds === full) {
    kind = "single-rr";
    title = "Single round robin";
    description = `Every team plays every other team once (${teams - 1} games each).`;
  } else if (rounds === 2 * full) {
    kind = "double-rr";
    title = "Double round robin";
    description = `Every team plays every other team twice (${2 * (teams - 1)} games each).`;
  } else if (rounds < full) {
    kind = "partial-rr";
    title = `Partial round robin (${rounds} of ${full} rounds)`;
    description =
      teams % 2 === 0
        ? `The first ${rounds} rounds of a round robin; each team plays ${rounds} games and skips ${full - rounds} opponents.`
        : `The first ${rounds} rounds of a round robin. With an odd team count one team sits each round, so game counts are uneven.`;
  } else {
    kind = "double-rr";
    title = `Round robin plus ${rounds - full} extra round${rounds - full === 1 ? "" : "s"}`;
    description = `A full round robin, then ${rounds - full} more round${rounds - full === 1 ? "" : "s"} against repeat opponents.`;
  }
  return { ...finish(kind, title, description, teams, [ids], games, false, target), rounds };
}

/**
 * Odd team counts: the round-by-round partial round robin leaves byes, so
 * instead each team plays the g/2 teams on either side of it around a circle
 * (a circulant graph). Equal counts whenever g is even, which is the only
 * case an odd team count can be equal at all (N x g must be even).
 */
function circulantPlan(teams: number, g: number, target: number): FormatPlan | null {
  if (teams % 2 === 0 || g % 2 !== 0 || g < 2 || g >= teams - 1) return null;
  const ids = Array.from({ length: teams }, (_, i) => i);
  const games: Pairing[] = [];
  for (let k = 1; k <= g / 2; k++) {
    for (let i = 0; i < teams; i++) games.push({ a: i, b: (i + k) % teams, stage: "rr", round: k });
  }
  return finish(
    "partial-rr",
    `Partial round robin (${g} of ${teams - 1} opponents)`,
    `Each team plays ${g} of the other ${teams - 1} teams once. With an odd team count this is the balanced way to give every team the same number of games.`,
    teams,
    [ids],
    games,
    false,
    target,
  );
}

/** Single round robin plus a seeded placement round (1 vs 2, 3 vs 4...). */
function placementPlan(teams: number, target: number): FormatPlan | null {
  const base = roundsPlan(teams, roundRobinRounds(Array.from({ length: teams }, (_, i) => i)).length, target);
  if (!base) return null;
  const description =
    teams % 2 === 0
      ? `A single round robin (${teams - 1} games), then a placement round seeded from the standings: 1 vs 2, 3 vs 4${teams > 4 ? ", and so on" : ""}.`
      : `A single round robin (${teams - 1} games), then a placement round seeded from the standings. With an odd team count the last-place team sits out the placement round.`;
  return finish("rr-placement", "Round robin plus placement round", description, teams, base.pools, base.games, true, target);
}

/** Two equal pools with a round robin inside each, then `crossovers` games against the other pool. */
function poolsPlan(teams: number, crossovers: number, target: number): FormatPlan | null {
  if (teams < 6 || teams % 2 !== 0) return null;
  const size = teams / 2;
  if (crossovers < 0 || crossovers > size) return null;
  const poolA = Array.from({ length: size }, (_, i) => i);
  const poolB = Array.from({ length: size }, (_, i) => size + i);
  const games: Pairing[] = [];
  for (const pool of [poolA, poolB]) {
    roundRobinRounds(pool).forEach((round, r) => {
      for (const [a, b] of round) games.push({ a, b, stage: "pool", round: r + 1 });
    });
  }
  const poolRounds = roundRobinRounds(poolA).length;
  for (let k = 0; k < crossovers; k++) {
    for (let i = 0; i < size; i++) {
      games.push({ a: poolA[i], b: poolB[(i + k) % size], stage: "crossover", round: poolRounds + k + 1 });
    }
  }
  const title =
    crossovers === 0
      ? `Two pools of ${size}`
      : `Two pools of ${size} plus ${crossovers} crossover game${crossovers === 1 ? "" : "s"}`;
  const description =
    `Pools ${POOL_NAMES[0]} and ${POOL_NAMES[1]} play a round robin (${size - 1} games)` +
    (crossovers > 0 ? `, then each team plays ${crossovers} crossover game${crossovers === 1 ? "" : "s"} against the other pool.` : ".") +
    (target > 0 && size - 1 + crossovers === target ? ` That guarantees ${target} games per team.` : "");
  return finish("pools", title, description, teams, [poolA, poolB], games, false, target);
}

/** Every plan the engine knows for a team count, tagged with how close it is to the target. */
export function candidatePlans(teams: number, target: number): FormatPlan[] {
  const out: FormatPlan[] = [];
  if (teams < 2) return out;
  const full = roundRobinRounds(Array.from({ length: teams }, (_, i) => i)).length;
  const push = (p: FormatPlan | null) => {
    if (p && !out.some((o) => o.title === p.title)) out.push(p);
  };

  // Pools first for six or more teams (the HNIB house style), then straight round robins.
  if (teams >= 6 && teams % 2 === 0) {
    const size = teams / 2;
    for (let c = 0; c <= size; c++) push(poolsPlan(teams, c, target));
  }
  push(roundsPlan(teams, full, target));
  push(circulantPlan(teams, target, target));
  push(placementPlan(teams, target));
  for (let r = 1; r <= 2 * full; r++) if (r !== full) push(roundsPlan(teams, r, target));
  return out;
}

const PREFERENCE: Array<FormatPlan["kind"]> = ["single-rr", "pools", "rr-placement", "partial-rr", "double-rr"];

function rank(p: FormatPlan, target: number): number {
  // Exact and equal first, then by closeness of the (max) guaranteed count.
  const distance = Math.max(...p.guaranteed.map((g) => Math.abs(g - target)));
  return (p.exact ? 0 : 1000) + (p.equal ? 0 : 100) + distance * 10 + PREFERENCE.indexOf(p.kind);
}

/**
 * Resolve a team count and games-per-team target to a concrete plan. When the
 * request cannot be met exactly, the closest workable plan is used and the
 * notes explain why, with alternatives (different game counts, one more or
 * one fewer team) for the operator to pick from.
 */
export function resolveFormat(
  teams: number,
  gamesPerTeam: number,
  preferred: FormatKind = "auto",
  fixedRounds: number | null = null,
): FormatResolution {
  const notes: string[] = [];
  const target = Math.max(0, Math.round(gamesPerTeam));
  const n = Math.max(2, Math.round(teams));
  const candidates = candidatePlans(n, target).sort((a, b) => rank(a, target) - rank(b, target));

  let plan: FormatPlan | undefined;
  if (fixedRounds !== null && fixedRounds > 0) {
    plan = roundsPlan(n, Math.round(fixedRounds), target) ?? undefined;
    if (plan) notes.push(`Pinned to ${Math.round(fixedRounds)} round-robin rounds: ${describeGuarantee(plan)}.`);
  } else if (preferred !== "auto") {
    plan = candidates.find((c) => c.kind === preferred && c.exact) ?? candidates.find((c) => c.kind === preferred);
    if (!plan) notes.push(`No ${labelForKind(preferred)} format exists for ${n} teams; using the closest format instead.`);
    else if (!plan.exact) notes.push(`${plan.title} does not give every team exactly ${target} games; see the counts below.`);
  }
  plan = plan ?? candidates[0];
  const exact = plan.exact;

  if (!exact) {
    if ((n * target) % 2 === 1) {
      notes.push(
        `${n} teams cannot each play exactly ${target} games: that needs ${(n * target) / 2} games and every game uses two teams (${n} x ${target} must be even).`,
      );
    } else if (target > 2 * (n - 1)) {
      notes.push(`${target} games per team is more than a double round robin allows with ${n} teams (${2 * (n - 1)}).`);
    } else {
      notes.push(`No equal format gives ${n} teams exactly ${target} games each.`);
    }
  }

  // Alternatives: other exact plans for this request, then nearby requests.
  const alternatives: FormatPlan[] = candidates.filter((c) => c !== plan && c.exact);
  if (!exact) {
    for (const [t, g] of [
      [n, target - 1],
      [n, target + 1],
      [n + 1, target],
      [n - 1, target],
    ] as Array<[number, number]>) {
      if (g < 1 || t < 2) continue;
      const alt = candidatePlans(t, g)
        .filter((c) => c.exact)
        .sort((a, b) => rank(a, g) - rank(b, g))[0];
      if (alt) alternatives.push(alt);
    }
    // The uneven "one team plays an extra game" style plans for this request.
    for (const c of candidates) {
      if (c !== plan && !c.equal && Math.max(...c.guaranteed) - Math.min(...c.guaranteed) === 1 && c.guaranteed.includes(target)) {
        alternatives.push(c);
      }
    }
  }

  return { teams: n, gamesPerTeam: target, plan, exact, alternatives: dedupe(alternatives, plan).slice(0, 6), notes };
}

function dedupe(plans: FormatPlan[], chosen: FormatPlan): FormatPlan[] {
  const seen = new Set<string>([`${chosen.teams}|${chosen.title}`]);
  return plans.filter((p) => {
    const key = `${p.teams}|${p.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function labelForKind(kind: FormatKind): string {
  switch (kind) {
    case "auto":
      return "automatic";
    case "single-rr":
      return "single round robin";
    case "double-rr":
      return "double round robin";
    case "partial-rr":
      return "partial round robin";
    case "pools":
      return "pools plus crossover";
    case "rr-placement":
      return "round robin plus placement round";
  }
}

/** "3 games each" or "3 to 4 games (uneven)". */
export function describeGuarantee(plan: FormatPlan): string {
  const min = Math.min(...plan.guaranteed);
  const max = Math.max(...plan.guaranteed);
  return min === max ? `${min} games each` : `${min} to ${max} games (uneven)`;
}

export function poolName(index: number): string {
  return POOL_NAMES[index] ?? String(index + 1);
}
