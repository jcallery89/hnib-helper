import type { Dataset } from "./dataset.ts";
import type { Division, Game, GameRound, Team } from "../engine/types.ts";
import { DEFAULT_POINT_SYSTEM } from "../engine/pointSystem.ts";

export interface ApiImportSummary {
  teamCount: number;
  roundRobinGames: number;
  playoffGames: number;
  skipped: number;
  divisionsAssigned: boolean;
  warnings: string[];
}

export interface ApiImportResult {
  dataset: Dataset;
  summary: ApiImportSummary;
}

// Shapes from the Tourno API (https://hnib.app/api). Loosely typed and read
// defensively so minor field differences never crash the import.
interface ApiGame {
  GameID?: string;
  Description?: string;
  Status?: string;
  Date?: string;
  Time?: string;
  Location?: string;
  LocationCode?: string;
  HomeTeamName?: string | null;
  HomeTeamCode?: string;
  HomeTeamPlaceholder?: string;
  HomeTeamPrimaryRGB?: string;
  HomeTeamSecondaryRGB?: string;
  HomeTeamScore?: number | null;
  AwayTeamName?: string | null;
  AwayTeamCode?: string;
  AwayTeamPlaceholder?: string;
  AwayTeamPrimaryRGB?: string;
  AwayTeamSecondaryRGB?: string;
  AwayTeamScore?: number | null;
}

/**
 * Build a dataset from the Tourno API. `scheduleJson` is the /schedule/{id}
 * response (its Games carry team names, codes, colors, scores, and a
 * Description that identifies the round). `teamsJson`, when provided, is the
 * /teams/{id} response and supplies division groupings and coaches.
 */
export function importApiData(
  scheduleJson: string,
  teamsJson: string | null,
  opts: { eventId?: string; eventName?: string } = {},
): ApiImportResult {
  const warnings: string[] = [];
  const games = parseGames(scheduleJson, warnings);
  const eventId = opts.eventId?.trim() || "hnib-event";
  const eventName = opts.eventName?.trim() || "HNIB Event";

  // Collect teams from the games, keyed by code, capturing names + colors.
  const teamByCode = new Map<string, Team>();
  const ensureTeam = (code: string | undefined, name: string | null | undefined, primary?: string, secondary?: string) => {
    const c = (code ?? "").trim();
    if (!c) return undefined;
    if (!teamByCode.has(c)) {
      teamByCode.set(c, {
        id: `t-${slug(c)}`,
        eventId,
        divisionId: "unassigned",
        name: (name ?? c).trim() || c,
        colorPrimary: cleanColor(primary),
        colorSecondary: cleanColor(secondary),
      });
    }
    return teamByCode.get(c);
  };

  let rr = 0;
  let playoff = 0;
  let skipped = 0;
  const outGames: Game[] = [];

  for (const g of games) {
    const round = classifyRound(g.Description ?? "");
    if (round === null) {
      skipped++; // exhibition / All-Star
      continue;
    }
    const home = ensureTeam(g.HomeTeamCode, g.HomeTeamName, g.HomeTeamPrimaryRGB, g.HomeTeamSecondaryRGB);
    const away = ensureTeam(g.AwayTeamCode, g.AwayTeamName, g.AwayTeamPrimaryRGB, g.AwayTeamSecondaryRGB);
    if (!home || !away) {
      skipped++; // placeholder / not-yet-determined matchup
      continue;
    }
    const status = (g.Status ?? "").toUpperCase() === "FINAL" && g.HomeTeamScore != null && g.AwayTeamScore != null ? "final" : "scheduled";
    if (round === "rr") rr++;
    else playoff++;

    outGames.push({
      id: g.GameID ?? `g-${outGames.length + 1}`,
      divisionId: null,
      round,
      rink: g.LocationCode || g.Location || null,
      slotStart: normalizeDate(g.Date),
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeScore: status === "final" ? (g.HomeTeamScore as number) : g.HomeTeamScore ?? null,
      awayScore: status === "final" ? (g.AwayTeamScore as number) : g.AwayTeamScore ?? null,
      status,
      decidedBy: status === "final" ? "regulation" : null,
    });
  }

  const teams = [...teamByCode.values()];

  // Divisions: from /teams response if present, else one "Unassigned" pool.
  let divisions: Division[];
  let divisionsAssigned = false;
  if (teamsJson) {
    const built = buildDivisions(teamsJson, teams, eventId, warnings);
    divisions = built.divisions;
    divisionsAssigned = built.assignedAny;
  } else {
    divisions = [{ id: "unassigned", eventId, name: "Unassigned", teamIds: teams.map((t) => t.id) }];
  }

  const dataset: Dataset = {
    event: {
      id: eventId,
      name: eventName,
      year: yearFromGames(outGames),
      venues: uniqueLocations(games),
      format: "festival",
      hasPlayoffBracket: true,
      seedingRule: "jrhigh_top2_per_division",
      pointSystem: { ...DEFAULT_POINT_SYSTEM },
    },
    divisions,
    teams,
    games: outGames,
  };

  if (teams.length === 0) warnings.push("No teams were found in the schedule JSON.");

  return {
    dataset,
    summary: { teamCount: teams.length, roundRobinGames: rr, playoffGames: playoff, skipped, divisionsAssigned, warnings },
  };
}

