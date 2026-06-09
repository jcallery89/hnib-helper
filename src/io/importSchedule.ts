import type { Dataset } from "./dataset.ts";
import type { Game, GameRound, Team } from "../engine/types.ts";
import { DEFAULT_POINT_SYSTEM } from "../engine/pointSystem.ts";

export interface ImportSummary {
  eventName: string;
  teamCount: number;
  roundRobinGames: number;
  playoffGames: number;
  skippedAllStar: number;
  warnings: string[];
}

export interface ImportResult {
  dataset: Dataset;
  summary: ImportSummary;
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

interface ParsedGame {
  num: number;
  slotStart: string | null;
  rink: string | null;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "final" | "scheduled";
}

/**
 * Parse the text copied from an hnib.app schedule widget into a Dataset.
 *
 * The widget renders one block per game:
 *   Game #N - June 27, 2025 - 09:45 AM (WIC-MGH)FINAL
 *   Home Team 4
 *   vs
 *   1 Away Team
 *
 * Round-robin games are separated from playoff games by counting each team's
 * games in chronological order: the first `targetGames` per team are the round
 * robin, the rest are playoff games (which never affect standings). All-Star
 * exhibition games are skipped.
 */
export function parseSchedule(text: string, targetGames = 4): ImportResult {
  const warnings: string[] = [];
  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 0 && l.toLowerCase() !== "vs");

  const eventName = findEventName(lines);
  const parsed = parseGames(lines, warnings);
  parsed.sort((a, b) => (a.slotStart ?? "").localeCompare(b.slotStart ?? ""));

  // Build teams (excluding All-Star exhibition teams).
  const isAllStar = (name: string) => /all[-\s]?star/i.test(name);
  const teamIds = new Map<string, string>(); // name -> id
  const teams: Team[] = [];
  const eventId = slug(eventName) || "imported-event";
  const addTeam = (name: string) => {
    if (teamIds.has(name)) return teamIds.get(name) as string;
    const id = uniqueId(slug(name) || "team", teamIds);
    teamIds.set(name, id);
    teams.push({ id, eventId, divisionId: "all", name });
    return id;
  };

  let skippedAllStar = 0;
  let rrCount = 0;
  let playoffCount = 0;
  const perTeamCount = new Map<string, number>();
  const games: Game[] = [];

  for (const g of parsed) {
    if (isAllStar(g.homeName) || isAllStar(g.awayName)) {
      skippedAllStar++;
      continue;
    }
    const homeId = addTeam(g.homeName);
    const awayId = addTeam(g.awayName);

    const hc = perTeamCount.get(homeId) ?? 0;
    const ac = perTeamCount.get(awayId) ?? 0;
    const isRR = hc < targetGames && ac < targetGames;
    const round: GameRound = isRR ? "rr" : "qf";
    if (isRR) {
      perTeamCount.set(homeId, hc + 1);
      perTeamCount.set(awayId, ac + 1);
      rrCount++;
    } else {
      playoffCount++;
    }

    games.push({
      id: `g${g.num}`,
      divisionId: null,
      round,
      rink: g.rink,
      slotStart: g.slotStart,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      status: g.status,
      decidedBy: g.status === "final" ? "regulation" : null,
    });
  }

  if (teams.length === 0) warnings.push("No teams were found - check the pasted text.");

  const dataset: Dataset = {
    event: {
      id: eventId,
      name: eventName,
      year: yearFrom(eventName, parsed),
      venues: [],
      format: "festival",
      hasPlayoffBracket: true,
      seedingRule: "jrhigh_top2_per_division",
      pointSystem: { ...DEFAULT_POINT_SYSTEM },
    },
    divisions: [{ id: "all", eventId, name: "Unassigned", teamIds: teams.map((t) => t.id) }],
    teams,
    games,
  };

  return {
    dataset,
    summary: { eventName, teamCount: teams.length, roundRobinGames: rrCount, playoffGames: playoffCount, skippedAllStar, warnings },
  };
}

function findEventName(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/Schedule\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return "Imported Event";
}

function parseGames(lines: string[], warnings: string[]): ParsedGame[] {
  const header = /^Game\s*#(\d+)\s*-\s*(.+?)\s*-\s*(.+?)\s*\(([^)]*)\)\s*(FINAL|SCHEDULED)?/i;
  const homeLine = /^(.*\S)\s+(\d+|-)$/;
  const awayLine = /^(\d+|-)\s+(.*\S)$/;
  const games: ParsedGame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(header);
    if (!h) continue;
    const num = Number(h[1]);
    const slotStart = toIso(h[2], h[3]);
    const rink = h[4] || null;
    const home = lines[i + 1]?.match(homeLine);
    const away = lines[i + 2]?.match(awayLine);
    if (!home || !away) {
      warnings.push(`Could not read teams for Game #${num}.`);
      continue;
    }
    const homeScore = home[2] === "-" ? null : Number(home[2]);
    const awayScore = away[1] === "-" ? null : Number(away[1]);
    const status: "final" | "scheduled" =
      /final/i.test(h[5] ?? "") && homeScore !== null && awayScore !== null ? "final" : "scheduled";
    games.push({
      num,
      slotStart,
      rink,
      homeName: home[1].trim(),
      awayName: away[2].trim(),
      homeScore,
      awayScore,
      status,
    });
    i += 2;
  }
  return games;
}

// "June 27, 2025" + "09:45 AM" -> "2025-06-27T09:45:00" (local-naive).
function toIso(dateStr: string, timeStr: string): string | null {
  const dm = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  const tm = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!dm || !tm) return null;
  const month = MONTHS[dm[1].toLowerCase()];
  if (!month) return null;
  const day = dm[2].padStart(2, "0");
  const year = dm[3];
  let hour = Number(tm[1]);
  const min = tm[2];
  const ampm = (tm[3] ?? "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${min}:00`;
}

function yearFrom(eventName: string, games: ParsedGame[]): number {
  const m = eventName.match(/(20\d{2})/);
  if (m) return Number(m[1]);
  const g = games.find((x) => x.slotStart);
  return g ? Number(g.slotStart!.slice(0, 4)) : new Date().getFullYear();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueId(base: string, taken: Map<string, string>): string {
  const used = new Set(taken.values());
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
