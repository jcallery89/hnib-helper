import type { EventStructure, PlayoffFormat } from "../engine/planner/types.ts";
import type { Dataset } from "./dataset.ts";

// Seed a planner structure from a synced event: how many teams and sheets it
// ran, how many games each team played, the block cadence, and the playoff
// rounds. Nothing about money lives in the tournament data, so costs and
// pricing are left to the profile.

export interface DerivedStructure {
  structure: Partial<EventStructure>;
  notes: string[];
}

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

  const teams = data.teams.length;
  if (teams >= 2) out.teams = teams;
  notes.push(`${teams} teams${data.divisions.length > 1 ? ` in ${data.divisions.length} divisions` : ""}.`);

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

  // Average roster by position across teams that have rosters.
  const players = data.players ?? [];
  if (players.length > 0) {
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
    notes.push(`Average roster ${out.forwards} F / ${out.defense} D / ${out.goalies} G across ${n} rosters.`);
  } else {
    notes.push("No rosters synced; roster sizes left at the profile defaults.");
  }

  return { structure: out, notes };
}
