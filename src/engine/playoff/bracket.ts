import type { BracketGame, DecidedBy, PlayoffSeed } from "../types.ts";

export interface BracketResult {
  highScore: number | null;
  lowScore: number | null;
  decidedBy: DecidedBy | null;
  /** Required only when scores are equal (e.g. shootout decided the game). */
  winner?: "high" | "low";
}

// Fixed 8-team single-elimination layout. Matchups 1v8, 2v7, 3v6, 4v5; the top
// half (1/8, 4/5) and bottom half (2/7, 3/6) keep seeds 1 and 2 apart until the
// final.
const QF_PAIRS: Array<{ id: string; high: number; low: number; feeds: string }> = [
  { id: "qf1", high: 1, low: 8, feeds: "sf1" },
  { id: "qf2", high: 4, low: 5, feeds: "sf1" },
  { id: "qf3", high: 2, low: 7, feeds: "sf2" },
  { id: "qf4", high: 3, low: 6, feeds: "sf2" },
];

/**
 * Build the single-elimination bracket from a seeded field, advancing winners
 * where playoff results are supplied. Pure: no mutation of inputs.
 */
export function buildBracket(
  seeds: PlayoffSeed[],
  results: Map<string, BracketResult> = new Map(),
): BracketGame[] {
  const teamBySeed = new Map(seeds.map((s) => [s.seed, s.teamId]));
  const games: BracketGame[] = [];

  // Quarterfinals.
  for (const pair of QF_PAIRS) {
    games.push(
      makeGame(pair.id, "qf", pair.high, pair.low, teamBySeed, pair.feeds, results),
    );
  }

  // Semifinals fed by quarterfinal winners.
  const byId = new Map(games.map((g) => [g.id, g]));
  const sf1 = makeFedGame("sf1", "sf", byId.get("qf1"), byId.get("qf2"), "final", results);
  const sf2 = makeFedGame("sf2", "sf", byId.get("qf3"), byId.get("qf4"), "final", results);
  games.push(sf1, sf2);

  // Final.
  const final = makeFedGame("final", "final", sf1, sf2, null, results);
  games.push(final);

  return games;
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
