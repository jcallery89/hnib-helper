import type { EventLink, EventStructure, LinkedTeam, PlayoffFormat } from "../engine/planner/types.ts";
import type { Dataset } from "./dataset.ts";

// Seed a planner scenario from a synced event: the teams by name with their
// roster counts and coaches, how many games each team played, the block
// cadence, days, sheets, and playoff rounds. Nothing about money lives in the
// tournament data, so costs and pricing are left to the profile and the
// actuals are typed in by hand.

export interface DerivedStructure {
  structure: Partial<EventStructure>;
  /** The event and its teams, kept on the scenario for names and headcount. */
  link: EventLink;
  /** Fill rate that makes the model carry the real headcount (null unless rosters look complete). */
  fillRate: number | null;
  /** Every team has a roster of at least MIN_ROSTER players, so the headcount can be trusted. */
  rosterComplete: boolean;
  notes: string[];
}

/** A team with fewer players than this has not really synced a roster. */
const MIN_ROSTER = 5;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function structureFromEvent(data: Dataset): DerivedStructure {
  const notes: string[] = [];
  const out: Partial<EventStructure> = {};

  // Teams in division order, then by name, so pool A lines up with the first division.
  const divisionIndex = new Map(data.divisions.map((d, i) => [d.id, i]));
  const divisionName = new Map(data.divisions.map((d) => [d.id, d.name]));
  const players = data.players ?? [];
  const rosterCount = new Map<string, number>();
  for (const p of players) rosterCount.set(p.teamId, (rosterCount.get(p.teamId) ?? 0) + 1);
  const sortedTeams = [...data.teams].sort(
    (a, b) => (divisionIndex.get(a.divisionId) ?? 99) - (divisionIndex.get(b.divisionId) ?? 99) || a.name.localeCompare(b.name),
  );
  const linkedTeams: LinkedTeam[] = sortedTeams.map((t) => ({
    name: t.name,
    players: rosterCount.get(t.id) ?? 0,
    coach: t.coach || undefined,
    division: divisionName.get(t.divisionId),
  }));
  const totalPlayers = linkedTeams.reduce((s, t) => s + t.players, 0);
  const coachesNamed = linkedTeams.filter((t) => t.coach).length;

  const teams = data.teams.length;
  if (teams >= 2) out.teams = teams;
  notes.push(`${teams} teams${data.divisions.length > 1 ? ` in ${data.divisions.length} divisions` : ""}${coachesNamed ? `, ${coachesNamed} with a named coach` : ""}.`);

  // Games per team from the round robin.
  const rr = data.games.filter((g) => g.round === "rr");
  const perTeam = new Map<string, number>();
  for (const g of rr) for (const t of [g.homeTeamId, g.awayTeamId]) perTeam.set(t, (perTeam.get(t) ?? 0) + 1);
  const counts = [...perTeam.values()];
  const games = counts.length ? Math.max(...counts) : 0;
  if (games > 0) {
    out.gamesPerTeam = games;
    notes.push(`${games} round-robin games per team (${rr.length} games).`);
  }

  // Playoff rounds present.
  const rounds = new Set(data.games.map((g) => g.round));
  let playoffs: PlayoffFormat = "none";
  if (rounds.has("qf")) playoffs = "quarters";
  else if (rounds.has("sf")) playoffs = "semis";
  else if (rounds.has("final")) playoffs = "final";
  out.playoffs = playoffs;
  if (playoffs !== "none") notes.push(`Playoffs: ${playoffs}.`);

  // Days, sheets, and the block cadence from the placed games.
  const placed = data.games.filter((g) => g.slotStart);
  const dates = [...new Set(placed.map((g) => (g.slotStart as string).slice(0, 10)))].sort();
  if (dates.length > 0) {
    out.days = dates.length;
    out.dayLabels = dates.map((d) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]);
    notes.push(`${dates.length} day${dates.length === 1 ? "" : "s"}: ${out.dayLabels.join(", ")}.`);
  }
  const sheets = new Set(placed.map((g) => g.rink).filter((r): r is string => !!r));
  if (sheets.size > 0) {
    out.sheets = sheets.size;
    notes.push(`${sheets.size} sheet${sheets.size === 1 ? "" : "s"}: ${[...sheets].join(", ")}.`);
  }

  const startMinutes = (g: { slotStart: string | null }) => {
    const t = (g.slotStart as string).slice(11, 16);
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const gaps: number[] = [];
  const bySheetDay = new Map<string, number[]>();
  for (const g of placed) {
    const key = `${(g.slotStart as string).slice(0, 10)}|${g.rink ?? ""}`;
    bySheetDay.set(key, [...(bySheetDay.get(key) ?? []), startMinutes(g)]);
  }
  for (const starts of bySheetDay.values()) {
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1]);
  }
  const block = median(gaps.filter((g) => g > 0 && g <= 240));
  if (block) {
    out.blockMinutes = block;
    notes.push(`Games ran every ${block} minutes on a sheet.`);
  }
  if (placed.length > 0) {
    const starts = placed.map(startMinutes);
    const first = Math.min(...starts);
    const last = Math.max(...starts) + (block ?? 90);
    out.firstIce = hhmm(Math.floor(first / 15) * 15);
    out.lastIce = hhmm(Math.min(24 * 60 - 1, Math.ceil(last / 15) * 15));
    notes.push(`Ice ran from ${out.firstIce} to about ${out.lastIce}.`);
  }

  // Roster by position, averaged across teams, and the fill rate that makes
  // teams x roster x fill equal the real headcount. Only trusted when every
  // team has a real roster; a half-synced event would otherwise shrink the
  // model to a handful of players.
  let fillRate: number | null = null;
  const thin = linkedTeams.filter((t) => t.players < MIN_ROSTER).length;
  const rosterComplete = players.length > 0 && thin === 0;
  if (players.length > 0 && !rosterComplete) {
    notes.push(
      `Rosters look incomplete (${thin} of ${teams} teams have fewer than ${MIN_ROSTER} players synced); roster sizes and headcount left at the profile defaults.`,
    );
  } else if (rosterComplete) {
    const byTeam = new Map<string, { F: number; D: number; G: number }>();
    for (const p of players) {
      const rec = byTeam.get(p.teamId) ?? { F: 0, D: 0, G: 0 };
      const pos = p.position ?? "F";
      rec[pos] += 1;
      byTeam.set(p.teamId, rec);
    }
    const n = byTeam.size;
    const avg = (k: "F" | "D" | "G") => Math.round([...byTeam.values()].reduce((s, r) => s + r[k], 0) / n);
    out.forwards = avg("F");
    out.defense = avg("D");
    out.goalies = avg("G");
    const target = teams * (out.forwards + out.defense + out.goalies);
    if (target > 0) fillRate = Math.round((totalPlayers / target) * 1000) / 10;
    notes.push(
      `${totalPlayers} registered players across ${n} roster${n === 1 ? "" : "s"}; average ${out.forwards} F / ${out.defense} D / ${out.goalies} G` +
        (fillRate !== null ? ` (fill rate ${fillRate}% keeps the model at ${totalPlayers}).` : "."),
    );
  } else {
    notes.push("No rosters synced; roster sizes left at the profile defaults.");
  }

  const link: EventLink = {
    eventId: data.event.id,
    eventName: data.event.name,
    year: data.event.year,
    format: data.event.format,
    teams: linkedTeams,
    players: totalPlayers,
    coachesNamed,
  };
  return { structure: out, link, fillRate, rosterComplete, notes };
}
