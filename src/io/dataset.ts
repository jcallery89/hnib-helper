import type { Division, Game, HnibEvent, Player, PlayerStatLine, Team } from "../engine/types.ts";
import type { BracketResult } from "../engine/playoff/bracket.ts";

/** A complete, self-contained event dataset the tool operates on. */
export interface Dataset {
  event: HnibEvent;
  divisions: Division[];
  teams: Team[];
  games: Game[];
  /** Playoff game results keyed by bracket game id (qf1..final). */
  bracketResults?: Record<string, BracketResult>;
  /** Optional player rosters (from registration) and their stat lines. */
  players?: Player[];
  playerStats?: PlayerStatLine[];
}
