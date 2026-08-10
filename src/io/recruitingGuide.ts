import type { Dataset } from "./dataset.ts";
import type { Player, PlayerSummary } from "../engine/types.ts";
import { summarizePlayers } from "../engine/players/summary.ts";
import { buildPlayoffField } from "../engine/playoff/field.ts";

// Build the recruiting guide workbook as plain data (sheet name + rows of
// cells), so the shape is testable without the spreadsheet library. The caller
// feeds the sheets to SheetJS and downloads the .xlsx.

export type Cell = string | number | null;

export interface GuideSheet {
  name: string;
  rows: Cell[][];
  /** Column widths in characters, aligned with the widest sheets' columns. */
  colWidths?: number[];
}

export interface RecruitingGuide {
  filename: string;
  sheets: GuideSheet[];
}

const BIO_HEAD = ["#", "Player", "Pos", "Birth Year", "Ht", "Wt", "Shoots", "Hometown", "School / Club"];
const SKATER_STATS_HEAD = ["GP", "G", "A", "PTS", "PIM"];
const GOALIE_STATS_HEAD = ["GP", "Saves", "GA", "GAA", "SV%"];

/**
 * Build the full recruiting guide for an event: an overview with division
 * standings, an event-wide skater sheet sorted by scoring, a goalie sheet
 * sorted by GAA, and one roster sheet per team. Tournament stats come from the
 * synced player stat lines, so re-exporting after a sync refreshes every number.
 */
export function buildRecruitingGuide(dataset: Dataset): RecruitingGuide {
  const summaries = new Map(
    summarizePlayers(dataset.players ?? [], dataset.playerStats ?? []).map((s) => [s.playerId, s]),
  );
  const teamName = new Map(dataset.teams.map((t) => [t.id, t.name]));
  const players = dataset.players ?? [];

  const sheets: GuideSheet[] = [overviewSheet(dataset)];

  // Event-wide skaters by production.
  const skaters = players
    .filter((p) => !(summaries.get(p.id)?.isGoalie ?? p.position === "G"))
    .sort((a, b) => {
      const sa = summaries.get(a.id);
      const sb = summaries.get(b.id);
      return (
        (sb?.points ?? 0) - (sa?.points ?? 0) ||
        (sb?.goals ?? 0) - (sa?.goals ?? 0) ||
        name(a).localeCompare(name(b))
      );
    });
  sheets.push({
    name: "All Skaters",
    rows: [
      [`${dataset.event.name} - all skaters by tournament scoring`],
      [],
      ["Team", ...BIO_HEAD, ...SKATER_STATS_HEAD],
      ...skaters.map((p) => [teamName.get(p.teamId) ?? "", ...bioCells(p), ...skaterStatCells(summaries.get(p.id))]),
    ],
    colWidths: [18, 4, 22, 4, 10, 6, 5, 6, 20, 20, 4, 4, 4, 5, 5],
  });

  // Goalies by GAA (those with data first).
  const goalies = players
    .filter((p) => summaries.get(p.id)?.isGoalie ?? p.position === "G")
    .sort((a, b) => {
      const ga = summaries.get(a.id)?.gaa;
      const gb = summaries.get(b.id)?.gaa;
      if (ga === undefined && gb === undefined) return name(a).localeCompare(name(b));
      if (ga === undefined) return 1;
      if (gb === undefined) return -1;
      return ga - gb || name(a).localeCompare(name(b));
    });
  sheets.push({
    name: "Goalies",
    rows: [
      [`${dataset.event.name} - goalies by goals-against average`],
      [],
      ["Team", ...BIO_HEAD, ...GOALIE_STATS_HEAD],
      ...goalies.map((p) => [teamName.get(p.teamId) ?? "", ...bioCells(p), ...goalieStatCells(summaries.get(p.id))]),
    ],
    colWidths: [18, 4, 22, 4, 10, 6, 5, 6, 20, 20, 4, 6, 4, 6, 6],
  });

  // One sheet per team, skaters then goalies, jersey order.
  const divName = new Map(dataset.divisions.map((d) => [d.id, d.name]));
  for (const team of [...dataset.teams].sort((a, b) => a.name.localeCompare(b.name))) {
    const roster = players.filter((p) => p.teamId === team.id);
    if (roster.length === 0) continue;
    const isG = (p: Player) => summaries.get(p.id)?.isGoalie ?? p.position === "G";
    const byJersey = (a: Player, b: Player) => (a.jersey ?? 999) - (b.jersey ?? 999);
    const ordered = [...roster.filter((p) => !isG(p)).sort(byJersey), ...roster.filter(isG).sort(byJersey)];
    sheets.push({
      name: team.name,
      rows: [
        [team.name],
        [
          [divName.get(team.divisionId) ? `Division: ${divName.get(team.divisionId)}` : null, team.coach ? `Coach: ${team.coach}` : null]
            .filter(Boolean)
            .join("    ") || null,
        ],
        [],
        [...BIO_HEAD, ...SKATER_STATS_HEAD, "GAA", "SV%"],
        ...ordered.map((p) => {
          const s = summaries.get(p.id);
          return isG(p)
            ? [...bioCells(p), ...skaterStatCells(s), fmt2(s?.gaa), fmt3(s?.savePct)]
            : [...bioCells(p), ...skaterStatCells(s), null, null];
        }),
      ],
      colWidths: [4, 22, 4, 10, 6, 5, 6, 20, 20, 4, 4, 4, 5, 5, 6, 6],
    });
  }

  return {
    filename: `${slug(dataset.event.name)}-recruiting-guide.xlsx`,
    sheets: sheets.map((s, i) => ({ ...s, name: sheetName(s.name, i, sheets) })),
  };
}

