import type { CostGroup, FamilyValue, FormatPlan, MathLine, PnlResult, Scenario, ScheduleResult, Sensitivity } from "./types.ts";

// Profit and loss for one scenario. Every number the UI shows comes from a
// MathLine here, so the "Show the math" panel is the same computation, not a
// second copy of it.

const money = (n: number) => Math.round(n * 100) / 100;

export function rosterSize(s: Scenario): number {
  return Math.max(0, s.structure.forwards + s.structure.defense + s.structure.goalies);
}

/** Registered players at a fill rate, rounded to whole people. */
export function playersAt(s: Scenario, fillRate: number): number {
  return Math.round(s.structure.teams * rosterSize(s) * (fillRate / 100));
}

interface CostBreakdown {
  groups: CostGroup[];
  total: number;
  /** Costs that do not move with the player count (ice, officials, coaches, event fixed). */
  fixed: number;
  /** Cost per registered player (jersey, app profile, insurance, referral share). */
  variablePerPlayer: number;
}

function costs(s: Scenario, schedule: ScheduleResult, players: number): CostBreakdown {
  const c = s.costs;
  const roster = rosterSize(s);
  const groups: CostGroup[] = [];

  // Ice
  const hours = c.iceBilling === "active" ? schedule.activeHours : schedule.bookedHours;
  const hourly = hours * c.iceHourly;
  let ice = hourly;
  const iceLines: MathLine[] = [
    { label: `Ice hours (${c.iceBilling === "active" ? "active blocks only" : "booked span, idle gaps included"})`, formula: `${schedule.bookedHours} booked, ${schedule.activeHours} active`, value: hours },
    { label: "Hourly ice", formula: `${hours} h x $${c.iceHourly}`, value: money(hourly), money: true },
  ];
  if (c.icePackage !== null && c.icePackage > 0) {
    ice = c.icePackage;
    iceLines.push({ label: "Flat weekend package (overrides hourly)", formula: `$${c.icePackage}`, value: money(ice), money: true });
  } else if (c.iceMinimum !== null && c.iceMinimum > hourly) {
    ice = c.iceMinimum;
    iceLines.push({ label: "Rink minimum applies", formula: `max($${money(hourly)}, $${c.iceMinimum})`, value: money(ice), money: true });
  }
  groups.push({ key: "ice", label: "Ice", amount: money(ice), lines: iceLines });

  // Officials and scorekeepers: every game that is not a practice.
  const games = schedule.totalGames;
  const officials = games * c.refsPerGame * c.refRate;
  groups.push({
    key: "officials",
    label: "Officials",
    amount: money(officials),
    lines: [{ label: "Referees", formula: `${games} games x ${c.refsPerGame} refs x $${c.refRate}`, value: money(officials), money: true }],
  });
  const scorekeepers = games * c.scorekeeperPerGame;
  groups.push({
    key: "scorekeepers",
    label: "Scorekeepers",
    amount: money(scorekeepers),
    lines: [{ label: "Scorekeepers", formula: `${games} games x $${c.scorekeeperPerGame}`, value: money(scorekeepers), money: true }],
  });

  // Coaches
  const coaches = s.structure.teams * c.coachPerTeam;
  groups.push({
    key: "coaches",
    label: "Coaches",
    amount: money(coaches),
    lines: [{ label: "Coach pay", formula: `${s.structure.teams} teams x $${c.coachPerTeam}`, value: money(coaches), money: true }],
  });

  // Referral commission: paid per referred registrant, capped at the roster.
  let referralPerPlayer = 0;
  let referral = 0;
  const referralLines: MathLine[] = [];
  if (c.referralOn) {
    const referredPerTeam = Math.min(roster, c.referredPerTeam ?? roster);
    referralPerPlayer = roster > 0 ? (referredPerTeam / roster) * c.referralPerPlayer : 0;
    const referredPlayers = Math.min(players, Math.round(referredPerTeam * s.structure.teams * (players / Math.max(1, s.structure.teams * roster))));
    referral = referredPlayers * c.referralPerPlayer;
    referralLines.push({ label: "Referred players", formula: `${referredPerTeam} per team x ${s.structure.teams} teams, scaled to ${players} registered`, value: referredPlayers });
    referralLines.push({ label: "Commission", formula: `${referredPlayers} x $${c.referralPerPlayer}`, value: money(referral), money: true });
  } else {
    referralLines.push({ label: "Referral commission", formula: "off", value: 0, money: true });
  }
  groups.push({ key: "referral", label: "Referral commissions", amount: money(referral), lines: referralLines });

  // Per-player costs
  const perPlayerRate = c.jerseyPerPlayer + c.appProfilePerPlayer + c.insurancePerPlayer;
  const perPlayer = perPlayerRate * players;
  groups.push({
    key: "perPlayer",
    label: "Per-player costs",
    amount: money(perPlayer),
    lines: [
      { label: "Jerseys", formula: `${players} x $${c.jerseyPerPlayer}`, value: money(players * c.jerseyPerPlayer), money: true },
      { label: "App profiles", formula: `${players} x $${c.appProfilePerPlayer}`, value: money(players * c.appProfilePerPlayer), money: true },
      { label: "Insurance", formula: `${players} x $${c.insurancePerPlayer}`, value: money(players * c.insurancePerPlayer), money: true },
    ],
  });

  // Event fixed costs, each its own line
  const fixedLines: MathLine[] = [
    { label: "Staff travel", formula: "flat", value: money(c.travel), money: true },
    { label: "Lodging", formula: "flat", value: money(c.lodging), money: true },
    { label: "Staff", formula: "flat", value: money(c.staff), money: true },
    { label: "Video", formula: "flat", value: money(c.video), money: true },
    { label: "Marketing", formula: "flat", value: money(c.marketing), money: true },
    { label: "Trophies", formula: "flat", value: money(c.trophies), money: true },
    { label: "Misc", formula: "flat", value: money(c.misc), money: true },
  ];
  const eventFixed = fixedLines.reduce((sum, l) => sum + l.value, 0);
  groups.push({ key: "eventFixed", label: "Event fixed costs", amount: money(eventFixed), lines: fixedLines });

  const total = groups.reduce((sum, g) => sum + g.amount, 0);
  return {
    groups,
    total: money(total),
    fixed: money(ice + officials + scorekeepers + coaches + eventFixed),
    variablePerPlayer: perPlayerRate + referralPerPlayer,
  };
}

