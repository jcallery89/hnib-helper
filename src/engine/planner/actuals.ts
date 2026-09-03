import { rosterSize } from "./pnl.ts";
import type { Actuals, ActualsComparison, ImpliedRate, PlanResult, Scenario, VarianceLine } from "./types.ts";

// Model vs actual. The actual figures are typed in from the books; this file
// lines them up against the modelled P&L and backs out the unit rates they
// imply so the next scenario can start from real numbers.

export const ACTUAL_FIXED_KEYS = ["travel", "lodging", "staff", "video", "marketing", "trophies", "misc"] as const;
export const ACTUAL_COST_KEYS = ["ice", "officials", "scorekeepers", "coaches", "referral", "perPlayer", ...ACTUAL_FIXED_KEYS] as const;

const FIXED_LABELS: Record<(typeof ACTUAL_FIXED_KEYS)[number], string> = {
  travel: "Staff travel",
  lodging: "Lodging",
  staff: "Staff",
  video: "Video",
  marketing: "Marketing",
  trophies: "Trophies",
  misc: "Misc",
};

export function emptyActuals(): Actuals {
  return {
    players: null,
    grossRevenue: null,
    processingFees: null,
    ice: null,
    officials: null,
    scorekeepers: null,
    coaches: null,
    referral: null,
    perPlayer: null,
    travel: null,
    lodging: null,
    staff: null,
    video: null,
    marketing: null,
    trophies: null,
    misc: null,
    notes: "",
  };
}

