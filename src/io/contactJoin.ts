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

/**
 * Match players to registration rows by team name + jersey (last name as the
 * safety check, same policy as the registration import), with a team + full
 * name fallback for players without a jersey number.
 */
export function joinContacts(
  csv: string,
  players: Player[],
  teams: Team[],
  eventFilter?: string,
): ContactJoinResult {
  const out: ContactJoinResult = { rows: [], unmatched: [], warnings: [] };
  const table = parseCsv(csv);
  if (table.length < 2) {
    out.warnings.push("The pasted registration export has no data rows.");
    return out;
  }
  const header = table[0];
  const col: Record<ContactCol, number> = Object.fromEntries(
    (Object.keys(CONTACT_COLS) as ContactCol[]).map((k) => [k, findCol(header, CONTACT_COLS[k])]),
  ) as Record<ContactCol, number>;
  for (const required of ["team", "last"] as const) {
    if (col[required] < 0) {
      out.warnings.push(`The paste is missing the ${required === "team" ? "Event Team" : "Last Name"} column. Is it the registration export?`);
      return out;
    }
  }
  if (
    col.parentName < 0 && col.parentCell < 0 && col.parentEmail < 0 &&
    col.playerCell < 0 && col.playerEmail < 0
  ) {
    out.warnings.push("No contact columns found in the paste (PG Cell, PG Email, Player Cell, Player Email).");
    return out;
  }

  const cell = (row: string[], k: ContactCol) => (col[k] >= 0 ? (row[col[k]] ?? "").trim() : "");
  const doFilter = col.event >= 0 && !!eventFilter && eventFilter.trim() !== "";

  // Index the registration rows two ways: team+jersey, and team+full name.
  const byTeamJersey = new Map<string, string[]>();
  const byTeamName = new Map<string, string[]>();
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (doFilter && cell(row, "event") !== eventFilter) continue;
    const team = normalize(cell(row, "team"));
    if (!team) continue;
    const jerseyDigits = cell(row, "jersey").replace(/[^\d]/g, "");
    if (jerseyDigits !== "" && !byTeamJersey.has(`${team}#${Number(jerseyDigits)}`)) {
      byTeamJersey.set(`${team}#${Number(jerseyDigits)}`, row);
    }
    const nameKey = `${team}|${normalize(cell(row, "first"))}|${normalize(cell(row, "last"))}`;
    if (!byTeamName.has(nameKey)) byTeamName.set(nameKey, row);
  }

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  for (const p of players) {
    const teamName = teamNameById.get(p.teamId) ?? "";
    const team = normalize(teamName);
    const who = `${teamName} ${p.jersey !== null ? `#${p.jersey} ` : ""}${p.firstName} ${p.lastName}`.trim();

    let row = p.jersey !== null ? byTeamJersey.get(`${team}#${p.jersey}`) : undefined;
    if (row && normalize(cell(row, "last")) !== normalize(p.lastName) && cell(row, "last") !== "") {
      out.warnings.push(
        `${who}: registration row at that team and jersey is ${cell(row, "first")} ${cell(row, "last")}; matched by name instead.`,
      );
      row = undefined;
    }
    if (!row) row = byTeamName.get(`${team}|${normalize(p.firstName)}|${normalize(p.lastName)}`);
    if (!row) {
      out.unmatched.push(who);
      continue;
    }
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
