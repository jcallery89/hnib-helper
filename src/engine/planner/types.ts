// Event planner data model. Pure data only (no DOM, no I/O) so the planner
// engine stays portable and testable, like the rest of src/engine/.

/** Which venue family a scenario is priced for. Drives the defaults only. */
export type PlannerProfileKey = "satellite" | "ma-festival" | "ma-showcase";

/**
 * How the guaranteed games are produced.
 * - auto: the engine picks the best exact format for the team count and target.
 * - single-rr / double-rr: everyone plays everyone once / twice.
 * - partial-rr: the first N rounds of a round robin (equal only for even teams).
 * - pools: two pools with a round robin inside each, plus crossover games.
 * - rr-placement: single round robin plus a seeded placement round (1 vs 2, 3 vs 4...).
 */
export type FormatKind = "auto" | "single-rr" | "double-rr" | "partial-rr" | "pools" | "rr-placement";

/** Playoff rounds added on top of the guaranteed games. */
export type PlayoffFormat = "none" | "final" | "semis" | "quarters";

/** Whether ice is billed for the full booked span (including idle gaps) or only for active blocks. */
export type IceBilling = "span" | "active";

export interface EventStructure {
  teams: number;
  forwards: number;
  defense: number;
  goalies: number;
  gamesPerTeam: number;
  format: FormatKind;
  /**
   * Pin the schedule to an exact number of round-robin rounds (used to accept
   * an uneven "one team plays an extra game" format). null = derive from
   * gamesPerTeam.
   */
  fixedRounds: number | null;
  playoffs: PlayoffFormat;
  allStarGame: boolean;
  practice: boolean;
  practiceMinutes: number;
  days: number;
  /** Optional display names for the days ("Saturday", "Sunday"). */
  dayLabels: string[];
  firstIce: string; // HH:MM, earliest block start
  lastIce: string; // HH:MM, latest block END
  sheets: number;
  /** Minutes the rink sells per game block: warmup + two stop-time periods + resurface. */
  blockMinutes: number;
  bufferMinutes: number;
  /** Idle blocks required between one team's games. 1 = never back-to-back. */
  restBlocks: number;
  /** Stop-time minutes actually played per game (two 23-minute periods = 46). */
  gameMinutes: number;
}

export interface CostInputs {
  iceHourly: number;
  iceBilling: IceBilling;
  /** Flat weekend ice package; when set it replaces the hourly calculation. */
  icePackage: number | null;
  /** Rink minimum charge; the ice line is never below this. */
  iceMinimum: number | null;
  refsPerGame: number;
  refRate: number;
  scorekeeperPerGame: number;
  coachPerTeam: number;
  referralOn: boolean;
  referralPerPlayer: number;
  /** Players per team the coach referred. null = the full roster. */
  referredPerTeam: number | null;
  jerseyPerPlayer: number;
  appProfilePerPlayer: number;
  insurancePerPlayer: number;
  processingPct: number; // percent of a card transaction
  processingFlat: number; // dollars per card transaction
  cardShare: number; // percent of registrants who pay by card
  travel: number;
  lodging: number;
  staff: number;
  video: number;
  marketing: number;
  trophies: number;
  misc: number;
}

export interface PricingInputs {
  pricePerPlayer: number;
  earlyBirdPrice: number | null;
  earlyBirdShare: number; // percent of registrants at the early-bird price
  fillRate: number; // percent of the target roster that registers
}

export interface Scenario {
  id: string;
  name: string;
  profile: PlannerProfileKey;
  structure: EventStructure;
  costs: CostInputs;
  pricing: PricingInputs;
}

/** Portable file shape for saving and sharing scenarios between the app and the standalone file. */
export interface ScenarioFile {
  version: 1;
  scenarios: Scenario[];
}

// ---- Format resolution -------------------------------------------------------

export type GameStage = "pool" | "rr" | "crossover";

/** A fixed pairing of team indices (0-based) known before any result is in. */
export interface Pairing {
  a: number;
  b: number;
  stage: GameStage;
  /** Round-robin round the pairing belongs to (1-based), for ordering. */
  round: number;
}