/** True when at least one figure (not just notes) has been entered. */
export function hasActuals(a?: Actuals | null): boolean {
  if (!a) return false;
  return (Object.keys(a) as Array<keyof Actuals>).some((k) => k !== "notes" && typeof a[k] === "number");
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function sumEntered(a: Actuals, keys: readonly (keyof Actuals)[]): number | null {
  let any = false;
  let sum = 0;
  for (const k of keys) {
    const v = a[k];
    if (typeof v === "number") {
      any = true;
      sum += v;
    }
  }
  return any ? sum : null;
}

export function compareActuals(r: PlanResult): ActualsComparison | null {
  const a = r.scenario.actuals;
  if (!a || !hasActuals(a)) return null;
  const p = r.pnl;
  const group = (key: string) => p.groups.find((g) => g.key === key)?.amount ?? 0;
  const line = (key: string, label: string, model: number, actual: number | null, money = true): VarianceLine => ({
    key,
    label,
    model: r2(model),
    actual: actual === null ? null : r2(actual),
    variance: actual === null ? null : r2(actual - model),
    money,
  });

  const actualFixed = sumEntered(a, ACTUAL_FIXED_KEYS);
  const actualCost = sumEntered(a, ACTUAL_COST_KEYS);
  const actualNetRevenue = a.grossRevenue !== null ? a.grossRevenue - (a.processingFees ?? 0) : null;
  const actualProfit = actualNetRevenue !== null && actualCost !== null ? actualNetRevenue - actualCost : null;

  const lines: VarianceLine[] = [
    line("players", "Registered players", p.players, a.players, false),
    line("grossRevenue", "Gross revenue", p.grossRevenue, a.grossRevenue),
    line("processingFees", "Processing fees", p.processingFees, a.processingFees),
    line("netRevenue", "Net revenue", p.netRevenue, actualNetRevenue),
    line("ice", "Ice", group("ice"), a.ice),
    line("officials", "Officials", group("officials"), a.officials),
    line("scorekeepers", "Scorekeepers", group("scorekeepers"), a.scorekeepers),
    line("coaches", "Coaches", group("coaches"), a.coaches),
    line("referral", "Referral commissions", group("referral"), a.referral),
    line("perPlayer", "Per-player costs", group("perPlayer"), a.perPlayer),
    line("eventFixed", "Event fixed costs", group("eventFixed"), actualFixed),
    line("totalCost", "Total cost", p.totalCost, actualCost),
    line("netProfit", "Net profit", p.netProfit, actualProfit),
  ];
  if (actualProfit !== null && actualNetRevenue) {
    const margin = r2((actualProfit / actualNetRevenue) * 100);
    lines.push({ key: "margin", label: "Margin %", model: p.marginPct, actual: margin, variance: r2(margin - p.marginPct), money: false });
  }

  // Unit rates implied by the actuals, against the modelled structure.
  const s = r.scenario;
  const players = a.players ?? p.players;
  const games = r.schedule.totalGames;
  const hours = s.costs.iceBilling === "active" ? r.schedule.activeHours : r.schedule.bookedHours;
  const rates: ImpliedRate[] = [];
  if (a.grossRevenue !== null && players > 0) {
    rates.push({ key: "price", label: "Effective price per player", value: r2(a.grossRevenue / players), formula: `$${a.grossRevenue} / ${players} players`, money: true });
  }
  if (a.processingFees !== null && a.grossRevenue) {
    rates.push({ key: "fees", label: "Processing fees, percent of gross", value: r2((a.processingFees / a.grossRevenue) * 100), formula: `$${a.processingFees} / $${a.grossRevenue}`, money: false });
  }
  if (a.ice !== null && hours > 0) {
    rates.push({ key: "iceHourly", label: `Ice per ${s.costs.iceBilling === "active" ? "active" : "booked"} hour`, value: r2(a.ice / hours), formula: `$${a.ice} / ${hours} h`, money: true });
  }
  if (a.officials !== null && games > 0 && s.costs.refsPerGame > 0) {
    rates.push({ key: "refRate", label: "Per referee per game", value: r2(a.officials / (games * s.costs.refsPerGame)), formula: `$${a.officials} / (${games} games x ${s.costs.refsPerGame} refs)`, money: true });
  }
  if (a.scorekeepers !== null && games > 0) {
    rates.push({ key: "scorekeeperPerGame", label: "Scorekeeper per game", value: r2(a.scorekeepers / games), formula: `$${a.scorekeepers} / ${games} games`, money: true });
  }
  if (a.coaches !== null && s.structure.teams > 0) {
    rates.push({ key: "coachPerTeam", label: "Coach pay per team", value: r2(a.coaches / s.structure.teams), formula: `$${a.coaches} / ${s.structure.teams} teams`, money: true });
  }
  if (a.referral !== null && players > 0) {
    rates.push({ key: "referralPerPlayer", label: "Referral commission per player", value: r2(a.referral / players), formula: `$${a.referral} / ${players} players`, money: true });
  }
  if (a.perPlayer !== null && players > 0) {
    rates.push({ key: "otherPerPlayer", label: "Other cost per player", value: r2(a.perPlayer / players), formula: `$${a.perPlayer} / ${players} players`, money: true });
  }

  return { lines, rates, entered: lines.filter((l) => l.actual !== null).length };
}

/**
 * A copy of the scenario with its unit rates replaced by the ones the
 * actuals imply, so the modelled P&L reproduces the books and every
 * what-if built from it starts from real numbers.
 */
export function calibrateFromActuals(s: Scenario, r: PlanResult): { scenario: Scenario; changes: string[] } {
  const next: Scenario = structuredClone(s);
  const changes: string[] = [];
  const cmp = compareActuals(r);
  const a = s.actuals;
  if (!cmp || !a) return { scenario: next, changes };

  for (const rate of cmp.rates) {
    switch (rate.key) {
      case "price":
        next.pricing.pricePerPlayer = rate.value;
        next.pricing.earlyBirdPrice = null;
        next.pricing.earlyBirdShare = 0;
        changes.push(`Price per player set to $${rate.value} (actual gross over registered players).`);
        break;
      case "fees":
        next.costs.cardShare = 100;
        next.costs.processingFlat = 0;
        next.costs.processingPct = rate.value;
        changes.push(`Processing set to a flat ${rate.value}% of gross.`);
        break;
      case "iceHourly":
        next.costs.iceHourly = rate.value;
        next.costs.icePackage = null;
        next.costs.iceMinimum = null;
        changes.push(`Ice set to $${rate.value} per hour.`);
        break;
      case "refRate":
        next.costs.refRate = rate.value;
        changes.push(`Referee rate set to $${rate.value} per game.`);
        break;
      case "scorekeeperPerGame":
        next.costs.scorekeeperPerGame = rate.value;
        changes.push(`Scorekeeper set to $${rate.value} per game.`);
        break;
      case "coachPerTeam":
        next.costs.coachPerTeam = rate.value;
        changes.push(`Coach pay set to $${rate.value} per team.`);
        break;
      case "referralPerPlayer":
        next.costs.referralOn = rate.value > 0;
        next.costs.referredPerTeam = null;
        next.costs.referralPerPlayer = rate.value;
        changes.push(rate.value > 0 ? `Referral commission set to $${rate.value} per player.` : "Referral commission turned off.");
        break;
      case "otherPerPlayer":
        next.costs.otherPerPlayer = rate.value;
        changes.push(`Other per-player cost set to $${rate.value}.`);
        break;
    }
  }
  for (const k of ACTUAL_FIXED_KEYS) {
    const v = a[k];
    if (typeof v === "number") {
      next.costs[k] = v;
      changes.push(`${FIXED_LABELS[k]} set to $${v}.`);
    }
  }
  if (a.players !== null) {
    const target = s.structure.teams * rosterSize(s);
    if (target > 0) {
      next.pricing.fillRate = Math.round((a.players / target) * 1000) / 10;
      changes.push(`Fill rate set to ${next.pricing.fillRate}% so the model carries ${a.players} players.`);
    }
  }
  return { scenario: next, changes };
}
