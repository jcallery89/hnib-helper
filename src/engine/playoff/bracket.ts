import type { BracketGame, DecidedBy, PlayoffSeed } from "../types.ts";

export interface BracketResult {
  highScore: number | null;
  lowScore: number | null;
  decidedBy: DecidedBy | null;
  /** Required only when scores are equal (e.g. shootout decided the game). */
  winner?: "high" | "low";
}

// 8-team single elimination. Matchups 1v8, 2v7, 3v6, 4v5; the top half (1/8, 4/5)
// and bottom half (2/7, 3/6) keep seeds 1 and 2 apart until the final.
const QF_PAIRS_8: Array<{ id: string; high: number; low: number; feeds: string }> = [
  { id: "qf1", high: 1, low: 8, feeds: "sf1" },
  { id: "qf2", high: 4, low: 5, feeds: "sf1" },
  { id: "qf3", high: 2, low: 7, feeds: "sf2" },
  { id: "qf4", high: 3, low: 6, feeds: "sf2" },
];

// 6-team single elimination. Seeds 1 and 2 earn byes to the semifinals; the two
// play-in games are 4v5 (-> seed 1's semi) and 3v6 (-> seed 2's semi).
const QF_PAIRS_6: Array<{ id: string; high: number; low: number; feeds: string }> = [
  { id: "qf1", high: 4, low: 5, feeds: "sf1" },
  { id: "qf2", high: 3, low: 6, feeds: "sf2" },
];

// 12-team single elimination (Girls Major). Seeds 1-4 earn byes to the
// quarterfinals; Round 1 is 8v9, 5v12, 7v10, 6v11. Each winner meets a bye seed
// (1 v 8/9, 4 v 5/12, 2 v 7/10, 3 v 6/11), keeping seeds 1 and 2 in opposite
// halves until the final.
const PRELIM_PAIRS_12: Array<{ id: string; high: number; low: number; feeds: string }> = [
  { id: "pr1", high: 8, low: 9, feeds: "qf1" },
  { id: "pr2", high: 5, low: 12, feeds: "qf2" },
  { id: "pr3", high: 7, low: 10, feeds: "qf3" },
  { id: "pr4", high: 6, low: 11, feeds: "qf4" },
];

// Which bye seed hosts each 12-team quarterfinal.
const QF_BYES_12: Array<{ id: string; bye: number; feeds: string }> = [
  { id: "qf1", bye: 1, feeds: "sf1" },
  { id: "qf2", bye: 4, feeds: "sf1" },
  { id: "qf3", bye: 2, feeds: "sf2" },
  { id: "qf4", bye: 3, feeds: "sf2" },
];

/** Field size implied by a seeded field (6, 8, or 12), unless overridden. */
function bracketSize(seeds: PlayoffSeed[], fieldSize?: number): 6 | 8 | 12 {
  if (fieldSize === 6 || fieldSize === 8 || fieldSize === 12) return fieldSize;
  const maxSeed = seeds.reduce((m, s) => Math.max(m, s.seed), 0);
  return maxSeed <= 6 ? 6 : maxSeed <= 8 ? 8 : 12;
}

/** First-round pairings (seeds + the game they feed) for a field size. */
export function qfPairings(fieldSize: 6 | 8 | 12): Array<{ id: string; high: number; low: number; feeds: string }> {
  return fieldSize === 6 ? QF_PAIRS_6 : fieldSize === 12 ? PRELIM_PAIRS_12 : QF_PAIRS_8;
}

/** Bye-seed games (the round after Round 1) for a field size, if any. */
export function byePairings(fieldSize: 6 | 8 | 12): Array<{ id: string; bye: number; feeds: string }> {
  if (fieldSize === 6) {
    return [
      { id: "sf1", bye: 1, feeds: "final" },
      { id: "sf2", bye: 2, feeds: "final" },
    ];
  }
  if (fieldSize === 12) return QF_BYES_12;
  return [];
}

/**
 * Build the single-elimination bracket from a seeded field, advancing winners
 * where playoff results are supplied. Supports 8-team and 6-team (byes for the
 * top two seeds) fields. Pure: no mutation of inputs.
 */
