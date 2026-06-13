import type { Dataset } from "./dataset.ts";
import type { Player } from "../engine/types.ts";
import { normalize, parseCsv, parseHeight, parsePosition, parseShoots } from "./importPlayers.ts";

// HNIB registration exports cover every event in one file and carry heavy PII
// (addresses, parent contacts, DOB, payment records). This importer reads ONLY
// the columns named below; everything else is never copied into the dataset,
// which lives in the browser and can be exported as JSON.
const SAFE_COLS = {
  event: ["event"],
  team: ["eventteam"],
  jersey: ["#", "jersey", "number"],
  grade: ["yr", "grade", "year"],
  position: ["pos", "position"],
  first: ["firstname", "first"],
  last: ["lastname", "last"],
  school: ["school(fall)", "schoolfall", "school"],
  city: ["city"],
  state: ["st", "state"],
  shoots: ["shoots", "shot"],
  height: ["ht", "height"],
  weight: ["wt", "weight"],
} as const;

type SafeCol = keyof typeof SAFE_COLS;

export interface RegistrationReport {
  matched: number; // enriched an existing (synced) player
  created: number; // registration row with no app counterpart
  nameMismatches: string[]; // same team+jersey, different last name - review these
  unassigned: string[]; // registration rows with no team or no jersey
  unknownTeams: string[]; // registration team names not found in this event
  unmatchedAppPlayers: string[]; // app roster spots with no registration row
  suspicious: string[]; // values that failed a sanity check (e.g. numeric hometown)
  warnings: string[];
}

export interface RegistrationResult {
  players: Player[];
  report: RegistrationReport;
}

/** True when the CSV looks like an HNIB registration export (has Event Team). */
export function isRegistrationCsv(csv: string): boolean {
  const table = parseCsv(csv);
  if (table.length < 1) return false;
  return findCol(table[0], SAFE_COLS.team) >= 0;
}