export interface FormatPlan {
  kind: Exclude<FormatKind, "auto">;
  title: string;
  description: string;
  teams: number;
  /** Team indices per pool. One pool means a straight round robin. */
  pools: number[][];
  /** Every pre-determined game (pool, round robin, crossover). */
  games: Pairing[];
  /** True when a seeded placement round (1 vs 2, 3 vs 4...) follows the fixed games. */
  placementRound: boolean;
  /** Round-robin rounds used, for round-based plans (lets an uneven plan be re-selected). */
  rounds?: number;
  /** Guaranteed games per team, by team index, including the placement round. */
  guaranteed: number[];
  /** Every team has the same guaranteed count. */
  equal: boolean;
  /** Matches the requested games-per-team exactly for every team. */
  exact: boolean;
}

export interface FormatResolution {
  teams: number;
  gamesPerTeam: number;
  /** The plan in use. When nothing resolves exactly this is the closest workable plan. */
  plan: FormatPlan;
  /** Whether `plan` matches the request exactly. */
  exact: boolean;
  /** Closest workable alternatives when the request does not resolve (or other exact options). */
  alternatives: FormatPlan[];
  notes: string[];
}

// ---- Schedule ------------------------------------------------------------------

export type SessionKind = "game" | "placement" | "playoff" | "practice" | "allstar" | "idle";

export interface Session {
  day: number; // 0-based
  sheet: number; // 0-based
  start: number; // minutes from midnight
  end: number;
  kind: SessionKind;
  label: string;
  /** Team indices involved, when known in advance (round robin, practice). */
  teams: number[];
  /** Playoff/placement/pool stage text for the CSV ("Semifinal", "Pool A"...). */
  stage: string;
}

export interface SheetDaySummary {
  sheet: number;
  firstStart: number | null;
  lastEnd: number | null;
  bookedMinutes: number;
  activeMinutes: number;
}

export interface DaySummary {
  day: number;
  label: string;
  games: number;
  bookedHours: number;
  activeHours: number;
  idleHours: number;
  sheets: SheetDaySummary[];
}

export interface UnscheduledItem {
  label: string;
  minutes: number;
}

export interface ScheduleResult {
  sessions: Session[];
  days: DaySummary[];
  unscheduled: UnscheduledItem[];
  /** Ice hours the available windows are short by (0 when everything fits). */
  hoursShort: number;
  fits: boolean;
  totalGames: number; // round robin + placement + playoff + all-star
  roundRobinGames: number;
  placementGames: number;
  playoffGames: number;
  allStarGames: number;
  practiceSessions: number;
  bookedHours: number;
  activeHours: number;
  /** games[team][day] for the fixed round-robin games. */
  teamGamesByDay: number[][];
  warnings: string[];
}

// ---- P&L -------------------------------------------------------------------------

export interface MathLine {
  label: string;
  formula: string;
  value: number;
  money?: boolean;
}

export interface CostGroup {
  key: string;
  label: string;
  amount: number;
  lines: MathLine[];
}

export interface Sensitivity {
  fillRate: number;
  players: number;
  profit: number;
}

export interface PnlResult {
  rosterPerTeam: number;
  targetPlayers: number;
  players: number;
  grossRevenue: number;
  processingFees: number;
  netRevenue: number;
  effectivePrice: number;
  groups: CostGroup[];
  totalCost: number;
  netProfit: number;
  marginPct: number;
  revenuePerPlayer: number;
  costPerPlayer: number;
  profitPerPlayer: number;
  breakEvenPrice: number;
  breakEvenPlayers: number | null;
  breakEvenTeams: number | null;
  sensitivity: Sensitivity[];
  math: MathLine[];
}

export interface FamilyValue {
  price: number;
  guaranteedGames: number;
  gameMinutesTotal: number;
  skaterIceMinutesPerGame: number;
  skaterIceMinutesTotal: number;
  goalieIceMinutesPerGame: number;
  practiceMinutes: number;
  playoffOpportunity: string;
  allStarOpportunity: boolean;
  pricePerGame: number;
  pricePerIceMinute: number;
}

export interface PlanResult {
  scenario: Scenario;
  format: FormatResolution;
  schedule: ScheduleResult;
  pnl: PnlResult;
  family: FamilyValue;
  /** Input problems: shown inline instead of producing silent nonsense. */
  warnings: string[];
}
