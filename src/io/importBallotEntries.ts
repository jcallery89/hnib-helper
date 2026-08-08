import type { Player, Team } from "../engine/types.ts";
import { normalize } from "./importPlayers.ts";

// Import a Gravity Forms entries export from the nomination ballot: one row
// per coach with player picks like "#13 Mckenzie Lima-Tower - Coastal (GP 2,
// 2g 0a 2pts)" (the GPPA display label) or "Lima-Tower, Mckenzie (Coastal
// #13)" (the stored key). Each pick resolves to a rostered player by team +
// jersey with a name check, and the result merges into the nominated set.
//
// The entries CSV quotes free-text notes that can contain LINE BREAKS, so
// this module carries its own full CSV parser instead of the line-based one
// the roster importers use.

export interface BallotEntriesResult {
  /** Player ids to mark nominated (deduplicated). */
  nominatedIds: string[];
  ballots: number;
  matched: number;
  /** Picks that could not be resolved to a rostered player. */
  unmatched: Array<{ team: string; cell: string }>;
  /** Coach free-text notes, surfaced for the directors (write-ins live here). */
  notes: Array<{ team: string; coach: string; note: string }>;
  warnings: string[];
}

const PICK_COLS = ["#1 Forward", "#2 Forward", "#3 Forward", "#1 Defenseman", "#2 Defenseman", "#1 Goalie"];

export function parseBallotEntries(
  csv: string,
  players: Player[],
  teams: Team[],
): BallotEntriesResult {
  const out: BallotEntriesResult = {
    nominatedIds: [],
    ballots: 0,
    matched: 0,
    unmatched: [],
    notes: [],
    warnings: [],
  };
  const table = parseCsvWithNewlines(csv);
  if (table.length < 2) {
    out.warnings.push("The paste has no ballot rows.");
    return out;
  }
  const header = table[0].map((h) => normalize(h));
  const col = (name: string) => header.indexOf(normalize(name));
  const teamCol = col("Team");
  const coachCol = col("Coach's Name");
  const notesCol = col("Important Notes");
  const pickCols = PICK_COLS.map((c) => col(c));
  const hasHeader = teamCol >= 0 && pickCols.some((i) => i >= 0);

  const teamIdByName = new Map(teams.map((t) => [normalize(t.name), t.id]));
  const byTeamJersey = new Map<string, Player>();
  const byTeamName = new Map<string, Player>();
  for (const p of players) {
    if (p.jersey !== null) byTeamJersey.set(`${p.teamId}#${p.jersey}`, p);
    byTeamName.set(`${p.teamId}|${normalize(`${p.firstName} ${p.lastName}`)}`, p);
  }

  const nominated = new Set<string>();

  const resolve = (cell: string, rowTeam: string): Player | undefined => {
    const pick = parsePick(cell);
    const teamName = pick?.team || rowTeam;
    const teamId = teamIdByName.get(normalize(teamName));
    if (!pick || !teamId) return undefined;
    if (pick.jersey !== null) {
      const byJersey = byTeamJersey.get(`${teamId}#${pick.jersey}`);
      // Jersey hit still needs the name to agree - a re-numbered roster
      // must not silently nominate the wrong player.
      if (byJersey && namesAgree(byJersey, pick)) return byJersey;
    }
    return byTeamName.get(`${teamId}|${normalize(pick.fullName)}`);
  };

  if (hasHeader) {
    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const rowTeam = (row[teamCol] ?? "").trim();
      if (!rowTeam && row.every((c) => (c ?? "").trim() === "")) continue;
      out.ballots++;

      for (const i of pickCols) {
        if (i < 0) continue;
        const cell = (row[i] ?? "").trim();
        if (cell === "") continue;
        const player = resolve(cell, rowTeam);
        if (player) {
          nominated.add(player.id);
          out.matched++;
        } else {
          out.unmatched.push({ team: rowTeam, cell });
        }
      }

      const note = notesCol >= 0 ? (row[notesCol] ?? "").trim() : "";
      if (note) {
        out.notes.push({
          team: rowTeam,
          coach: coachCol >= 0 ? (row[coachCol] ?? "").trim() : "",
          note,
        });
      }
    }
  } else {
    // No header row (a spreadsheet paste of just the data rows). Every pick
    // names its own team, so sweep all cells and recognize picks by shape;
    // a known team name in the cell keeps random text from matching.
    for (const row of table) {
      let picksInRow = 0;
      for (const cell of row) {
        const c = (cell ?? "").trim();
        if (c === "") continue;
        const pick = parsePick(c);
        if (!pick || !pick.team || !teamIdByName.has(normalize(pick.team))) continue;
        const player = resolve(c, "");
        picksInRow++;
        if (player) {
          nominated.add(player.id);
          out.matched++;
        } else {
          out.unmatched.push({ team: pick.team, cell: c });
        }
      }
      if (picksInRow > 0) out.ballots++;
    }
    if (out.matched === 0 && out.unmatched.length === 0) {
      out.warnings.push("This does not look like the ballot entries export (no header row and no recognizable picks).");
    } else {
      out.warnings.push(
        "Header row was missing, so picks were recognized by their own team labels; coach notes could not be attributed and were not imported. Include the header row to capture notes.",
      );
    }
  }

  out.nominatedIds = [...nominated];
  return out;
}

function namesAgree(p: Player, pick: { fullName: string }): boolean {
  const roster = normalize(`${p.firstName} ${p.lastName}`);
  const picked = normalize(pick.fullName);
  return roster === picked || roster.includes(picked) || picked.includes(roster);
}

// "#13 Mckenzie Lima-Tower - Coastal (GP 2, 2g 0a 2pts)"  (display label)
// "Lima-Tower, Mckenzie (Coastal #13)"                     (stored key)
// "Mckenzie Lima-Tower"                                    (bare name fallback)
function parsePick(cell: string): { jersey: number | null; fullName: string; team: string } | null {
  let m = /^#(\d+)\s+(.+?)\s+-\s+(.+?)\s*\(/.exec(cell);
  if (m) return { jersey: Number(m[1]), fullName: m[2].trim(), team: m[3].trim() };
  m = /^(.+?),\s*(.+?)\s*\((.+?)(?:\s+#(\d+))?\)\s*$/.exec(cell);
  if (m) {
    return { jersey: m[4] ? Number(m[4]) : null, fullName: `${m[2].trim()} ${m[1].trim()}`, team: m[3].trim() };
  }
  const bare = cell.replace(/^#\d+\s*/, "").trim();
  if (bare) return { jersey: null, fullName: bare, team: "" };
  return null;
}

/**
 * CSV/TSV with quoted fields that may contain the delimiter, escaped quotes,
 * and newlines. A tab anywhere in the first line means a spreadsheet paste
 * (tab-delimited, mostly unquoted); otherwise the raw comma export.
 */
export function parseCsvWithNewlines(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  let fieldStart = true;
  const endField = () => {
    row.push(cur);
    cur = "";
    fieldStart = true;
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && fieldStart) {
      q = true;
      fieldStart = false;
    } else if (c === delimiter) {
      endField();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cur += c;
      fieldStart = false;
    }
  }
  if (cur !== "" || row.length > 0) endRow();
  return rows;
}