function parseGames(json: string, warnings: string[]): ApiGame[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    warnings.push("Schedule JSON could not be parsed.");
    return [];
  }
  // Accept either the envelope { Games: [...] } or a bare array.
  const games = Array.isArray(data) ? data : (data as { Games?: unknown })?.Games;
  if (!Array.isArray(games)) {
    warnings.push("Schedule JSON did not contain a Games array.");
    return [];
  }
  return games as ApiGame[];
}

interface TeamDivisionListing {
  ID?: string;
  Name?: string;
  Teams?: Array<{ Code?: string; ID?: string; Name?: string; Coach?: string }>;
}

function buildDivisions(
  json: string,
  teams: Team[],
  eventId: string,
  warnings: string[],
): { divisions: Division[]; assignedAny: boolean } {
  let listings: TeamDivisionListing[] = [];
  try {
    const data = JSON.parse(json);
    listings = Array.isArray(data) ? data : (data?.Divisions ?? []);
  } catch {
    warnings.push("Teams/divisions JSON could not be parsed; leaving teams unassigned.");
  }

  const teamByCode = new Map(teams.map((t) => [slug(t.name), t] as const));
  const byId = new Map(teams.map((t) => [t.id, t] as const));
  const divisions: Division[] = [];
  const assigned = new Set<string>();

  for (const d of listings) {
    const divId = `d-${slug(d.ID || d.Name || `div${divisions.length + 1}`)}`;
    const teamIds: string[] = [];
    for (const t of d.Teams ?? []) {
      const code = (t.Code ?? "").trim();
      const match = byId.get(`t-${slug(code)}`) ?? teamByCode.get(slug(t.Name ?? ""));
      if (match) {
        match.divisionId = divId;
        if (t.Coach) match.coach = t.Coach;
        teamIds.push(match.id);
        assigned.add(match.id);
      }
    }
    divisions.push({ id: divId, eventId, name: d.Name ?? divId, teamIds });
  }

  const leftover = teams.filter((t) => !assigned.has(t.id));
  if (leftover.length) {
    divisions.push({ id: "unassigned", eventId, name: "Unassigned", teamIds: leftover.map((t) => t.id) });
  }

  return { divisions, assignedAny: assigned.size > 0 };
}

// Description -> round. Returns null for games to skip (All-Star/exhibition).
function classifyRound(description: string): GameRound | null {
  const d = description.toLowerCase();
  if (/all[-\s]?star|exhibition/.test(d)) return null;
  if (/champ|final(?!ist)/.test(d) && !/semi/.test(d)) return "final";
  if (/semi/.test(d)) return "sf";
  if (/playoff|quarter|\bqf\b/.test(d)) return "qf";
  if (/prelim/.test(d)) return "prelim";
  if (/^game\b|round\s*robin|^rr\b/.test(d)) return "rr";
  return "rr"; // default unknown descriptions to round robin
}

// "2025-06-27T09:45:00Z" -> "2025-06-27T09:45:00" (the clock time is local; the
// Z is cosmetic, matching the Time field, so we keep the wall-clock naive).
function normalizeDate(date: string | undefined): string | null {
  if (!date) return null;
  const m = date.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return m ? m[0] : date.slice(0, 19) || null;
}

function yearFromGames(games: Game[]): number {
  const g = games.find((x) => x.slotStart);
  return g ? Number(g.slotStart!.slice(0, 4)) : new Date().getFullYear();
}

function uniqueLocations(games: ApiGame[]): string[] {
  const set = new Set<string>();
  for (const g of games) if (g.Location) set.add(g.Location);
  return [...set];
}

function cleanColor(c: string | undefined): string | undefined {
  const v = (c ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

function slug(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
