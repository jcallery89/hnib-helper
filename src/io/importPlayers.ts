import type { Dataset } from "./dataset.ts";
import type { Player, PlayerPosition, PlayerStatLine } from "../engine/types.ts";

export interface RosterImportResult {
  players: Player[];
  warnings: string[];
}

export interface StatsImportResult {
  lines: PlayerStatLine[];
  matched: number;
  unmatched: number;
  warnings: string[];
}

// Header synonyms - matched case-insensitively, ignoring spaces/underscores, so
// a wide range of registration / stats exports map without manual relabeling.
const COLS = {
  first: ["first", "firstname", "fname"],
  last: ["last", "lastname", "lname", "surname"],
  name: ["name", "player", "fullname", "playername"],
  team: ["team", "teamname"],
  jersey: ["jersey", "number", "no", "num", "jerseynumber", "sweater", "#"],
  position: ["position", "pos"],
  classYear: ["class", "grad", "gradyear", "classyear", "graduation", "gradyear"],
  shoots: ["shoots", "shot", "hand", "handedness"],
  height: ["height", "ht"],
  hometown: ["hometown", "town", "city"],
  game: ["game", "gameid", "gamenumber", "game#"],
  gp: ["gp", "gamesplayed", "games"],
  goals: ["goals", "g"],
  assists: ["assists", "a", "ast"],
  pim: ["pim", "penaltyminutes", "pen"],
  saves: ["saves", "sv", "sav"],
  ga: ["ga", "goalsagainst", "gaagainst"],
  shots: ["shots", "sa", "shotsagainst", "shotsfaced"],
};

type ColKey = keyof typeof COLS;

/** Import a roster (registration export) into players, matched to teams by name. */
export function importRosterCsv(dataset: Dataset, csv: string): RosterImportResult {
  const warnings: string[] = [];
  const table = parseCsv(csv);
  if (table.length < 2) return { players: [], warnings: ["CSV has no data rows."] };

  const header = table[0].map(normalize);
  const col = (k: ColKey) => findCol(header, COLS[k]);
  const teamByName = buildTeamLookup(dataset);

  const ci = {
    first: col("first"), last: col("last"), name: col("name"), team: col("team"),
    jersey: col("jersey"), position: col("position"), classYear: col("classYear"),
    shoots: col("shoots"), height: col("height"), hometown: col("hometown"),
  };
  if (ci.team < 0) warnings.push("No team column found; players could not be matched to teams.");
  if (ci.name < 0 && ci.first < 0) warnings.push("No name column found.");

  const players: Player[] = [...(dataset.players ?? [])];
  const keyOf = (teamId: string, jersey: number | null, name: string) =>
    jersey !== null ? `${teamId}#${jersey}` : `${teamId}:${name.toLowerCase()}`;
  const existing = new Map(players.map((p) => [keyOf(p.teamId, p.jersey, `${p.firstName} ${p.lastName}`), p]));

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (row.every((c) => c.trim() === "")) continue;
    const teamId = ci.team >= 0 ? teamByName.get(normalize(row[ci.team])) : undefined;
    if (!teamId) {
      warnings.push(`Row ${r + 1}: team "${ci.team >= 0 ? row[ci.team] : ""}" not found in this event.`);
      continue;
    }
    const { first, last } = splitName(ci, row);
    const jersey = parseJersey(ci.jersey >= 0 ? row[ci.jersey] : "");
    const player: Player = {
      id: jersey !== null ? `p-${teamId}-${jersey}` : `p-${teamId}-${slug(`${first}-${last}`)}`,
      eventId: dataset.event.id,
      teamId,
      jersey,
      firstName: first,
      lastName: last,
      position: parsePosition(ci.position >= 0 ? row[ci.position] : ""),
      classYear: parseIntOrUndef(ci.classYear >= 0 ? row[ci.classYear] : ""),
      shoots: parseShoots(ci.shoots >= 0 ? row[ci.shoots] : ""),
      heightInches: parseHeight(ci.height >= 0 ? row[ci.height] : ""),
      hometown: ci.hometown >= 0 ? row[ci.hometown]?.trim() || undefined : undefined,
    };
    existing.set(keyOf(teamId, jersey, `${first} ${last}`), player);
  }

  // Flag duplicate jerseys within a team.
  const seen = new Map<string, string>();
  for (const p of existing.values()) {
    if (p.jersey === null) continue;
    const k = `${p.teamId}#${p.jersey}`;
    if (seen.has(k)) warnings.push(`Duplicate jersey ${p.jersey} on a team (${seen.get(k)} and ${p.firstName} ${p.lastName}).`);
    else seen.set(k, `${p.firstName} ${p.lastName}`);
  }

  return { players: [...existing.values()], warnings };
}

