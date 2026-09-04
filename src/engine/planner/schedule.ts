import { dayLabelsFor } from "./defaults.ts";
import { poolName } from "./format.ts";
import type {
  DaySummary,
  EventStructure,
  FormatPlan,
  Pairing,
  PlayoffFormat,
  ScheduleResult,
  Session,
  SheetDaySummary,
  UnscheduledItem,
} from "./types.ts";

// Weekend schedule builder. Fills ice in this order: round-robin games, then
// practices, then playoffs, then the All-Star game. Games are placed into
// uniform blocks (the unit the rink sells), balanced across days, and a team
// never plays back-to-back blocks unless restBlocks is set to 0.

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function teamName(index: number): string {
  return `Team ${index + 1}`;
}

/** How the placement round and playoffs combine into labelled game rounds. */
interface SeededRound {
  stage: string;
  games: Array<{ label: string }>;
  kind: "placement" | "playoff";
}

/**
 * Seeded rounds after the round robin. A placement round is reused rather than
 * stacked: "final only" labels 1 vs 2 as the Final, "semis plus final" turns the
 * placement pairs into semifinals, "quarters" into an eight-team bracket.
 */
export function seededRounds(plan: FormatPlan, playoffs: PlayoffFormat, teams: number): { rounds: SeededRound[]; notes: string[] } {
  const notes: string[] = [];
  const rounds: SeededRound[] = [];
  const twoPools = plan.pools.length === 2;
  const seed = (n: number) => `Seed ${n}`;
  const poolSeed = (pool: number, n: number) => `Pool ${poolName(pool)} #${n}`;

  const placementPairs = (from: number): Array<{ label: string }> => {
    const out: Array<{ label: string }> = [];
    for (let s = from; s + 1 <= teams; s += 2) out.push({ label: `${seed(s)} vs ${seed(s + 1)}` });
    return out;
  };

  let effective = playoffs;
  if (effective === "quarters" && teams < 8) {
    notes.push(`Quarterfinals need 8 teams; with ${teams} the bracket starts at the semifinals.`);
    effective = "semis";
  }
  if (effective === "semis" && teams < 3) {
    notes.push("Semifinals need at least 3 teams; using a final only.");
    effective = "final";
  }

  if (effective === "none") {
    if (plan.placementRound) rounds.push({ stage: "Placement", kind: "placement", games: placementPairs(1) });
    return { rounds, notes };
  }

  if (effective === "final") {
    const games: Array<{ label: string }> = twoPools
      ? [{ label: `${poolSeed(0, 1)} vs ${poolSeed(1, 1)}` }]
      : [{ label: `${seed(1)} vs ${seed(2)}` }];
    if (plan.placementRound) {
      // The placement round IS the final round: 1 vs 2 for the title, 3 vs 4 for third, then the rest.
      const rest = placementPairs(3);
      rounds.push({
        stage: "Final",
        kind: "playoff",
        games: [{ label: `Championship: ${seed(1)} vs ${seed(2)}` }, ...rest.map((g, i) => ({ label: `${i === 0 ? "Third place: " : "Placement: "}${g.label}` }))],
      });
      notes.push("Final only: the placement round doubles as the final round (1 vs 2 for the championship, 3 vs 4 for third place).");
    } else {
      rounds.push({ stage: "Final", kind: "playoff", games });
    }
    return { rounds, notes };
  }

  if (effective === "semis") {
    let semis: Array<{ label: string }>;
    if (teams === 3) {
      semis = [{ label: `Play-in: ${seed(2)} vs ${seed(3)}` }];
      notes.push("Three teams: seed 1 waits while seeds 2 and 3 play a play-in game for the final.");
    } else if (twoPools) {
      semis = [
        { label: `Semifinal 1: ${poolSeed(0, 1)} vs ${poolSeed(1, 2)}` },
        { label: `Semifinal 2: ${poolSeed(1, 1)} vs ${poolSeed(0, 2)}` },
      ];
    } else {
      semis = [
        { label: `Semifinal 1: ${seed(1)} vs ${seed(4)}` },
        { label: `Semifinal 2: ${seed(2)} vs ${seed(3)}` },
      ];
    }
    if (plan.placementRound) {
      // Placement round becomes the semifinal round; teams outside the top four still get their placement game.
      const rest = placementPairs(5).map((g) => ({ label: `Placement: ${g.label}` }));
      rounds.push({ stage: "Semifinals", kind: "playoff", games: [...semis, ...rest] });
      notes.push("Semis plus final: the placement round becomes the semifinal round (1 vs 4, 2 vs 3), then the final is added.");
    } else {
      rounds.push({ stage: "Semifinals", kind: "playoff", games: semis });
    }
    rounds.push({
      stage: "Final",
      kind: "playoff",
      games: [{ label: teams === 3 ? `Final: ${seed(1)} vs play-in winner` : "Final: Semifinal 1 winner vs Semifinal 2 winner" }],
    });
    return { rounds, notes };
  }

  // Quarterfinals: eight-team single elimination, 1v8 / 4v5 / 2v7 / 3v6 on overall seeds.
  const quarters = [
    { label: `Quarterfinal 1: ${seed(1)} vs ${seed(8)}` },
    { label: `Quarterfinal 2: ${seed(4)} vs ${seed(5)}` },
    { label: `Quarterfinal 3: ${seed(2)} vs ${seed(7)}` },
    { label: `Quarterfinal 4: ${seed(3)} vs ${seed(6)}` },
  ];
  const rest = plan.placementRound ? placementPairs(9).map((g) => ({ label: `Placement: ${g.label}` })) : [];
  if (plan.placementRound) notes.push("Quarterfinals: the placement round becomes the quarterfinal round for the top eight, then semifinals and the final are added.");
  if (teams > 8 && !plan.placementRound) notes.push(`Only the top 8 of ${teams} teams make the quarterfinals.`);
  rounds.push({ stage: "Quarterfinals", kind: "playoff", games: [...quarters, ...rest] });
  rounds.push({
    stage: "Semifinals",
    kind: "playoff",
    games: [
      { label: "Semifinal 1: Quarterfinal 1 winner vs Quarterfinal 2 winner" },
      { label: "Semifinal 2: Quarterfinal 3 winner vs Quarterfinal 4 winner" },
    ],
  });
  rounds.push({ stage: "Final", kind: "playoff", games: [{ label: "Final: Semifinal 1 winner vs Semifinal 2 winner" }] });
  return { rounds, notes };
}

