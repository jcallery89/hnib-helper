// Pure data model for the HNIB Tournament Expert engine.
// No DOM, no Preact, no I/O - so this module is portable (e.g. to Google Apps Script).

export type EventFormat = "festival" | "showcase";
export type SeedingRule = "jrhigh_top2_per_division" | "soph_division_winners";

export interface PointSystem {
  win: number;
  tie: number;
  loss: number;
}

export interface HnibEvent {
  id: string;
  name: string;
  year: number;
  venues: string[];
  format: EventFormat;
  hasPlayoffBracket: boolean;
  seedingRule: SeedingRule;
  pointSystem: PointSystem;
}

export interface Division {
  id: string;
  eventId: string;
  name: string;
  teamIds: string[];
}

export interface Team {
  id: string;
  eventId: string;
  divisionId: string;
  name: string; // NOT globally unique - always key by id (or event + name)
  coach?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  /** Tourno API team id, when the team came from an hnib.app sync. */
  apiId?: string;
}

export type GameRound = "rr" | "prelim" | "qf" | "sf" | "final";
export type GameStatus = "scheduled" | "final";
export type DecidedBy = "regulation" | "ot" | "shootout";

export interface Game {
  id: string;
  divisionId: string | null; // null for playoff games and crossover games
  round: GameRound;
  rink: string | null;
  slotStart: string | null; // ISO datetime; null until Phase 2 places it
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
  decidedBy: DecidedBy | null;
}

export interface TieBreakNote {
  // e.g. "Andover over Belmont: Least Goals Allowed (14 vs 19)"
  text: string;
  criterion: string;
  timestamp?: string; // present for coin flips
}

export interface Standing {
  teamId: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  points: number;
  gf: number;
  ga: number;
  plusMinus: number;
  rank: number; // 1-based within its ranking context
  tieBreakNotes: TieBreakNote[];
}

export type PlayoffSeedSource = "auto" | "wildcard";

export interface PlayoffSeed {
  seed: number; // 1-8
  teamId: string;
  source: PlayoffSeedSource;
  notes: TieBreakNote[];
}

export interface BracketGame {
  id: string;
  round: Exclude<GameRound, "rr">;
  // seeds entering this game; null when fed by a prior game's winner
  highSeed: number | null;
  lowSeed: number | null;
  highTeamId: string | null;
  lowTeamId: string | null;
  highScore: number | null;
  lowScore: number | null;
  winnerTeamId: string | null;
  decidedBy: DecidedBy | null;
  feedsGameId: string | null;
}

export type PlayerPosition = "F" | "D" | "G";

export interface Player {
  id: string;
  eventId: string;
  teamId: string;
  jersey: number | null; // unique within a team; not globally unique
  firstName: string;
  lastName: string;
  position?: PlayerPosition;
  classYear?: number; // graduation year (legacy; birthYear preferred)
  birthYear?: number; // age-group differentiator; only the year is stored, never the full DOB
  shoots?: "L" | "R";
  heightInches?: number;
  weightLbs?: number;
  hometown?: string;
  school?: string; // school or club for the coming season
  photoUrl?: string; // headshot, when registration provides one
}

// A stat record - either one player's line in one game (gameId set) or a
// pre-summed event total (gameId null, gp set). The summarizer handles both.
export interface PlayerStatLine {
  playerId: string;
  gameId: string | null;
  gp?: number;
  goals: number;
  assists: number;
  pim?: number;
  // goalie fields
  saves?: number;
  goalsAgainst?: number;
  shots?: number;
  // Authoritative goalie rates when the source provides them (goalies split
  // starts, so these cannot be re-derived from a team-games count).
  gaa?: number;
  savePct?: number;
}

export interface PlayerSummary {
  playerId: string;
  isGoalie: boolean;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  // goalie-only (undefined for skaters)
  goalsAgainst?: number;
  saves?: number;
  savePct?: number;
  gaa?: number;
}

