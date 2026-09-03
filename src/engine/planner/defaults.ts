import type {
  CostInputs,
  EventStructure,
  PlannerProfileKey,
  PricingInputs,
  Scenario,
} from "./types.ts";

// Every default the planner opens with lives here. Change a number in this
// file to change what a fresh scenario starts from. Money is in dollars,
// percentages are whole numbers (3 means 3 percent), times are "HH:MM".

export interface PlannerProfile {
  key: PlannerProfileKey;
  label: string;
  venue: string;
  description: string;
  structure: EventStructure;
  costs: CostInputs;
  pricing: PricingInputs;
}

/** Satellite weekend outside Massachusetts (the Virginia test case). */
const SATELLITE_STRUCTURE: EventStructure = {
  teams: 4,
  forwards: 9,
  defense: 6,
  goalies: 2,
  gamesPerTeam: 4,
  format: "auto",
  fixedRounds: null,
  playoffs: "none",
  allStarGame: false,
  practice: false,
  practiceMinutes: 60,
  days: 2,
  dayLabels: ["Saturday", "Sunday"],
  firstIce: "07:00",
  lastIce: "22:00",
  sheets: 1,
  blockMinutes: 80,
  bufferMinutes: 0,
  restBlocks: 1,
  gameMinutes: 46,
};

const SATELLITE_COSTS: CostInputs = {
  iceHourly: 350,
  iceBilling: "span",
  icePackage: null,
  iceMinimum: null,
  refsPerGame: 2,
  refRate: 60,
  scorekeeperPerGame: 40,
  coachPerTeam: 300,
  referralOn: false,
  referralPerPlayer: 25,
  referredPerTeam: null,
  jerseyPerPlayer: 0,
  appProfilePerPlayer: 0,
  insurancePerPlayer: 0,
  otherPerPlayer: 0,
  processingPct: 3,
  processingFlat: 0.3,
  cardShare: 90,
  travel: 800,
  lodging: 600,
  staff: 0,
  video: 0,
  marketing: 200,
  trophies: 0,
  misc: 250,
};

const SATELLITE_PRICING: PricingInputs = {
  pricePerPlayer: 299,
  earlyBirdPrice: null,
  earlyBirdShare: 0,
  fillRate: 100,
};

/**
 * Worcester Ice Center events. Structure mirrors the festivals the tournament
 * tool has synced (two sheets, 105-minute blocks, four games per team, an
 * eight-team playoff bracket). Home-venue costs (travel, lodging) start at zero.
 * The ice rate is a placeholder until the Worcester contract number is entered.
 */
const MA_STRUCTURE: EventStructure = {
  teams: 8,
  forwards: 9,
  defense: 6,
  goalies: 2,
  gamesPerTeam: 4,
  format: "auto",
  fixedRounds: null,
  playoffs: "quarters",
  allStarGame: false,
  practice: false,
  practiceMinutes: 60,
  days: 3,
  dayLabels: ["Friday", "Saturday", "Sunday"],
  firstIce: "08:00",
  lastIce: "20:00",
  sheets: 2,
  blockMinutes: 105,
  bufferMinutes: 0,
  restBlocks: 1,
  gameMinutes: 46,
};

const MA_COSTS: CostInputs = {
  ...SATELLITE_COSTS,
  iceHourly: 350,
  travel: 0,
  lodging: 0,
  staff: 0,
  marketing: 200,
  trophies: 0,
  misc: 250,
};

export const PROFILES: Record<PlannerProfileKey, PlannerProfile> = {
  satellite: {
    key: "satellite",
    label: "Satellite",
    venue: "Regional partner rink (outside Massachusetts)",
    description:
      "Low-cost weekend at a partner rink to identify players for the Major Showcase. Priced below the festival rate.",
    structure: SATELLITE_STRUCTURE,
    costs: SATELLITE_COSTS,
    pricing: SATELLITE_PRICING,
  },
  "ma-festival": {
    key: "ma-festival",
    label: "MA Festival",
    venue: "Worcester Ice Center, MA",
    description: "Festival at Worcester Ice Center: four games plus playoffs, two sheets, three days.",
    structure: MA_STRUCTURE,
    costs: MA_COSTS,
    pricing: { pricePerPlayer: 379, earlyBirdPrice: null, earlyBirdShare: 0, fillRate: 100 },
  },
  "ma-showcase": {
    key: "ma-showcase",
    label: "MA Showcase",
    venue: "Worcester Ice Center, MA",
    description: "Showcase at Worcester Ice Center at the showcase price point.",
    structure: MA_STRUCTURE,
    costs: MA_COSTS,
    pricing: { pricePerPlayer: 479, earlyBirdPrice: null, earlyBirdShare: 0, fillRate: 100 },
  },
};

export const PROFILE_ORDER: PlannerProfileKey[] = ["satellite", "ma-festival", "ma-showcase"];

let counter = 0;

/** A fresh scenario from a profile. Deep-copies the defaults so edits never leak back. */
export function newScenario(profile: PlannerProfileKey, name?: string, id?: string): Scenario {
  const p = PROFILES[profile];
  counter += 1;
  return {
    id: id ?? `s${Date.now().toString(36)}${counter}`,
    name: name ?? `${p.label} baseline`,
    profile,
    structure: { ...p.structure, dayLabels: [...p.structure.dayLabels] },
    costs: { ...p.costs },
    pricing: { ...p.pricing },
  };
}

/** The four side-by-side scenarios the tool opens with for the Virginia test case. */
export function defaultScenarios(): Scenario[] {
  const a = newScenario("satellite", "4 games, no practice", "sat-4g");
  const b = newScenario("satellite", "3 games + 60 min practice", "sat-3g-practice");
  b.structure.gamesPerTeam = 3;
  b.structure.practice = true;
  const c = newScenario("satellite", "4 games + playoffs", "sat-4g-playoffs");
  c.structure.playoffs = "semis";
  const d = newScenario("satellite", "3 games + All-Star", "sat-3g-allstar");
  d.structure.gamesPerTeam = 3;
  d.structure.allStarGame = true;
  return [a, b, c, d];
}

/** Ordered day names for a day count, reusing the profile labels where possible. */
export function dayLabelsFor(days: number, labels: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(labels[i] ?? `Day ${i + 1}`);
  return out;
}