/** Split `total` across `days` as evenly as possible, extras on the earliest days. */
function distribute(total: number, days: number): number[] {
  const base = Math.floor(total / days);
  let extra = total - base * days;
  return Array.from({ length: days }, () => {
    const n = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return n;
  });
}

function gameLabel(g: Pairing, plan: FormatPlan, nameOf: (i: number) => string): { label: string; stage: string } {
  const label = `${nameOf(g.a)} vs ${nameOf(g.b)}`;
  if (g.stage === "pool") {
    const pool = plan.pools.findIndex((p) => p.includes(g.a));
    return { label, stage: `Pool ${poolName(pool)}` };
  }
  if (g.stage === "crossover") return { label, stage: "Crossover" };
  return { label, stage: "Round robin" };
}

export function buildSchedule(
  structure: EventStructure,
  plan: FormatPlan,
  playoffs: PlayoffFormat,
  teamNames?: string[],
): ScheduleResult {
  // First pass: round robin balanced across days with the last day reserving
  // its playoff blocks. If the seeded rounds still spill past last ice (the
  // rest rule can leave open blocks the reservation did not foresee), give
  // the playoffs the whole last day and move the round robin earlier.
  const first = buildOnce(structure, plan, playoffs, teamNames, false);
  if (first.seededShort && Math.round(structure.days) > 1) {
    const second = buildOnce(structure, plan, playoffs, teamNames, true);
    if (second.fits || second.hoursShort < first.hoursShort) {
      second.warnings.push("Playoffs take the whole last day; the round robin finishes the day before.");
      return second;
    }
  }
  return first;
}