interface Revenue {
  gross: number;
  fees: number;
  net: number;
  effectivePrice: number;
  lines: MathLine[];
}

function revenue(s: Scenario, players: number): Revenue {
  const p = s.pricing;
  const c = s.costs;
  const share = p.earlyBirdPrice !== null && p.earlyBirdPrice > 0 ? Math.min(100, Math.max(0, p.earlyBirdShare)) / 100 : 0;
  const effectivePrice = share * (p.earlyBirdPrice ?? 0) + (1 - share) * p.pricePerPlayer;
  const gross = players * effectivePrice;
  const cardShare = Math.min(100, Math.max(0, c.cardShare)) / 100;
  const pctFees = gross * cardShare * (c.processingPct / 100);
  const flatFees = players * cardShare * c.processingFlat;
  const fees = pctFees + flatFees;
  const lines: MathLine[] = [
    {
      label: "Effective price per player",
      formula: share > 0 ? `${Math.round(share * 100)}% x $${p.earlyBirdPrice} early bird + ${Math.round((1 - share) * 100)}% x $${p.pricePerPlayer}` : `$${p.pricePerPlayer}`,
      value: money(effectivePrice),
      money: true,
    },
    { label: "Gross revenue", formula: `${players} players x $${money(effectivePrice)}`, value: money(gross), money: true },
    { label: "Processing fees (percentage)", formula: `$${money(gross)} x ${Math.round(cardShare * 100)}% by card x ${c.processingPct}%`, value: money(pctFees), money: true },
    { label: "Processing fees (flat)", formula: `${players} x ${Math.round(cardShare * 100)}% by card x $${c.processingFlat}`, value: money(flatFees), money: true },
    { label: "Net revenue", formula: `$${money(gross)} - $${money(fees)}`, value: money(gross - fees), money: true },
  ];
  return { gross: money(gross), fees: money(fees), net: money(gross - fees), effectivePrice: money(effectivePrice), lines };
}

