import type { Division, Game, HnibEvent, Player, PlayerStatLine, Team } from "../engine/types.ts";
import type { BracketResult } from "../engine/playoff/bracket.ts";

/** One row on the event leaders board (as published by the Tourno API). */
export interface LeaderEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  number: string;
  position: string;
  team: string;
  value: number;
}

export interface EventLeaders {
  points: LeaderEntry[];
  goals: LeaderEntry[];
  assists: LeaderEntry[];
  pim: LeaderEntry[];
  gaa: LeaderEntry[];
  savePct: LeaderEntry[];
}

/** One game line from a player's profile (/player_profile/{id}). */
export interface PlayerGameLine {
  opponent: string;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  shots: number;
  saves: number;
}

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
  /** Event-wide stat leaders, when synced from hnib.app. */
  leaders?: EventLeaders;
  /** Game-by-game lines fetched on demand, keyed by player id. */
  playerGameLogs?: Record<string, PlayerGameLine[]>;
  /** Hand-edited scouting writeups, keyed by player id (overrides generated). */
  playerWriteups?: Record<string, string>;
  /** Player ids flagged for All-Star consideration. */
  allStarIds?: string[];
  /** Manual team color overrides keyed by team id; survive re-syncs. */
  teamColors?: Record<string, string>;
}