/** Distinct Event column values in a registration CSV, for the event picker. */
export function listRegistrationEvents(csv: string): string[] {
  const table = parseCsv(csv);
  if (table.length < 2) return [];
  const idx = findCol(table[0], SAFE_COLS.event);
  if (idx < 0) return [];
  const seen = new Map<string, number>();
  for (let r = 1; r < table.length; r++) {
    const v = (table[r][idx] ?? "").trim();
    if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/**
 * Merge one event's registration rows into the dataset's players.
 *
 * Matching is by team name + jersey number, with the last name as the safety
 * check: a row that lands on an app roster spot with a DIFFERENT last name is
 * flagged and left untouched rather than silently merged. Matched players keep
 * their app identity (id, team, jersey - so game-log fetches keep working) and
 * gain the registration bio. Rows with no app counterpart become new players.
 */
export function mergeRegistration(
  dataset: Dataset,
  csv: string,
  eventFilter?: string,
): RegistrationResult {
  const report: RegistrationReport = {
    matched: 0,
    created: 0,
    nameMismatches: [],
    unassigned: [],
    unknownTeams: [],
    unmatchedAppPlayers: [],
    suspicious: [],
    warnings: [],
  };

  const table = parseCsv(csv);
  if (table.length < 2) {
    report.warnings.push("CSV has no data rows.");
    return { players: dataset.players ?? [], report };
  }
  const header = table[0];
  const col: Record<SafeCol, number> = Object.fromEntries(
    (Object.keys(SAFE_COLS) as SafeCol[]).map((k) => [k, findCol(header, SAFE_COLS[k])]),
  ) as Record<SafeCol, number>;
  // The Event column is optional: a single-event export omits it (all rows are
  // one event). When it is present and a filter is given, only those rows merge.
  for (const required of ["team", "jersey", "last"] as const) {
    if (col[required] < 0) {
      report.warnings.push(`Registration CSV is missing the ${required === "team" ? "Event Team" : required} column.`);
      return { players: dataset.players ?? [], report };
    }
  }
  const doFilter = col.event >= 0 && !!eventFilter && eventFilter.trim() !== "";

  const teamByName = new Map(dataset.teams.map((t) => [normalize(t.name), t]));
  const players = (dataset.players ?? []).map((p) => ({ ...p }));
  const preexistingIds = new Set(players.map((p) => p.id));
  const byTeamJersey = new Map(
    players.filter((p) => p.jersey !== null).map((p) => [`${p.teamId}#${p.jersey}`, p]),
  );
  const touched = new Set<string>();
  const unknownTeams = new Set<string>();
  const cell = (row: string[], k: SafeCol) => (col[k] >= 0 ? (row[col[k]] ?? "").trim() : "");

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (doFilter && cell(row, "event") !== eventFilter) continue;

    const first = cell(row, "first");
    const last = cell(row, "last");
    const teamName = cell(row, "team");
    const jersey = parseJersey(cell(row, "jersey"));
    const fullName = `${first} ${last}`.trim() || `row ${r + 1}`;

    if (!teamName || jersey === null) {
      report.unassigned.push(fullName);
      continue;
    }
    const team = teamByName.get(normalize(teamName));
    if (!team) {
      unknownTeams.add(teamName);
      continue;
    }

    const { fields, suspect } = cleanBio((k) => cell(row, k), dataset.event.year);
    const where = `${team.name} #${jersey} ${fullName}`.trim();

    const existing = byTeamJersey.get(`${team.id}#${jersey}`);
    if (existing) {
      const appLast = existing.lastName.trim();
      if (appLast && last && normalize(appLast) !== normalize(last)) {
        report.nameMismatches.push(
          `${team.name} #${jersey}: registration says ${fullName}, app roster says ${existing.firstName} ${existing.lastName}.`,
        );
        touched.add(existing.id);
        continue;
      }
      // Only valid registration fields overwrite; anything missing or flagged
      // falls back to the value the hnib.app (Tourno) sync already provided.
      Object.assign(existing, fields);
      for (const s of suspect) {
        const had = (existing as Record<string, unknown>)[s.key] != null && !(s.key in fields);
        report.suspicious.push(`${where}: ${s.label} "${s.raw}" looks off; ${had ? "kept the synced value" : "left blank"}.`);
      }
      if (!existing.firstName && first) existing.firstName = first;
      if (!existing.lastName && last) existing.lastName = last;
      touched.add(existing.id);
      report.matched++;
    } else {
      players.push({
        id: `p-${team.id}-${jersey}`,
        eventId: dataset.event.id,
        teamId: team.id,
        jersey,
        firstName: first,
        lastName: last,
        ...fields,
      });
      for (const s of suspect) {
        report.suspicious.push(`${where}: ${s.label} "${s.raw}" looks off; left blank (no synced data to fall back on).`);
      }
      report.created++;
    }
  }

  report.unknownTeams = [...unknownTeams];
  // App roster spots that no registration row claimed - worth a human look.
  report.unmatchedAppPlayers = players
    .filter((p) => preexistingIds.has(p.id) && !touched.has(p.id))
    .map((p) => `${teamNameOf(dataset, p.teamId)} #${p.jersey ?? "?"} ${p.firstName} ${p.lastName}`.trim());

  return { players, report };
}

function teamNameOf(dataset: Dataset, teamId: string): string {
  return dataset.teams.find((t) => t.id === teamId)?.name ?? teamId;
}

interface SuspectField {
  key: keyof Player;
  label: string;
  raw: string;
}

/**
 * Parse and sanity-check the bio fields. Only values that pass land in
 * `fields` (so callers can fall back to synced data for the rest); values that
 * parsed but look wrong are returned in `suspect` for the match report.
 * Common culprit: a registration row with the City/ZIP columns swapped, which
 * yields a numeric hometown.
 */
function cleanBio(
  get: (k: SafeCol) => string,
  eventYear: number,
): { fields: Partial<Player>; suspect: SuspectField[] } {
  const fields: Partial<Player> = {};
  const suspect: SuspectField[] = [];

  const pos = parsePosition(get("position"));
  if (pos) fields.position = pos;

  const shoots = parseShoots(get("shoots"));
  if (shoots) fields.shoots = shoots;

  const rawGrade = get("grade");
  const cls = gradeToClassYear(rawGrade, eventYear);
  if (cls !== undefined) {
    if (cls >= eventYear - 2 && cls <= eventYear + 9) fields.classYear = cls;
    else suspect.push({ key: "classYear", label: "class", raw: rawGrade });
  }

  const rawHt = get("height");
  const ht = parseHeight(rawHt);
  if (ht !== undefined) {
    if (ht >= 48 && ht <= 84) fields.heightInches = ht;
    else suspect.push({ key: "heightInches", label: "height", raw: rawHt });
  }

  const rawWt = get("weight");
  const wt = parseIntOr(rawWt);
  if (wt !== undefined) {
    if (wt >= 50 && wt <= 350) fields.weightLbs = wt;
    else suspect.push({ key: "weightLbs", label: "weight", raw: rawWt });
  }

  const city = get("city");
  const hometown = joinHometown(city, get("state"));
  if (hometown) {
    // A real city has at least one letter; an all-digit "city" means the ZIP
    // and City columns are swapped in the source row.
    if (/[a-z]/i.test(city)) fields.hometown = hometown;
    else suspect.push({ key: "hometown", label: "hometown", raw: hometown });
  }

  const school = cleanSchool(get("school"));
  if (school) fields.school = school;

  return { fields, suspect };
}

// Current grade entering the fall of the event year -> graduation year.
// Accepts "9th"/"8th" (Jr. High) and FR/SO/JR/SR (high-school, e.g. girls events).
function gradeToClassYear(grade: string, eventYear: number): number | undefined {
  const g = grade.trim().toLowerCase();
  if (!g) return undefined;
  const letters: Record<string, number> = {
    fr: 9, freshman: 9, fy: 9,
    so: 10, soph: 10, sophomore: 10,
    jr: 11, junior: 11,
    sr: 12, senior: 12,
  };
  const byLetter = letters[g] ?? letters[g.replace(/[^a-z]/g, "")];
  const num = byLetter ?? (g.match(/(\d{1,2})/) ? Number(g.match(/(\d{1,2})/)![1]) : undefined);
  if (num === undefined || num < 1 || num > 12) return undefined;
  return eventYear + (13 - num);
}

function joinHometown(city: string, state: string): string | undefined {
  if (!city) return undefined;
  return state ? `${city}, ${state}` : city;
}

function cleanSchool(s: string): string | undefined {
  if (!s || /^(undecided|tbd|n\/?a|none)$/i.test(s)) return undefined;
  return s;
}

function parseJersey(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}

function parseIntOr(s: string): number | undefined {
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function findCol(header: string[], synonyms: readonly string[]): number {
  const normed = header.map(normalize);
  for (const syn of synonyms) {
    const i = normed.indexOf(normalize(syn));
    if (i >= 0) return i;
  }
  return -1;
}
