import type { Player, Team } from "../engine/types.ts";
import { normalize, parseCsv } from "./importPlayers.ts";

// One-shot join of nominated players against a pasted HNIB registration
// export, for the notification download. Contact values are READ AND RETURNED
// ONLY - nothing here touches the Dataset, so the app's stored data keeps its
// no-PII guarantee (see importRegistration.ts, which whitelists hockey fields
// for the same reason). The caller builds a CSV from the rows and discards
// them.
const CONTACT_COLS = {
  event: ["event"],
  team: ["eventteam"],
  jersey: ["#", "jersey", "number"],
  first: ["firstname", "first"],
  last: ["lastname", "last"],
  parentName: ["p/gname", "pgname", "parentname", "parent/guardianname", "guardianname"],
  parentCell: ["pgcell", "p/gcell", "parentcell", "parentphone"],
  parentEmail: ["pgemail", "p/gemail", "parentemail"],
  playerCell: ["playercell", "playerphone"],
  playerEmail: ["playeremail"],
} as const;

type ContactCol = keyof typeof CONTACT_COLS;

export interface ContactRow {
  playerId: string;
  parentName: string;
  parentCell: string;
  parentEmail: string;
  playerCell: string;
  playerEmail: string;
}

export interface ContactJoinResult {
  /** One row per input player that matched a registration row. */
  rows: ContactRow[];
  /** "Team #9 First Last" descriptions of players with no registration row. */
  unmatched: string[];
  warnings: string[];
}

function findCol(header: string[], synonyms: readonly string[]): number {
  const normalized = header.map((h) => normalize(h));
  for (const syn of synonyms) {
    const i = normalized.indexOf(syn);
    if (i >= 0) return i;
  }
  return -1;
}

export interface RegistrationMatch {
  /** The export's header row, for callers that pull their own columns. */
  header: string[];
  /** Matched raw registration row per player id. */
  rowByPlayerId: Map<string, string[]>;
  /** "Team #9 First Last" descriptions of players with no registration row. */
  unmatched: string[];
  warnings: string[];
  /** Column index for a set of header synonyms, or -1. */
  columnIndex: (synonyms: readonly string[]) => number;
}

/**
 * Match players to registration rows by team name + jersey (last name as the
 * safety check, same policy as the registration import), with a team + full
 * name fallback for players without a jersey number. Returns the RAW matched
 * rows so each caller can read only the columns it needs; nothing here is
 * written to the Dataset.
 */
export function matchRegistrationRows(
  csv: string,
  players: Player[],
  teams: Team[],
  eventFilter?: string,
): RegistrationMatch {
  const out: RegistrationMatch = {
    header: [],
    rowByPlayerId: new Map(),
    unmatched: [],
    warnings: [],
    columnIndex: () => -1,
  };
  const table = parseCsv(csv);
  if (table.length < 2) {
    out.warnings.push("The pasted registration export has no data rows.");
    return out;
  }
  const header = table[0];
  out.header = header;
  out.columnIndex = (synonyms) => findCol(header, synonyms);

  const teamCol = findCol(header, CONTACT_COLS.team);
  const lastCol = findCol(header, CONTACT_COLS.last);
  const firstCol = findCol(header, CONTACT_COLS.first);
  const jerseyCol = findCol(header, CONTACT_COLS.jersey);
  const eventCol = findCol(header, CONTACT_COLS.event);
  for (const [idx, label] of [[teamCol, "Event Team"], [lastCol, "Last Name"]] as const) {
    if (idx < 0) {
      out.warnings.push(`The paste is missing the ${label} column. Is it the registration export?`);
      return out;
    }
  }

  const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const doFilter = eventCol >= 0 && !!eventFilter && eventFilter.trim() !== "";

  // Index the registration rows two ways: team+jersey, and team+full name.
  const byTeamJersey = new Map<string, string[]>();
  const byTeamName = new Map<string, string[]>();
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (doFilter && at(row, eventCol) !== eventFilter) continue;
    const team = normalize(at(row, teamCol));
    if (!team) continue;
    const jerseyDigits = at(row, jerseyCol).replace(/[^\d]/g, "");
    if (jerseyDigits !== "" && !byTeamJersey.has(`${team}#${Number(jerseyDigits)}`)) {
      byTeamJersey.set(`${team}#${Number(jerseyDigits)}`, row);
    }
    const nameKey = `${team}|${normalize(at(row, firstCol))}|${normalize(at(row, lastCol))}`;
    if (!byTeamName.has(nameKey)) byTeamName.set(nameKey, row);
  }

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  for (const p of players) {
    const teamName = teamNameById.get(p.teamId) ?? "";
    const team = normalize(teamName);
    const who = `${teamName} ${p.jersey !== null ? `#${p.jersey} ` : ""}${p.firstName} ${p.lastName}`.trim();

    let row = p.jersey !== null ? byTeamJersey.get(`${team}#${p.jersey}`) : undefined;
    if (row && normalize(at(row, lastCol)) !== normalize(p.lastName) && at(row, lastCol) !== "") {
      out.warnings.push(
        `${who}: registration row at that team and jersey is ${at(row, firstCol)} ${at(row, lastCol)}; matched by name instead.`,
      );
      row = undefined;
    }
    if (!row) row = byTeamName.get(`${team}|${normalize(p.firstName)}|${normalize(p.lastName)}`);
    if (!row) {
      out.unmatched.push(who);
      continue;
    }
    out.rowByPlayerId.set(p.id, row);
  }
  return out;
}

/**
 * The notification join: contact columns only, for the ballot download. Values
 * are READ AND RETURNED ONLY - nothing here touches the Dataset.
 */
export function joinContacts(
  csv: string,
  players: Player[],
  teams: Team[],
  eventFilter?: string,
): ContactJoinResult {
  const out: ContactJoinResult = { rows: [], unmatched: [], warnings: [] };
  const match = matchRegistrationRows(csv, players, teams, eventFilter);
  out.warnings.push(...match.warnings);
  out.unmatched.push(...match.unmatched);
  if (match.header.length === 0) return out;

  const col: Record<ContactCol, number> = Object.fromEntries(
    (Object.keys(CONTACT_COLS) as ContactCol[]).map((k) => [k, match.columnIndex(CONTACT_COLS[k])]),
  ) as Record<ContactCol, number>;
  if (
    col.parentName < 0 && col.parentCell < 0 && col.parentEmail < 0 &&
    col.playerCell < 0 && col.playerEmail < 0
  ) {
    return { rows: [], unmatched: [], warnings: ["No contact columns found in the paste (PG Cell, PG Email, Player Cell, Player Email)."] };
  }

  const cell = (row: string[], k: ContactCol) => (col[k] >= 0 ? (row[col[k]] ?? "").trim() : "");
  for (const p of players) {
    const row = match.rowByPlayerId.get(p.id);
    if (!row) continue;
    out.rows.push({
      playerId: p.id,
      parentName: cell(row, "parentName"),
      parentCell: cell(row, "parentCell"),
      parentEmail: cell(row, "parentEmail"),
      playerCell: cell(row, "playerCell"),
      playerEmail: cell(row, "playerEmail"),
    });
  }
  return out;
}
