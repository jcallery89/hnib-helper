import type { Dataset } from "./dataset.ts";
import type { Player, PlayerSummary } from "../engine/types.ts";
import { buildPlayoffField } from "../engine/playoff/field.ts";
import { matchRegistrationRows } from "./contactJoin.ts";

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
  /** How many players picked up registration details, and who did not. */
  registrationMatched: number;
  registrationUnmatched: string[];
  warnings: string[];
}

const BIO_HEAD = ["#", "Player", "Pos", "Birth Year", "Ht", "Wt", "Shoots", "Hometown", "School / Club"];
const SKATER_STATS_HEAD = ["GP", "G", "A", "PTS", "PIM"];
const GOALIE_STATS_HEAD = ["GP", "Saves", "GA", "GAA", "SV%"];

// Registration columns worth a recruiter's eye, appended after the stats.
// Street address and ZIP are deliberately NOT pulled: coaches recruit by email
// and phone, and a home address has no recruiting use.
const REG_COLS = {
  gradYr: ["yr", "year", "gradyear", "classof"],
  schoolFall: ["schoolfall", "school(fall)", "school"],
  teamNext: ["teamnextseason", "team(nextseason)", "nextteam", "teamnext"],
  level: ["hockeylevel", "level"],
  city: ["city"],
  state: ["st", "state"],
  shoots: ["shoots", "shot"],
  height: ["ht", "height"],
  weight: ["wt", "weight"],
  social: ["social", "instagram", "ig"],
  parentName: ["p/gname", "pgname", "parentname", "parent/guardianname", "guardianname"],
  parentCell: ["pgcell", "p/gcell", "parentcell", "parentphone"],
  parentEmail: ["pgemail", "p/gemail", "parentemail"],
  playerCell: ["playercell", "playerphone"],
  playerEmail: ["playeremail"],
} as const;

type RegCol = keyof typeof REG_COLS;

const REG_HEAD = [
  "Grad Yr", "School (Fall)", "Team (Next Season)", "Level", "Social",
  "Parent / Guardian", "PG Cell", "PG Email", "Player Cell", "Player Email",
];

/** Per-player registration extras, keyed by player id. Never stored. */
export type RegistrationExtras = Map<string, Partial<Record<RegCol, string>>>;

export interface GuideOptions {
  /** Pre-computed summaries (carry the games-played fallback). */
  summaries?: Map<string, PlayerSummary>;
  /** Raw registration export paste; joined for this export only. */
  registrationCsv?: string;
}

/**
 * Build the full recruiting guide for an event: an overview with division
 * standings, an event-wide skater sheet sorted by scoring, a goalie sheet
 * sorted by GAA, and one roster sheet per team. Tournament stats come from the
 * synced player stat lines, so re-exporting after a sync refreshes every number.
 */
export function buildRecruitingGuide(dataset: Dataset, opts: GuideOptions = {}): RecruitingGuide {
  // Summaries must come from the caller when available: the store applies the
  // games-played fallback for Tourno box scores that report GP as 0, and
  // recomputing here would blank the GP column.
  const summaries = opts.summaries ?? new Map<string, PlayerSummary>();
  const teamName = new Map(dataset.teams.map((t) => [t.id, t.name]));
  const players = dataset.players ?? [];

  // One-shot registration join for this export. Contact details are read into
  // the workbook and never written to the Dataset (no-PII guarantee).
  const reg: RegistrationExtras = new Map();
  let registrationUnmatched: string[] = [];
  const warnings: string[] = [];
  if (opts.registrationCsv && opts.registrationCsv.trim()) {
    const match = matchRegistrationRows(opts.registrationCsv, players, dataset.teams);
    warnings.push(...match.warnings);
    registrationUnmatched = match.unmatched;
    const idx = Object.fromEntries(
      (Object.keys(REG_COLS) as RegCol[]).map((k) => [k, match.columnIndex(REG_COLS[k])]),
    ) as Record<RegCol, number>;
    for (const [playerId, row] of match.rowByPlayerId) {
      const vals: Partial<Record<RegCol, string>> = {};
      for (const k of Object.keys(REG_COLS) as RegCol[]) {
        const i = idx[k];
        const v = i >= 0 ? (row[i] ?? "").trim() : "";
        if (v) vals[k] = v;
      }
      reg.set(playerId, vals);
    }
  }

  const bio = (p: Player) => bioCells(p, reg.get(p.id));
  const regCells = (p: Player) => registrationCells(reg.get(p.id));

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
      ["Team", ...BIO_HEAD, ...SKATER_STATS_HEAD, ...REG_HEAD],
      ...skaters.map((p) => [
        teamName.get(p.teamId) ?? "",
        ...bio(p),
        ...skaterStatCells(summaries.get(p.id)),
        ...regCells(p),
      ]),
    ],
    colWidths: [18, 4, 22, 4, 10, 6, 5, 6, 20, 20, 4, 4, 4, 5, 5, 8, 24, 26, 16, 18, 20, 15, 26, 15, 26],
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
      ["Team", ...BIO_HEAD, ...GOALIE_STATS_HEAD, ...REG_HEAD],
      ...goalies.map((p) => [
        teamName.get(p.teamId) ?? "",
        ...bio(p),
        ...goalieStatCells(summaries.get(p.id)),
        ...regCells(p),
      ]),
    ],
    colWidths: [18, 4, 22, 4, 10, 6, 5, 6, 20, 20, 4, 6, 4, 6, 6, 8, 24, 26, 16, 18, 20, 15, 26, 15, 26],
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
        [...BIO_HEAD, ...SKATER_STATS_HEAD, "GAA", "SV%", ...REG_HEAD],
        ...ordered.map((p) => {
          const s = summaries.get(p.id);
          const rates = isG(p) ? [fmt2(s?.gaa), fmt3(s?.savePct)] : [null, null];
          return [...bio(p), ...skaterStatCells(s), ...rates, ...regCells(p)];
        }),
      ],
      colWidths: [4, 22, 4, 10, 6, 5, 6, 20, 20, 4, 4, 4, 5, 5, 6, 6, 8, 24, 26, 16, 18, 20, 15, 26, 15, 26],
    });
  }

  return {
    filename: `${slug(dataset.event.name)}-recruiting-guide.xlsx`,
    sheets: sheets.map((s, i) => ({ ...s, name: sheetName(s.name, i, sheets) })),
    registrationMatched: reg.size,
    registrationUnmatched,
    warnings,
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

// Roster data wins; registration fills the gaps the API roster leaves blank.
function bioCells(p: Player, r?: Partial<Record<RegCol, string>>): Cell[] {
  const hometown =
    p.hometown ??
    ([r?.city, r?.state].filter(Boolean).join(", ") || null);
  return [
    p.jersey,
    name(p),
    p.position ?? null,
    p.birthYear ?? null,
    fmtHeight(p.heightInches) ?? r?.height ?? null,
    p.weightLbs ?? (r?.weight ? Number(r.weight) || r.weight : null),
    p.shoots ?? (r?.shoots ? r.shoots.charAt(0).toUpperCase() : null),
    hometown,
    p.school ?? r?.schoolFall ?? null,
  ];
}

function registrationCells(r?: Partial<Record<RegCol, string>>): Cell[] {
  return [
    r?.gradYr ?? null,
    r?.schoolFall ?? null,
    r?.teamNext ?? null,
    r?.level ?? null,
    r?.social ?? null,
    r?.parentName ?? null,
    r?.parentCell ?? null,
    r?.parentEmail ?? null,
    r?.playerCell ?? null,
    r?.playerEmail ?? null,
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
