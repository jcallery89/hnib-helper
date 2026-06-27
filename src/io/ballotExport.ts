import type { Dataset } from "./dataset.ts";
import type { Player, PlayerSummary, HnibEvent } from "../engine/types.ts";

/**
 * Build and serialize the roster table that feeds the Gravity Forms All-Star
 * ballot (Gravity Wiz "Populate Anything"). The ballot dropdowns are populated
 * from a database table (last year: `gf_soph_rosters`) with one row per player.
 *
 * The whole point: the coach picks a Team, then each "#N Overall" dropdown shows
 * that team's players. Last year the table held only `team_name` + `player_name`,
 * so a coach saw a bare name. Here we ship jersey, position, live stats, and a
 * ready-made `display` string so the dropdown can read
 *   "#12 Jane Smith - 4GP 3G 5A 8P"
 * with no template fiddling (set the GPPA label to {display}, value to
 * {player_name}). Pure and side-effect-free so it is easy to test.
 */
export interface BallotRow {
  player_id: string;
  team_name: string;
  player_name: string;
  jersey: string; // string so a missing jersey is "" not 0
  position: string; // F / D / G ("" when unknown)
  gp: number;
  g: number;
  a: number;
  pts: number;
  gaa: string; // formatted, "" for skaters
  svpct: string; // formatted, "" for skaters
  display: string; // coach-facing dropdown label
}

const COLUMNS: (keyof BallotRow)[] = [
  "player_id", "team_name", "player_name", "jersey", "position",
  "gp", "g", "a", "pts", "gaa", "svpct", "display",
];

/**
 * One ballot row per player on the active event, sorted by team then jersey so
 * the generated file is stable and diff-friendly. `summaries` is the same
 * Map the Stats tab already computes (with the team-games GP fallback applied),
 * passed in to keep this module free of the UI/store layer.
 */
export function buildBallotRoster(data: Dataset, summaries: Map<string, PlayerSummary>): BallotRow[] {
  const teamName = new Map(data.teams.map((t) => [t.id, t.name]));
  const rows = (data.players ?? []).map((p) => {
    const s = summaries.get(p.id);
    return toRow(p, s, teamName.get(p.teamId) ?? p.teamId);
  });
  return rows.sort(
    (a, b) =>
      a.team_name.localeCompare(b.team_name) ||
      jerseyNum(a.jersey) - jerseyNum(b.jersey) ||
      a.player_name.localeCompare(b.player_name),
  );
}

function toRow(p: Player, s: PlayerSummary | undefined, team: string): BallotRow {
  const name = `${p.firstName} ${p.lastName}`.trim();
  const jersey = p.jersey === null || p.jersey === undefined ? "" : String(p.jersey);
  const isGoalie = s?.isGoalie ?? p.position === "G";
  const position = p.position ?? (isGoalie ? "G" : "");
  // Tourno reports goalie GP as fractional game-shares (split starts), which
  // reads oddly on a ballot and does not fit the INT column. Round it for
  // storage, and leave it out of the goalie label entirely - GAA and SV% are the
  // metrics coaches judge a goalie on, and goalie GP is unreliable anyway.
  const gp = Math.round(s?.gp ?? 0);
  const g = s?.goals ?? 0;
  const a = s?.assists ?? 0;
  const pts = s?.points ?? 0;
  const gaa = s?.gaa !== undefined ? s.gaa.toFixed(2) : "";
  const svpct = s?.savePct !== undefined ? s.savePct.toFixed(3).replace(/^0/, "") : "";

  const numTag = jersey ? `#${jersey} ` : "";
  const stat = isGoalie
    ? `${gaa || "-"}GAA ${svpct || "-"}SV%`
    : `${gp}GP ${g}G ${a}A ${pts}P`;
  const display = `${numTag}${name} - ${stat}`;

  return { player_id: p.id, team_name: team, player_name: name, jersey, position, gp, g, a, pts, gaa, svpct, display };
}

/** A CSV shaped to the ballot roster table; importable via phpMyAdmin or a CSV-to-table plugin. */
export function ballotRosterCsv(rows: BallotRow[]): string {
  const header = COLUMNS.join(",");
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","));
  return [header, ...body].join("\n");
}

/**
 * A self-contained .sql refresh: create the table if needed, clear it, and
 * re-insert every row. Paste into phpMyAdmin (Site Tools -> Devs -> phpMyAdmin)
 * to repopulate the GPPA source in one shot. Re-run any time stats change.
 */
export function ballotRosterSql(rows: BallotRow[], tableName: string): string {
  const t = "`" + tableName.replace(/[^a-zA-Z0-9_]/g, "") + "`";
  // Drop and recreate so a single paste self-heals last year's narrower table
  // (it only had team_name + player_name) into the full stats schema.
  const create =
    `DROP TABLE IF EXISTS ${t};\n` +
    `CREATE TABLE ${t} (\n` +
    "  `player_id` VARCHAR(64) NOT NULL,\n" +
    "  `team_name` VARCHAR(120) NOT NULL,\n" +
    "  `player_name` VARCHAR(120) NOT NULL,\n" +
    "  `jersey` VARCHAR(8),\n" +
    "  `position` VARCHAR(4),\n" +
    "  `gp` INT, `g` INT, `a` INT, `pts` INT,\n" +
    "  `gaa` VARCHAR(8), `svpct` VARCHAR(8),\n" +
    "  `display` VARCHAR(255),\n" +
    "  PRIMARY KEY (`player_id`)\n" +
    ") DEFAULT CHARSET=utf8mb4;";
  const cols = COLUMNS.map((c) => "`" + c + "`").join(", ");
  const values = rows
    .map((r) => "  (" + COLUMNS.map((c) => sqlLiteral(r[c])).join(", ") + ")")
    .join(",\n");
  const insert = rows.length
    ? `INSERT INTO ${t} (${cols}) VALUES\n${values};`
    : `-- (no players in the active event)`;
  return [
    "-- HNIB All-Star ballot roster. Generated by HNIB Tournament Expert.",
    "-- Repopulates the Populate Anything source table for the ballot form.",
    create,
    insert,
    "",
  ].join("\n");
}

/** Default source-table name for an event, matching last year's `gf_soph_rosters`. */
export function defaultBallotTable(event: HnibEvent): string {
  const n = event.name.toLowerCase();
  if (n.includes("soph")) return "gf_soph_rosters";
  if (n.includes("jr") || n.includes("junior")) return "gf_jrhigh_rosters";
  const slug = n.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "event";
  return `gf_${slug}_rosters`;
}

function jerseyNum(j: string): number {
  const n = Number(j);
  return Number.isFinite(n) && j !== "" ? n : Number.MAX_SAFE_INTEGER;
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sqlLiteral(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value === "") return "''";
  return "'" + value.replace(/'/g, "''") + "'";
}
