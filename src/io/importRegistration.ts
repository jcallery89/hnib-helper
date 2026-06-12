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
  warnings: string[];
}

export interface RegistrationResult {
  players: Player[];
  report: RegistrationReport;
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
  eventFilter: string,
): RegistrationResult {
  const report: RegistrationReport = {
    matched: 0,
    created: 0,
    nameMismatches: [],
    unassigned: [],
    unknownTeams: [],
    unmatchedAppPlayers: [],
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
  for (const required of ["event", "team", "jersey", "last"] as const) {
    if (col[required] < 0) {
      report.warnings.push(`Registration CSV is missing the ${required === "team" ? "Event Team" : required} column.`);
      return { players: dataset.players ?? [], report };
    }
  }

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
    if (cell(row, "event") !== eventFilter) continue;

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

    const bio = {
      position: parsePosition(cell(row, "position")),
      classYear: gradeToClassYear(cell(row, "grade"), dataset.event.year),
      shoots: parseShoots(cell(row, "shoots")),
      heightInches: parseHeight(cell(row, "height")),
      weightLbs: parseIntOr(cell(row, "weight")),
      hometown: joinHometown(cell(row, "city"), cell(row, "state")),
      school: cleanSchool(cell(row, "school")),
    };

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
      Object.assign(existing, prune(bio));
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
        ...prune(bio),
      });
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

// "9th" entering in the fall of the event year -> graduation year.
function gradeToClassYear(grade: string, eventYear: number): number | undefined {
  const m = grade.match(/(\d{1,2})/);
  if (!m) return undefined;
  const g = Number(m[1]);
  if (g < 1 || g > 12) return undefined;
  return eventYear + (13 - g);
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

/** Drop undefined fields so merging never erases existing values with blanks. */
function prune<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function findCol(header: string[], synonyms: readonly string[]): number {
  const normed = header.map(normalize);
  for (const syn of synonyms) {
    const i = normed.indexOf(normalize(syn));
    if (i >= 0) return i;
  }
  return -1;
}
