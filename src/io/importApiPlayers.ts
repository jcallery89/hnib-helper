import type { Player, PlayerStatLine } from "../engine/types.ts";
import type { EventLeaders, LeaderEntry, PlayerGameLine } from "./dataset.ts";
import { parseHeight, parsePosition, parseShoots } from "./importPlayers.ts";

// Shapes from the Tourno API (/team/{id} and /leaders/{eventId}). Loosely
// typed and read defensively so minor field drift never crashes a sync.

interface ApiRosterPlayer {
  ID?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Number?: number;
  Height?: string | null;
  Shot?: string | null;
  Position?: string | null;
  BirthYear?: string | null;
  Hometown?: string | null;
  SchoolYear?: string | null;
}

interface ApiBoxPlayer {
  Name?: string;
  ID?: string;
  Position?: string;
  Number?: number;
  Goals?: number;
  Assists?: number;
  Points?: number;
  Shots?: number;
  Saves?: number;
  GP?: number;
}

interface ApiTeam {
  ID?: string;
  Name?: string;
  Players?: ApiRosterPlayer[];
  BoxPlayers?: ApiBoxPlayer[];
}

export interface TeamRosterResult {
  players: Player[];
  stats: PlayerStatLine[];
  warnings: string[];
}

/**
 * Parse a /team/{id} response into roster players and cumulative stat lines
 * for the given local team. Box stats join to roster players by API player ID
 * first, then jersey number.
 */
export function parseTeamRoster(json: string, teamId: string, eventId: string): TeamRosterResult {
  const warnings: string[] = [];
  let team: ApiTeam;
  try {
    team = JSON.parse(json) as ApiTeam;
  } catch {
    return { players: [], stats: [], warnings: ["Team JSON could not be parsed."] };
  }

  const players: Player[] = [];
  const byApiId = new Map<string, Player>();
  const byNumber = new Map<number, Player>();

  for (const rp of team.Players ?? []) {
    const jersey = typeof rp.Number === "number" ? rp.Number : null;
    const firstName = (rp.FirstName ?? "").trim();
    const lastName = (rp.LastName ?? "").trim();
    if (!firstName && !lastName && jersey === null) continue;

    const player: Player = {
      id: rp.ID?.trim() || `p-${teamId}-${jersey ?? slug(`${firstName}-${lastName}`)}`,
      eventId,
      teamId,
      jersey,
      firstName,
      lastName,
      position: parsePosition(rp.Position ?? ""),
      classYear: parseYear(rp.SchoolYear),
      shoots: parseShoots(rp.Shot ?? ""),
      heightInches: parseHeight(rp.Height ?? ""),
      hometown: rp.Hometown?.trim() || undefined,
    };
    players.push(player);
    if (rp.ID) byApiId.set(rp.ID, player);
    if (jersey !== null && !byNumber.has(jersey)) byNumber.set(jersey, player);
  }

  const stats: PlayerStatLine[] = [];
  for (const bp of team.BoxPlayers ?? []) {
    const player =
      (bp.ID ? byApiId.get(bp.ID) : undefined) ??
      (typeof bp.Number === "number" ? byNumber.get(bp.Number) : undefined);
    if (!player) {
      warnings.push(`Stat line for #${bp.Number ?? "?"} ${bp.Name ?? ""} has no roster match.`);
      continue;
    }
    const isGoalie = player.position === "G" || parsePosition(bp.Position ?? "") === "G";
    const shots = num(bp.Shots);
    const saves = num(bp.Saves);
    stats.push({
      playerId: player.id,
      gameId: null,
      gp: num(bp.GP),
      goals: num(bp.Goals),
      assists: num(bp.Assists),
      ...(isGoalie
        ? {
            saves,
            shots,
            // The box score carries shots faced and saves; goals against is the difference.
            goalsAgainst: Math.max(0, shots - saves),
          }
        : {}),
    });
  }

  return { players, stats, warnings };
}

interface ApiProfileStatLine {
  Opponent?: string;
  Goals?: number;
  Assists?: number;
  Points?: number;
  PIM?: number;
  Shots?: number;
  Saves?: number;
}

/**
 * Parse a /player_profile/{id} response into game-by-game lines. The profile
 * carries one ProfileStatLine per opponent played.
 */
export function parsePlayerProfile(json: string): PlayerGameLine[] {
  let data: { Stats?: ApiProfileStatLine[] };
  try {
    data = JSON.parse(json) as { Stats?: ApiProfileStatLine[] };
  } catch {
    return [];
  }
  if (!Array.isArray(data.Stats)) return [];
  return data.Stats.map((l) => ({
    opponent: (l.Opponent ?? "").trim(),
    goals: num(l.Goals),
    assists: num(l.Assists),
    points: l.Points !== undefined ? num(l.Points) : num(l.Goals) + num(l.Assists),
    pim: num(l.PIM),
    shots: num(l.Shots),
    saves: num(l.Saves),
  }));
}

interface ApiLeaderPlayer {
  PlayerID?: string;
  FirstName?: string;
  LastName?: string;
  Number?: string | number;
  Position?: string;
  Team?: string;
  Goals?: number | null;
  Points?: number | null;
  Assists?: number | null;
  Pim?: number | null;
  Gaa?: number | null;
  SavePct?: number | null;
}

/** Parse a /leaders/{eventId} response into the event leaders board. */
export function parseLeaders(json: string): EventLeaders {
  let data: Record<string, ApiLeaderPlayer[]>;
  try {
    data = JSON.parse(json) as Record<string, ApiLeaderPlayer[]>;
  } catch {
    data = {};
  }
  return {
    goals: mapCategory(data.Goals, (p) => p.Goals),
    assists: mapCategory(data.Assists, (p) => p.Assists),
    points: mapCategory(data.Points, (p) => p.Points),
    pim: mapCategory(data.PIM, (p) => p.Pim),
    gaa: mapCategory(data.GAA, (p) => p.Gaa),
    savePct: mapCategory(data.SavePct, (p) => p.SavePct),
  };
}

function mapCategory(
  list: ApiLeaderPlayer[] | undefined,
  pick: (p: ApiLeaderPlayer) => number | null | undefined,
): LeaderEntry[] {
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    playerId: p.PlayerID ?? "",
    firstName: p.FirstName ?? "",
    lastName: p.LastName ?? "",
    number: String(p.Number ?? ""),
    position: p.Position ?? "",
    team: p.Team ?? "",
    value: num(pick(p)),
  }));
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function parseYear(s: string | null | undefined): number | undefined {
  const m = (s ?? "").match(/20\d{2}/);
  return m ? Number(m[0]) : undefined;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