export function computePnl(s: Scenario, schedule: ScheduleResult): PnlResult {
  const roster = rosterSize(s);
  const targetPlayers = s.structure.teams * roster;
  const players = playersAt(s, s.pricing.fillRate);
  const rev = revenue(s, players);
  const cost = costs(s, schedule, players);
  const netProfit = money(rev.net - cost.total);
  const marginPct = rev.net > 0 ? Math.round((netProfit / rev.net) * 1000) / 10 : 0;
  const per = (n: number) => (players > 0 ? money(n / players) : 0);

  // Break-even price at the target roster: a single flat price (early bird ignored)
  // where net revenue equals total cost. Costs are re-run at the target roster
  // because the per-player lines move with the head count.
  const targetCost = costs(s, schedule, targetPlayers);
  const cardShare = Math.min(100, Math.max(0, s.costs.cardShare)) / 100;
  const keep = 1 - cardShare * (s.costs.processingPct / 100); // share of each dollar kept after percentage fees
  const flatPerPlayer = cardShare * s.costs.processingFlat;
  const breakEvenPrice = targetPlayers > 0 && keep > 0 ? money((targetCost.total + targetPlayers * flatPerPlayer) / (targetPlayers * keep)) : 0;

  // Break-even player count at the set price: fixed costs divided by what each
  // registrant contributes after fees and per-player costs.
  const contribution = rev.effectivePrice * keep - flatPerPlayer - cost.variablePerPlayer;
  const breakEvenPlayers = contribution > 0 ? Math.ceil(cost.fixed / contribution) : null;
  const breakEvenTeams = breakEvenPlayers !== null && roster > 0 ? Math.round((breakEvenPlayers / roster) * 10) / 10 : null;

  const sensitivity: Sensitivity[] = [80, 90, 100, 110].map((fillRate) => {
    const n = playersAt(s, fillRate);
    const r = revenue(s, n);
    const k = costs(s, schedule, n);
    return { fillRate, players: n, profit: money(r.net - k.total) };
  });

  const math: MathLine[] = [
    { label: "Roster per team", formula: `${s.structure.forwards} F + ${s.structure.defense} D + ${s.structure.goalies} G`, value: roster },
    { label: "Target players", formula: `${s.structure.teams} teams x ${roster}`, value: targetPlayers },
    { label: "Registered players", formula: `${targetPlayers} x ${s.pricing.fillRate}% fill`, value: players },
    ...rev.lines,
    ...cost.groups.flatMap((g) => g.lines),
    { label: "Total cost", formula: cost.groups.map((g) => `$${g.amount}`).join(" + "), value: cost.total, money: true },
    { label: "Net profit", formula: `$${rev.net} - $${cost.total}`, value: netProfit, money: true },
    { label: "Margin", formula: `$${netProfit} / $${rev.net}`, value: marginPct },
    {
      label: "Break-even price at target roster",
      formula: `($${targetCost.total} + ${targetPlayers} x $${money(flatPerPlayer)}) / (${targetPlayers} x ${money(keep)})`,
      value: breakEvenPrice,
      money: true,
    },
    {
      label: "Contribution per registrant",
      formula: `$${rev.effectivePrice} x ${money(keep)} - $${money(flatPerPlayer)} - $${money(cost.variablePerPlayer)}`,
      value: money(contribution),
      money: true,
    },
    {
      label: "Break-even players at set price",
      formula: contribution > 0 ? `ceil($${cost.fixed} fixed / $${money(contribution)})` : "contribution per player is not positive",
      value: breakEvenPlayers ?? 0,
    },
  ];

  return {
    rosterPerTeam: roster,
    targetPlayers,
    players,
    grossRevenue: rev.gross,
    processingFees: rev.fees,
    netRevenue: rev.net,
    effectivePrice: rev.effectivePrice,
    groups: cost.groups,
    totalCost: cost.total,
    netProfit,
    marginPct,
    revenuePerPlayer: per(rev.net),
    costPerPlayer: per(cost.total),
    profitPerPlayer: per(netProfit),
    breakEvenPrice,
    breakEvenPlayers,
    breakEvenTeams,
    sensitivity,
    math,
  };
}

/** What a family gets for the price. Skater ice assumes five skaters on the ice sharing the roster's skater spots. */
export function familyValue(s: Scenario, plan: FormatPlan, schedule: ScheduleResult): FamilyValue {
  const st = s.structure;
  const games = Math.min(...plan.guaranteed);
  const skaters = Math.max(1, st.forwards + st.defense);
  const goalies = Math.max(1, st.goalies);
  const skaterPerGame = (st.gameMinutes * 5) / skaters;
  const goaliePerGame = st.gameMinutes / goalies;
  const practiceMinutes = st.practice ? st.practiceMinutes : 0;
  const skaterTotal = skaterPerGame * games;
  let playoffOpportunity = "None";
  if (schedule.playoffGames > 0) {
    playoffOpportunity =
      st.playoffs === "quarters" ? "Eight-team bracket" : st.playoffs === "semis" ? "Semifinals and final" : "Championship final";
  }
  const price = s.pricing.pricePerPlayer;
  return {
    price,
    guaranteedGames: games,
    gameMinutesTotal: games * st.gameMinutes,
    skaterIceMinutesPerGame: Math.round(skaterPerGame * 10) / 10,
    skaterIceMinutesTotal: Math.round(skaterTotal),
    goalieIceMinutesPerGame: Math.round(goaliePerGame * 10) / 10,
    practiceMinutes,
    playoffOpportunity,
    allStarOpportunity: schedule.allStarGames > 0,
    pricePerGame: games > 0 ? money(price / games) : 0,
    pricePerIceMinute: skaterTotal + practiceMinutes > 0 ? money(price / (skaterTotal + practiceMinutes)) : 0,
  };
}