function buildOnce(
  structure: EventStructure,
  plan: FormatPlan,
  playoffs: PlayoffFormat,
  teamNames: string[] | undefined,
  reserveLastDay: boolean,
): ScheduleResult & { seededShort: boolean } {
  const warnings: string[] = [];
  const nameOf = (i: number) => teamNames?.[i] || teamName(i);
  const days = Math.max(1, Math.round(structure.days));
  const sheets = Math.max(1, Math.round(structure.sheets));
  const block = Math.max(1, Math.round(structure.blockMinutes));
  const buffer = Math.max(0, Math.round(structure.bufferMinutes));
  const step = block + buffer;
  const first = toMinutes(structure.firstIce);
  const last = toMinutes(structure.lastIce);
  const restGap = (Math.max(0, Math.round(structure.restBlocks)) + 1) * step;
  const teams = plan.teams;
  const labels = dayLabelsFor(days, structure.dayLabels);

  const sessions: Session[] = [];
  const unscheduled: UnscheduledItem[] = [];
  // Per sheet per day: the minute the next session may start.
  const cursor: number[][] = Array.from({ length: days }, () => new Array<number>(sheets).fill(first));
  const lastStart: Array<{ day: number; start: number } | null> = new Array(teams).fill(null);
  const teamGamesByDay: number[][] = Array.from({ length: teams }, () => new Array<number>(days).fill(0));
  const gamesTotal = new Array<number>(teams).fill(0);

  const rested = (team: number, day: number, start: number) => {
    const prev = lastStart[team];
    if (!prev || prev.day !== day) return true;
    return start - prev.start >= restGap;
  };
  const fitsDay = (start: number, minutes: number) => start >= first && start + minutes <= last;

  // ---- 1. Round-robin games, balanced across days ---------------------------
  // Even split, except the last day first reserves the blocks its seeded
  // rounds and All-Star game will need (a round is ceil(games / sheets) rows,
  // plus the rest rows before it), so playoffs are not squeezed out.
  const remaining = [...plan.games];
  const seeded = seededRounds(plan, playoffs, teams);
  const rowsPerDay = last - first - block >= 0 ? Math.floor((last - first - block) / step) + 1 : 0;
  const reservedRows =
    seeded.rounds.reduce((sum, r) => sum + Math.ceil(r.games.length / sheets) + Math.max(0, Math.round(structure.restBlocks)), 0) +
    (structure.allStarGame ? 1 : 0);
  const capacity = Array.from({ length: days }, (_, d) =>
    d === days - 1 ? (reserveLastDay && days > 1 ? 0 : Math.max(0, rowsPerDay - reservedRows)) * sheets : rowsPerDay * sheets,
  );
  const budget = distribute(remaining.length, days);
  // Push anything over a day's capacity onto the earliest days with room.
  for (let d = days - 1; d >= 0; d--) {
    const over = budget[d] - capacity[d];
    if (over <= 0) continue;
    budget[d] = capacity[d];
    let left = over;
    for (let e = 0; e < days && left > 0; e++) {
      if (e === d) continue;
      const room = capacity[e] - budget[e];
      if (room <= 0) continue;
      const take = Math.min(room, left);
      budget[e] += take;
      left -= take;
    }
    budget[d] += left; // nowhere else to go; it will spill or go unscheduled
  }
  let carry = 0;
  const rrRows: Array<{ day: number; row: number; start: number }> = [];
  for (let day = 0; day < days; day++) {
    let placedToday = 0;
    const want = budget[day] + carry;
    for (let row = 0; remaining.length > 0 && placedToday < want; row++) {
      const start = first + row * step;
      if (!fitsDay(start, block)) break;
      rrRows.push({ day, row, start });
      for (let sheet = 0; sheet < sheets && placedToday < want && remaining.length > 0; sheet++) {
        let best = -1;
        let bestScore = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const g = remaining[i];
          if (!rested(g.a, day, start) || !rested(g.b, day, start)) continue;
          // Balance: fewest games today, then fewest games overall, then pool games before crossovers, then input order.
          const score =
            (teamGamesByDay[g.a][day] + teamGamesByDay[g.b][day]) * 1000 +
            (gamesTotal[g.a] + gamesTotal[g.b]) * 100 +
            (g.stage === "crossover" ? 50 : 0) +
            g.round;
          if (score < bestScore) {
            bestScore = score;
            best = i;
          }
        }
        if (best < 0) {
          sessions.push({ day, sheet, start, end: start + block, kind: "idle", label: "Open ice", teams: [], stage: "" });
          cursor[day][sheet] = start + step;
          continue;
        }
        const [g] = remaining.splice(best, 1);
        const { label, stage } = gameLabel(g, plan, nameOf);
        sessions.push({ day, sheet, start, end: start + block, kind: "game", label, teams: [g.a, g.b], stage });
        for (const t of [g.a, g.b]) {
          lastStart[t] = { day, start };
          teamGamesByDay[t][day] += 1;
          gamesTotal[t] += 1;
        }
        cursor[day][sheet] = start + step;
        placedToday += 1;
      }
    }
    carry = want - placedToday;
  }
  if (remaining.length > 0) {
    for (const g of remaining) unscheduled.push({ label: `${gameLabel(g, plan, nameOf).label} (round robin)`, minutes: block });
  }
  // Drop trailing idle cells on each sheet/day: nothing was booked after them.
  trimTrailingIdle(sessions, cursor);

  // ---- 2. Practices: idle round-robin cells first, then appended -------------
  let practiceCount = 0;
  if (structure.practice && structure.practiceMinutes > 0) {
    const pm = Math.round(structure.practiceMinutes);
    const need: number[] = Array.from({ length: teams }, (_, i) => i);
    const busy = (team: number, day: number, start: number, end: number) =>
      sessions.some((s) => s.day === day && s.teams.includes(team) && s.start < end && s.end > start);
    if (pm <= block) {
      for (const s of sessions) {
        if (s.kind !== "idle" || need.length === 0) continue;
        const idx = need.findIndex((t) => !busy(t, s.day, s.start, s.start + pm));
        if (idx < 0) continue;
        const [t] = need.splice(idx, 1);
        s.kind = "practice";
        s.label = `${nameOf(t)} practice`;
        s.teams = [t];
        s.stage = "Practice";
        s.end = s.start + pm;
        practiceCount += 1;
      }
    }
    const perDay = distribute(need.length, days);
    let leftover = 0;
    for (let day = 0; day < days && need.length > 0; day++) {
      let placed = 0;
      const want = perDay[day] + leftover;
      while (placed < want && need.length > 0) {
        const sheet = earliestSheet(cursor[day]);
        const start = cursor[day][sheet];
        if (!fitsDay(start, pm)) break;
        const idx = need.findIndex((t) => !busy(t, day, start, start + pm));
        const t = idx >= 0 ? need.splice(idx, 1)[0] : need.shift()!;
        sessions.push({ day, sheet, start, end: start + pm, kind: "practice", label: `${nameOf(t)} practice`, teams: [t], stage: "Practice" });
        cursor[day][sheet] = start + pm + buffer;
        placed += 1;
        practiceCount += 1;
      }
      leftover = want - placed;
    }
    for (const t of need) unscheduled.push({ label: `${nameOf(t)} practice`, minutes: pm });
  }

  // ---- 3. Placement round and playoffs, on the last day ---------------------
  const seededMissBefore = unscheduled.length;
  const { rounds, notes } = seeded;
  warnings.push(...notes);
  const lastDay = days - 1;
  let placementGames = 0;
  let playoffGames = 0;
  // Every team could be in a seeded game, so the round waits for the latest rest window.
  let ready = first;
  for (const p of lastStart) if (p && p.day === lastDay) ready = Math.max(ready, p.start + restGap);
  for (const round of rounds) {
    let roundLatestStart = ready;
    for (const g of round.games) {
      const sheet = earliestSheet(cursor[lastDay]);
      const start = Math.max(cursor[lastDay][sheet], ready);
      if (!fitsDay(start, block)) {
        unscheduled.push({ label: `${g.label} (${round.stage})`, minutes: block });
        continue;
      }
      sessions.push({ day: lastDay, sheet, start, end: start + block, kind: round.kind, label: g.label, teams: [], stage: round.stage });
      cursor[lastDay][sheet] = start + step;
      roundLatestStart = Math.max(roundLatestStart, start);
      if (round.kind === "placement") placementGames += 1;
      else playoffGames += 1;
    }
    ready = roundLatestStart + restGap;
  }

  // ---- 4. All-Star game, the very last block ----------------------------------
  // All-Star rosters draw from every team, so no rest rule applies; it simply
  // takes the next free block on the last day.
  let allStarGames = 0;
  if (structure.allStarGame) {
    const sheet = earliestSheet(cursor[lastDay]);
    const start = cursor[lastDay][sheet];
    if (fitsDay(start, block)) {
      sessions.push({ day: lastDay, sheet, start, end: start + block, kind: "allstar", label: "All-Star Game", teams: [], stage: "All-Star" });
      cursor[lastDay][sheet] = start + step;
      allStarGames = 1;
    } else {
      unscheduled.push({ label: "All-Star Game", minutes: block });
    }
  }

  // ---- Summaries ----------------------------------------------------------------
  sessions.sort((a, b) => a.day - b.day || a.start - b.start || a.sheet - b.sheet);
  const daySummaries: DaySummary[] = [];
  for (let day = 0; day < days; day++) {
    const perSheet: SheetDaySummary[] = [];
    let games = 0;
    for (let sheet = 0; sheet < sheets; sheet++) {
      const mine = sessions.filter((s) => s.day === day && s.sheet === sheet);
      const live = mine.filter((s) => s.kind !== "idle");
      const firstStart = mine.length ? Math.min(...mine.map((s) => s.start)) : null;
      const lastEnd = mine.length ? Math.max(...mine.map((s) => s.end)) : null;
      const booked = firstStart !== null && lastEnd !== null ? lastEnd - firstStart : 0;
      const active = live.reduce((sum, s) => sum + (s.end - s.start), 0);
      games += live.filter((s) => s.kind !== "practice").length;
      perSheet.push({ sheet, firstStart, lastEnd, bookedMinutes: booked, activeMinutes: active });
    }
    const bookedHours = perSheet.reduce((s, x) => s + x.bookedMinutes, 0) / 60;
    const activeHours = perSheet.reduce((s, x) => s + x.activeMinutes, 0) / 60;
    daySummaries.push({
      day,
      label: labels[day],
      games,
      bookedHours: round2(bookedHours),
      activeHours: round2(activeHours),
      idleHours: round2(bookedHours - activeHours),
      sheets: perSheet,
    });
  }

  const roundRobinGames = sessions.filter((s) => s.kind === "game").length;
  const seededShort = unscheduled.length > seededMissBefore;
  const shortMinutes = unscheduled.reduce((s, u) => s + u.minutes, 0);
  if (shortMinutes > 0) {
    warnings.push(
      `The schedule does not fit in the available ice: ${unscheduled.length} session${unscheduled.length === 1 ? "" : "s"} (${round2(shortMinutes / 60)} hours) could not be placed. Add hours, a day, or a sheet.`,
    );
  }
  if (first >= last) warnings.push("First ice must be before last ice.");

  return {
    sessions,
    days: daySummaries,
    unscheduled,
    hoursShort: round2(shortMinutes / 60),
    fits: shortMinutes === 0,
    totalGames: roundRobinGames + placementGames + playoffGames + allStarGames,
    roundRobinGames,
    placementGames,
    playoffGames,
    allStarGames,
    practiceSessions: practiceCount,
    bookedHours: round2(daySummaries.reduce((s, d) => s + d.bookedHours, 0)),
    activeHours: round2(daySummaries.reduce((s, d) => s + d.activeHours, 0)),
    teamGamesByDay,
    teamNames: Array.from({ length: teams }, (_, i) => nameOf(i)),
    warnings,
    seededShort,
  };
}

function earliestSheet(cursors: number[]): number {
  let best = 0;
  for (let i = 1; i < cursors.length; i++) if (cursors[i] < cursors[best]) best = i;
  return best;
}

/** Remove idle cells that sit after the last real session on their sheet/day and rewind the cursor. */
function trimTrailingIdle(sessions: Session[], cursor: number[][]): void {
  for (let day = 0; day < cursor.length; day++) {
    for (let sheet = 0; sheet < cursor[day].length; sheet++) {
      for (;;) {
        const mine = sessions.filter((s) => s.day === day && s.sheet === sheet);
        if (mine.length === 0) break;
        const lastSession = mine.reduce((a, b) => (b.start > a.start ? b : a));
        if (lastSession.kind !== "idle") break;
        sessions.splice(sessions.indexOf(lastSession), 1);
        cursor[day][sheet] = lastSession.start;
      }
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
