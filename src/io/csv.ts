import type { Dataset } from "./dataset.ts";
import type { Game } from "../engine/types.ts";

/**
 * Serialize results to a simple CSV a coordinator can edit in a spreadsheet.
 * One row per game: id, round, division, home, away, homeScore, awayScore,
 * status, decidedBy. Team columns use names for readability.
 */
export function gamesToCsv(data: Dataset): string {
  const nameById = new Map(data.teams.map((t) => [t.id, t.name]));
  const header = ["id", "round", "division", "home", "away", "homeScore", "awayScore", "status", "decidedBy"];
  const rows = data.games.map((g) => [
    g.id,
    g.round,
    g.divisionId ?? "(crossover)",
    nameById.get(g.homeTeamId) ?? g.homeTeamId,
    nameById.get(g.awayTeamId) ?? g.awayTeamId,
    g.homeScore ?? "",
    g.awayScore ?? "",
    g.status,
    g.decidedBy ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Apply scores from a results CSV back onto an existing dataset, matching rows
 * by game id. Only homeScore/awayScore/status/decidedBy are read; the matchup
 * structure is left to the dataset so a stray name cannot create a phantom game.
 */
export function applyResultsCsv(data: Dataset, csv: string): { updated: number; errors: string[] } {
  const errors: string[] = [];
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { updated: 0, errors: ["CSV has no data rows."] };

  const header = parseRow(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const gIdx = idx("id");
  const hsIdx = idx("homescore");
  const asIdx = idx("awayscore");
  const dbIdx = idx("decidedby");
  if (gIdx < 0 || hsIdx < 0 || asIdx < 0) {
    return { updated: 0, errors: ["CSV must include id, homeScore and awayScore columns."] };
  }

  const byId = new Map(data.games.map((g) => [g.id, g]));
  let updated = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    const game = byId.get(cells[gIdx]?.trim());
    if (!game) {
      errors.push(`Row ${i + 1}: unknown game id "${cells[gIdx]}".`);
      continue;
    }
    const hs = parseScore(cells[hsIdx]);
    const as = parseScore(cells[asIdx]);
    game.homeScore = hs;
    game.awayScore = as;
    game.status = hs !== null && as !== null ? "final" : "scheduled";
    const db = dbIdx >= 0 ? cells[dbIdx]?.trim() : "";
    game.decidedBy = isDecidedBy(db) ? db : game.status === "final" ? "regulation" : null;
    updated++;
  }
  return { updated, errors };
}

function parseScore(cell: string | undefined): number | null {
  const s = (cell ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isDecidedBy(s: string): s is Game["decidedBy"] & string {
  return s === "regulation" || s === "ot" || s === "shootout";
}

// Minimal CSV row parser handling quoted cells.
function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