export function buildBracket(
  seeds: PlayoffSeed[],
  results: Map<string, BracketResult> = new Map(),
  fieldSize?: number,
): BracketGame[] {
  const teamBySeed = new Map(seeds.map((s) => [s.seed, s.teamId]));
  const games: BracketGame[] = [];
  const size = bracketSize(seeds, fieldSize);

  if (size === 12) {
    // Round 1 among seeds 5-12, then bye seeds 1-4 host the quarterfinals.
    for (const pair of PRELIM_PAIRS_12) {
      games.push(makeGame(pair.id, "prelim", pair.high, pair.low, teamBySeed, pair.feeds, results));
    }
    const prById = new Map(games.map((g) => [g.id, g]));
    for (const q of QF_BYES_12) {
      const feeder = [...prById.values()].find((g) => g.feedsGameId === q.id);
      games.push(makeByeGame(q.id, "qf", q.bye, teamBySeed, feeder, q.feeds, results));
    }
    const byId = new Map(games.map((g) => [g.id, g]));
    const sf1 = makeFedGame("sf1", "sf", byId.get("qf1"), byId.get("qf2"), "final", results);
    const sf2 = makeFedGame("sf2", "sf", byId.get("qf3"), byId.get("qf4"), "final", results);
    games.push(sf1, sf2);
    games.push(makeFedGame("final", "final", sf1, sf2, null, results));
    return games;
  }

  const qfPairs = size === 6 ? QF_PAIRS_6 : QF_PAIRS_8;

  for (const pair of qfPairs) {
    games.push(makeGame(pair.id, "qf", pair.high, pair.low, teamBySeed, pair.feeds, results));
  }

  const byId = new Map(games.map((g) => [g.id, g]));
  let sf1: BracketGame;
  let sf2: BracketGame;
  if (size === 6) {
    // Seeds 1 and 2 sit in the semis directly, opposite the play-in winners.
    sf1 = makeByeGame("sf1", "sf", 1, teamBySeed, byId.get("qf1"), "final", results);
    sf2 = makeByeGame("sf2", "sf", 2, teamBySeed, byId.get("qf2"), "final", results);
  } else {
    sf1 = makeFedGame("sf1", "sf", byId.get("qf1"), byId.get("qf2"), "final", results);
    sf2 = makeFedGame("sf2", "sf", byId.get("qf3"), byId.get("qf4"), "final", results);
  }
  games.push(sf1, sf2);

  games.push(makeFedGame("final", "final", sf1, sf2, null, results));
  return games;
}

// A game where the high side is a bye seed (plays directly) and the low side is
// the winner of a feeder game. Used by the 6-team semis and 12-team quarters.
function makeByeGame(
  id: string,
  round: BracketGame["round"],
  byeSeed: number,
  teamBySeed: Map<number, string>,
  feeder: BracketGame | undefined,
  feedsGameId: string | null,
  results: Map<string, BracketResult>,
): BracketGame {
  return decorate(
    {
      id,
      round,
      highSeed: byeSeed,
      lowSeed: feeder?.winnerTeamId ? seedOfWinner(feeder) : null,
      highTeamId: teamBySeed.get(byeSeed) ?? null,
      lowTeamId: feeder?.winnerTeamId ?? null,
      highScore: null,
      lowScore: null,
      winnerTeamId: null,
      decidedBy: null,
      feedsGameId,
    },
    results.get(id),
  );
}

function makeGame(
  id: string,
  round: BracketGame["round"],
  highSeed: number,
  lowSeed: number,
  teamBySeed: Map<number, string>,
  feedsGameId: string | null,
  results: Map<string, BracketResult>,
): BracketGame {
  const highTeamId = teamBySeed.get(highSeed) ?? null;
  const lowTeamId = teamBySeed.get(lowSeed) ?? null;
  return decorate(
    {
      id,
      round,
      highSeed,
      lowSeed,
      highTeamId,
      lowTeamId,
      highScore: null,
      lowScore: null,
      winnerTeamId: null,
      decidedBy: null,
      feedsGameId,
    },
    results.get(id),
  );
}

function makeFedGame(
  id: string,
  round: BracketGame["round"],
  feederA: BracketGame | undefined,
  feederB: BracketGame | undefined,
  feedsGameId: string | null,
  results: Map<string, BracketResult>,
): BracketGame {
  const highTeamId = feederA?.winnerTeamId ?? null;
  const lowTeamId = feederB?.winnerTeamId ?? null;
  return decorate(
    {
      id,
      round,
      highSeed: feederA?.winnerTeamId ? seedOfWinner(feederA) : null,
      lowSeed: feederB?.winnerTeamId ? seedOfWinner(feederB) : null,
      highTeamId,
      lowTeamId,
      highScore: null,
      lowScore: null,
      winnerTeamId: null,
      decidedBy: null,
      feedsGameId,
    },
    results.get(id),
  );
}

function seedOfWinner(game: BracketGame): number | null {
  if (game.winnerTeamId === game.highTeamId) return game.highSeed;
  if (game.winnerTeamId === game.lowTeamId) return game.lowSeed;
  return null;
}

function decorate(game: BracketGame, result: BracketResult | undefined): BracketGame {
  if (!result || !game.highTeamId || !game.lowTeamId) return game;
  const { highScore, lowScore, decidedBy } = result;
  game.highScore = highScore;
  game.lowScore = lowScore;
  game.decidedBy = decidedBy;
  if (highScore === null || lowScore === null) return game;

  if (highScore > lowScore) game.winnerTeamId = game.highTeamId;
  else if (lowScore > highScore) game.winnerTeamId = game.lowTeamId;
  else if (result.winner === "high") game.winnerTeamId = game.highTeamId;
  else if (result.winner === "low") game.winnerTeamId = game.lowTeamId;
  return game;
}
