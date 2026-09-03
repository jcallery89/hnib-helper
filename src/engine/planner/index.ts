import { resolveFormat } from "./format.ts";
import { buildSchedule, toMinutes } from "./schedule.ts";
import { computePnl, familyValue, rosterSize } from "./pnl.ts";
import { compareActuals } from "./actuals.ts";
import type { PlanResult, Scenario } from "./types.ts";

export * from "./types.ts";
export { PROFILES, PROFILE_ORDER, newScenario, defaultScenarios, dayLabelsFor } from "./defaults.ts";
export type { PlannerProfile } from "./defaults.ts";
export { resolveFormat, candidatePlans, describeGuarantee, labelForKind, poolName } from "./format.ts";
export { buildSchedule, seededRounds, fmtTime, toMinutes, teamName } from "./schedule.ts";
export { computePnl, familyValue, rosterSize, playersAt } from "./pnl.ts";
export { summaryText, scheduleCsv, comparisonRows } from "./text.ts";
export { emptyActuals, hasActuals, compareActuals, calibrateFromActuals, ACTUAL_FIXED_KEYS } from "./actuals.ts";

/**
 * Validate a scenario without throwing: out-of-range values are clamped on a
 * copy and every correction is reported so the UI can show it inline.
 */
export function validateScenario(input: Scenario): { scenario: Scenario; warnings: string[] } {
  const warnings: string[] = [];
  const s: Scenario = {
    ...input,
    structure: { ...input.structure, dayLabels: [...(input.structure.dayLabels ?? [])] },
    costs: { ...input.costs, otherPerPlayer: input.costs.otherPerPlayer ?? 0 },
    pricing: { ...input.pricing },
    event: input.event ?? null,
    actuals: input.actuals ? { ...input.actuals } : null,
  };
  const st = s.structure;

  const clampInt = (label: string, value: number, min: number, max: number): number => {
    const n = Number.isFinite(value) ? Math.round(value) : min;
    if (n < min) {
      warnings.push(`${label} cannot be below ${min}; using ${min}.`);
      return min;
    }
    if (n > max) {
      warnings.push(`${label} cannot be above ${max}; using ${max}.`);
      return max;
    }
    return n;
  };
  const nonNegative = (label: string, value: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) {
      warnings.push(`${label} cannot be negative; using 0.`);
      return 0;
    }
    return value;
  };

  st.teams = clampInt("Number of teams", st.teams, 2, 24);
  if (st.teams > 12) warnings.push("More than 12 teams is outside the range this planner was checked against.");
  st.forwards = clampInt("Forwards", st.forwards, 0, 30);
  st.defense = clampInt("Defense", st.defense, 0, 30);
  st.goalies = clampInt("Goalies", st.goalies, 0, 6);
  if (rosterSize(s) === 0) warnings.push("Roster is zero: no players means no revenue.");
  st.gamesPerTeam = clampInt("Games per team", st.gamesPerTeam, 1, 12);
  if (st.fixedRounds !== null && st.fixedRounds !== undefined) st.fixedRounds = clampInt("Fixed rounds", st.fixedRounds, 1, 24);
  else st.fixedRounds = null;
  st.practiceMinutes = clampInt("Practice minutes", st.practiceMinutes, 0, 240);
  st.days = clampInt("Days", st.days, 1, 7);
  st.sheets = clampInt("Ice sheets", st.sheets, 1, 4);
  st.blockMinutes = clampInt("Game block length", st.blockMinutes, 20, 240);
  st.bufferMinutes = clampInt("Buffer between blocks", st.bufferMinutes, 0, 120);
  st.restBlocks = clampInt("Rest blocks", st.restBlocks, 0, 4);
  st.gameMinutes = clampInt("Game minutes", st.gameMinutes, 10, 120);
  if (st.gameMinutes > st.blockMinutes) warnings.push("The game block is shorter than the game itself; blocks should cover warmup, both periods, and the resurface.");
  if (toMinutes(st.firstIce) >= toMinutes(st.lastIce)) warnings.push("First ice must be before last ice; no games can be scheduled.");

  const c = s.costs;
  for (const key of [
    "iceHourly",
    "refsPerGame",
    "refRate",
    "scorekeeperPerGame",
    "coachPerTeam",
    "referralPerPlayer",
    "jerseyPerPlayer",
    "appProfilePerPlayer",
    "insurancePerPlayer",
    "otherPerPlayer",
    "processingPct",
    "processingFlat",
    "travel",
    "lodging",
    "staff",
    "video",
    "marketing",
    "trophies",
    "misc",
  ] as const) {
    c[key] = nonNegative(labelFor(key), c[key]);
  }
  if (c.icePackage !== null) c.icePackage = nonNegative("Ice package", c.icePackage);
  if (c.iceMinimum !== null) c.iceMinimum = nonNegative("Rink minimum", c.iceMinimum);
  if (c.referredPerTeam !== null) c.referredPerTeam = nonNegative("Referred players per team", c.referredPerTeam);
  if (c.cardShare < 0 || c.cardShare > 100) {
    warnings.push("Card share must be between 0 and 100 percent.");
    c.cardShare = Math.min(100, Math.max(0, c.cardShare));
  }

  if (s.actuals) {
    const a = s.actuals as unknown as Record<string, number | string | null>;
    for (const key of Object.keys(a)) {
      if (key === "notes") continue;
      const v = a[key];
      if (typeof v === "number" && (!Number.isFinite(v) || v < 0)) {
        warnings.push(`Actual ${labelFor(key).toLowerCase()} cannot be negative; ignoring it.`);
        a[key] = null;
      }
    }
  }

  const p = s.pricing;
  p.pricePerPlayer = nonNegative("Price per player", p.pricePerPlayer);
  if (p.earlyBirdPrice !== null) {
    p.earlyBirdPrice = nonNegative("Early-bird price", p.earlyBirdPrice);
    if (p.earlyBirdPrice > p.pricePerPlayer) warnings.push("The early-bird price is higher than the regular price.");
  }
  if (p.earlyBirdShare < 0 || p.earlyBirdShare > 100) {
    warnings.push("Early-bird share must be between 0 and 100 percent.");
    p.earlyBirdShare = Math.min(100, Math.max(0, p.earlyBirdShare));
  }
  if (!Number.isFinite(p.fillRate) || p.fillRate < 0) {
    warnings.push("Fill rate cannot be negative; using 0.");
    p.fillRate = 0;
  } else if (p.fillRate > 100) {
    warnings.push("Fill rate is over 100 percent: rosters would be larger than the target.");
  }

  return { scenario: s, warnings };
}

function labelFor(key: string): string {
  return key
    .replace(/([A-Z])/g, (ch) => ` ${ch.toLowerCase()}`)
    .replace(/^./, (ch) => ch.toUpperCase())
    .replace(" pct", " percent");
}

/** Run the whole planner for one scenario: format, schedule, P&L, family value. */
export function planScenario(input: Scenario): PlanResult {
  const { scenario, warnings } = validateScenario(input);
  const format = resolveFormat(
    scenario.structure.teams,
    scenario.structure.gamesPerTeam,
    scenario.structure.format,
    scenario.structure.fixedRounds,
  );
  const schedule = buildSchedule(
    scenario.structure,
    format.plan,
    scenario.structure.playoffs,
    scenario.event?.teams.map((t) => t.name),
  );
  const pnl = computePnl(scenario, schedule);
  const family = familyValue(scenario, format.plan, schedule);
  const partial: PlanResult = { scenario, format, schedule, pnl, family, actuals: null, warnings };
  partial.actuals = compareActuals(partial);
  return partial;
}