function overviewSheet(dataset: Dataset): GuideSheet {
  const rows: Cell[][] = [
    [dataset.event.name.toUpperCase()],
    ["Recruiting Guide"],
    ["Player statistics are tournament totals as of the last sync."],
    [],
  ];
  const field = buildPlayoffField(dataset.event, dataset.divisions, dataset.teams, dataset.games, {
    pointSystem: dataset.event.pointSystem,
    teams: dataset.teams,
  });
  const teamName = new Map(dataset.teams.map((t) => [t.id, t.name]));
  for (const div of dataset.divisions) {
    const standings = field.divisionStandings.get(div.id) ?? [];
    if (standings.length === 0) continue;
    rows.push([div.name.toUpperCase()]);
    rows.push(["Rank", "Team", "GP", "W", "L", "T", "PTS", "GF", "GA"]);
    for (const s of standings) {
      rows.push([s.rank, teamName.get(s.teamId) ?? s.teamId, s.gp, s.w, s.l, s.t, s.points, s.gf, s.ga]);
    }
    rows.push([]);
  }
  return { name: "Overview", rows, colWidths: [6, 22, 4, 4, 4, 4, 5, 5, 5] };
}

function name(p: Player): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

function bioCells(p: Player): Cell[] {
  return [
    p.jersey,
    name(p),
    p.position ?? null,
    p.birthYear ?? null,
    fmtHeight(p.heightInches),
    p.weightLbs ?? null,
    p.shoots ?? null,
    p.hometown ?? null,
    p.school ?? null,
  ];
}

function skaterStatCells(s: PlayerSummary | undefined): Cell[] {
  if (!s) return [0, 0, 0, 0, 0];
  return [s.gp, s.goals, s.assists, s.points, s.pim];
}

function goalieStatCells(s: PlayerSummary | undefined): Cell[] {
  if (!s) return [0, null, null, null, null];
  return [s.gp, s.saves ?? null, s.goalsAgainst ?? null, fmt2(s.gaa), fmt3(s.savePct)];
}

function fmtHeight(inches?: number): string | null {
  if (!inches) return null;
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function fmt2(n?: number): string | null {
  return n === undefined ? null : n.toFixed(2);
}

function fmt3(n?: number): string | null {
  return n === undefined ? null : n.toFixed(3).replace(/^0/, "");
}

// Excel sheet names: max 31 chars, no []:*?/\ and unique within the workbook.
function sheetName(raw: string, index: number, all: GuideSheet[]): string {
  let base = raw.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || `Sheet${index + 1}`;
  const taken = all
    .slice(0, index)
    .map((s) => s.name.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31));
  let candidate = base;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${base.slice(0, 28)} ${n++}`;
  return candidate;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
