// Public engine API. Pure and side-effect-free (no DOM, no Preact, no I/O),
// so this surface can be ported into Google Apps Script later.

export * from "./types.ts";
export { DEFAULT_POINT_SYSTEM } from "./pointSystem.ts";
export { computeStandings, hasUnequalSchedules, countsForStandings } from "./standings.ts";

export {
  buildContext,
  resolveDivisional,
  resolvePlayoffSeeding,
  rankStandings,
  divisionalProcedure,
  playoffSeedingProcedure,
} from "./tiebreak/index.ts";
export type { ResolveContext, ResolveResult, ContextOptions } from "./tiebreak/index.ts";
export { allPlayedEachOther, headToHeadPoints } from "./tiebreak/headToHead.ts";

export { buildPlayoffField } from "./playoff/field.ts";
export type { PlayoffField, FieldOptions } from "./playoff/field.ts";
export { buildBracket } from "./playoff/bracket.ts";
export type { BracketResult } from "./playoff/bracket.ts";

export { summarizePlayers, sortByScoring } from "./players/summary.ts";
export { generateWriteup } from "./players/writeup.ts";
export type { WriteupFacts, WriteupGameLine } from "./players/writeup.ts";
export type { Player, PlayerStatLine, PlayerSummary, PlayerPosition } from "./types.ts";

export { generateMatchups, circleMethodPairs } from "./schedule/matchups.ts";
export type { MatchupResult } from "./schedule/matchups.ts";
export { buildSlotGrid } from "./schedule/slotGrid.ts";
export type { VenueConfig, DayConfig, Slot } from "./schedule/slotGrid.ts";
export {
  DEFAULT_CONSTRAINTS,
  slotBlocked,
  teamAllowedInSlot,
  restOk,
} from "./schedule/constraints.ts";
export type {
  ScheduleConstraints,
  TeamAvailability,
  Blackout,
} from "./schedule/constraints.ts";
export { placeSchedule } from "./schedule/placement.ts";
export type { Assignment, PlacementResult, PlacementOptions } from "./schedule/placement.ts";
export { reflow } from "./schedule/reflow.ts";
export type { ReflowResult, ScheduleDiff } from "./schedule/reflow.ts";
export { fairnessReport } from "./schedule/fairness.ts";
export type { FairnessReport, TeamFairness, SheetUtilization } from "./schedule/fairness.ts";
export { unequalGameCounts } from "./schedule/validate.ts";