/** Import stat lines, matching each row to a roster player by team + jersey (then name). */
export function importPlayerStatsCsv(dataset: Dataset, csv: string): StatsImportResult {
  const warnings: string[] = [];
  const table = parseCsv(csv);
  if (table.length < 2) return { lines: [], matched: 0, unmatched: 0, warnings: ["CSV has no data rows."] };

  const header = table[0].map(normalize);
  const col = (k: ColKey) => findCol(header, COLS[k]);
  const teamByName = buildTeamLookup(dataset);
  const roster = dataset.players ?? [];

  const ci = {
    team: col("team"), jersey: col("jersey"), name: col("name"), first: col("first"), last: col("last"),
    game: col("game"), gp: col("gp"), goals: col("goals"), assists: col("assists"),
    pim: col("pim"), saves: col("saves"), ga: col("ga"), shots: col("shots"),
  };

  const lines: PlayerStatLine[] = [];
  let matched = 0;
  let unmatched = 0;
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (row.every((c) => c.trim() === "")) continue;
    const teamId = ci.team >= 0 ? teamByName.get(normalize(row[ci.team])) : undefined;
    const jersey = parseJersey(ci.jersey >= 0 ? row[ci.jersey] : "");
    const { first, last } = splitName(ci, row);
    const player = findPlayer(roster, teamId, jersey, `${first} ${last}`.trim());
    if (!player) {
      unmatched++;
      warnings.push(`Row ${r + 1}: no roster player for team "${ci.team >= 0 ? row[ci.team] : "?"}" #${jersey ?? "?"}.`);
      continue;
    }
    matched++;
    lines.push({
      playerId: player.id,
      gameId: ci.game >= 0 ? row[ci.game]?.trim() || null : null,
      gp: parseIntOrUndef(ci.gp >= 0 ? row[ci.gp] : ""),
      goals: parseNum(ci.goals >= 0 ? row[ci.goals] : ""),
      assists: parseNum(ci.assists >= 0 ? row[ci.assists] : ""),
      pim: parseIntOrUndef(ci.pim >= 0 ? row[ci.pim] : ""),
      saves: parseIntOrUndef(ci.saves >= 0 ? row[ci.saves] : ""),
      goalsAgainst: parseIntOrUndef(ci.ga >= 0 ? row[ci.ga] : ""),
      shots: parseIntOrUndef(ci.shots >= 0 ? row[ci.shots] : ""),
    });
  }

  return { lines, matched, unmatched, warnings };
}

function findPlayer(roster: Player[], teamId: string | undefined, jersey: number | null, name: string): Player | undefined {
  if (teamId && jersey !== null) {
    const byJersey = roster.find((p) => p.teamId === teamId && p.jersey === jersey);
    if (byJersey) return byJersey;
  }
  if (teamId && name) {
    return roster.find((p) => p.teamId === teamId && `${p.firstName} ${p.lastName}`.toLowerCase() === name.toLowerCase());
  }
  return undefined;
}

function buildTeamLookup(dataset: Dataset): Map<string, string> {
  return new Map(dataset.teams.map((t) => [normalize(t.name), t.id]));
}

function splitName(ci: { name?: number; first?: number; last?: number }, row: string[]): { first: string; last: string } {
  if (ci.first !== undefined && ci.first >= 0) {
    return { first: (row[ci.first] ?? "").trim(), last: ci.last !== undefined && ci.last >= 0 ? (row[ci.last] ?? "").trim() : "" };
  }
  if (ci.name !== undefined && ci.name >= 0) {
    const full = (row[ci.name] ?? "").trim();
    // Support "Last, First" and "First Last".
    if (full.includes(",")) {
      const [last, first] = full.split(",").map((s) => s.trim());
      return { first: first ?? "", last: last ?? "" };
    }
    const parts = full.split(/\s+/);
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
  }
  return { first: "", last: "" };
}

// ---- parsing helpers --------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  // Detect the delimiter from the header: tab-separated pastes (straight from a
  // spreadsheet) must NOT also split on commas, or fields like "Club, Girls"
  // break and shift every later column.
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => parseRow(line, delimiter));
}

function parseRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  let fieldStart = true; // a quote only opens a field when it leads the field
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && fieldStart) {
      q = true;
      fieldStart = false;
    } else if (c === delimiter) {
      out.push(cur);
      cur = "";
      fieldStart = true;
    } else {
      // A stray quote mid-field (e.g. the inch mark in 5'10") is literal.
      cur += c;
      fieldStart = false;
    }
  }
  out.push(cur);
  return out;
}

export function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/[\s_]+/g, "").trim();
}

function findCol(header: string[], synonyms: string[]): number {
  for (const syn of synonyms) {
    const i = header.indexOf(syn);
    if (i >= 0) return i;
  }
  return -1;
}

function parseJersey(s: string): number | null {
  const digits = (s ?? "").replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}

function parseNum(s: string): number {
  const n = Number((s ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseIntOrUndef(s: string): number | undefined {
  const t = (s ?? "").trim();
  if (t === "") return undefined;
  const n = Number(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function parsePosition(s: string): PlayerPosition | undefined {
  const t = normalize(s);
  if (!t) return undefined;
  if (t.startsWith("g")) return "G";
  if (t.startsWith("d")) return "D";
  if (t.startsWith("f") || t.startsWith("c") || t.startsWith("w") || t.startsWith("l") || t.startsWith("r")) return "F";
  return undefined;
}

export function parseShoots(s: string): "L" | "R" | undefined {
  const t = normalize(s);
  if (t.startsWith("l")) return "L";
  if (t.startsWith("r")) return "R";
  return undefined;
}

// Accept "175", "175 lbs". Out-of-range values are treated as missing.
export function parseWeight(s: string): number | undefined {
  const n = Number((s ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 60 && n <= 400 ? n : undefined;
}

// Accept 70, 5'10", 5-10, 510.
export function parseHeight(s: string): number | undefined {
  const t = (s ?? "").trim();
  if (!t) return undefined;
  const ft = t.match(/(\d)\s*['\-]\s*(\d{1,2})/);
  if (ft) return Number(ft[1]) * 12 + Number(ft[2]);
  const n = Number(t.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
