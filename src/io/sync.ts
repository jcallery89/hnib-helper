// One-click sync against the Tourno API (https://hnib.app/api).
//
// Browsers may or may not be allowed to call hnib.app cross-origin (CORS); we
// cannot know until tried. So sync attempts the direct call first and, if that
// fails, retries through a tiny same-origin PHP relay (public/hnib-proxy.php,
// shipped with the site for SiteGround). The schedule is required; divisions
// (/teams) are best-effort.

import { importApiData } from "./importApi.ts";
import { extractPlayoffSlots } from "./importPlayoffApi.ts";
import { buildPlayoffField } from "../engine/playoff/field.ts";
import { qfPairings } from "../engine/playoff/bracket.ts";
import { parseLeaders, parsePlayerProfile, parseTeamRoster } from "./importApiPlayers.ts";
import type { Dataset, PlayerGameLine } from "./dataset.ts";
import type { Player, PlayerStatLine } from "../engine/types.ts";

export interface SyncResult {
  scheduleJson: string;
  teamsJson: string | null;
  source: "direct" | "proxy";
  warnings: string[];
}

const API_BASE = "https://hnib.app/api";
const PROXY_URL = "./hnib-proxy.php";

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export async function syncEvent(eventId: string): Promise<SyncResult> {
  const id = eventId.trim();
  if (!ID_RE.test(id)) {
    throw new Error("That does not look like an event ID. Expected letters, digits, and dashes.");
  }

  const warnings: string[] = [];
  let source: SyncResult["source"] = "direct";

  let scheduleJson: string;
  try {
    scheduleJson = await fetchJsonText(`${API_BASE}/schedule/${id}`);
  } catch {
    // Direct call blocked (likely CORS) or network error - try the relay.
    try {
      scheduleJson = await fetchJsonText(`${PROXY_URL}?path=schedule/${id}`);
      source = "proxy";
    } catch {
      throw new Error(
        "Could not reach hnib.app directly or via the site helper. " +
          "If this keeps happening, make sure hnib-proxy.php is uploaded next to index.html.",
      );
    }
  }

  let teamsJson: string | null = null;
  try {
    teamsJson =
      source === "direct"
        ? await fetchJsonText(`${API_BASE}/teams/${id}`)
        : await fetchJsonText(`${PROXY_URL}?path=teams/${id}`);
  } catch {
    warnings.push("Divisions could not be fetched; assign teams to divisions manually in Setup.");
  }

  return { scheduleJson, teamsJson, source, warnings };
}

async function fetchJsonText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Guard against an HTML error page masquerading as a 200.
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) throw new Error("Response was not JSON");
  return t;
}

function fetchPath(source: SyncResult["source"], path: string): Promise<string> {
  return source === "direct"
    ? fetchJsonText(`${API_BASE}/${path}`)
    : fetchJsonText(`${PROXY_URL}?path=${path}`);
}

/** Fetch a single API path, trying the direct call then the relay. */
async function fetchApiJson(path: string): Promise<string> {
  try {
    return await fetchJsonText(`${API_BASE}/${path}`);
  } catch {
    return await fetchJsonText(`${PROXY_URL}?path=${path}`);
  }
}

/**
 * Fetch one player's game-by-game lines from /player_profile/{id}. Called on
 * demand (per player) rather than during fullSync, since profiles are one
 * request each and an event can carry well over a hundred players.
 */
export async function fetchPlayerGameLog(playerId: string): Promise<PlayerGameLine[]> {
  const id = playerId.trim();
  if (!ID_RE.test(id)) {
    throw new Error("This player did not come from an hnib.app sync, so there is no profile to fetch.");
  }
  return parsePlayerProfile(await fetchApiJson(`player_profile/${id}`));
}

// ---- Full sync: schedule + divisions + team rosters + leaders --------------

export interface FullSyncResult {
  dataset: Dataset;
  source: SyncResult["source"];
  teamCount: number;
  roundRobinGames: number;
  playoffGames: number;
  divisionsAssigned: boolean;
  rosterTeams: number; // teams whose roster synced
  playerCount: number;
  leadersSynced: boolean;
  warnings: string[];
}

/**
 * Sync everything for an event: schedule and divisions, then each team's
 * roster and cumulative stats (/team/{id}), then the leaders board. Rosters
 * and leaders are best-effort; the schedule is required. When re-syncing the
 * same event, locally entered playoff results (bracketResults) are preserved,
 * and teams whose roster fetch fails keep their previous players.
 */
export async function fullSync(
  eventId: string,
  prev?: Dataset | null,
  opts: { eventName?: string } = {},
): Promise<FullSyncResult> {
  const id = eventId.trim();
  const base = await syncEvent(id);
  const warnings = [...base.warnings];

  const sameEvent = prev != null && prev.event.id === id;
  const { dataset, summary } = importApiData(base.scheduleJson, base.teamsJson, {
    eventId: id,
    eventName: opts.eventName ?? (sameEvent ? prev.event.name : undefined),
  });
  warnings.push(...summary.warnings);

  // Playoff configuration is operator-set, not in the API feed, so carry it
  // forward across re-syncs instead of resetting to import defaults.
  if (sameEvent && prev) {
    dataset.event.seedingRule = prev.event.seedingRule;
    dataset.event.fieldSize = prev.event.fieldSize;
    dataset.event.hasPlayoffBracket = prev.event.hasPlayoffBracket;
    dataset.event.pointSystem = prev.event.pointSystem;
  }

  // Re-extract playoff game times using the carried-forward field size (the
  // import default may have guessed a different size before config was applied).
  // The seeded first-round pairs travel along so a feed that fills real teams
  // into its first-round games ("Playoff 1..4" in ice-time order) maps by
  // matchup instead of by unreliable numbering.
  const fieldSizeNow = dataset.event.fieldSize === 6 ? 6 : 8;
  let qfTeamPairs: Array<{ cellId: string; teams: [string, string] }> = [];
  try {
    const field = buildPlayoffField(dataset.event, dataset.divisions, dataset.teams, dataset.games, {
      pointSystem: dataset.event.pointSystem,
      teams: dataset.teams,
    });
    const teamBySeed = new Map(field.seeds.map((s) => [s.seed, s.teamId]));
    const nameById = new Map(dataset.teams.map((t) => [t.id, t.name]));
    for (const p of qfPairings(fieldSizeNow)) {
      const a = nameById.get(teamBySeed.get(p.high) ?? "");
      const b = nameById.get(teamBySeed.get(p.low) ?? "");
      if (a && b) qfTeamPairs.push({ cellId: p.id, teams: [a, b] });
    }
  } catch {
    qfTeamPairs = []; // field not seedable yet; label mapping still applies
  }
  const autoSlots = extractPlayoffSlots(base.scheduleJson, fieldSizeNow, { qfTeamPairs }).byCell;
  if (Object.keys(autoSlots).length) dataset.playoffSchedule = autoSlots;

  // Team rosters + stats.
  const players: Player[] = [];
  const stats: PlayerStatLine[] = [];
  let rosterTeams = 0;
  const syncable = dataset.teams.filter((t) => t.apiId && ID_RE.test(t.apiId));
  if (syncable.length === 0) {
    warnings.push("No team ids in the divisions data; rosters were not synced.");
  }
  const settled = await Promise.allSettled(
    syncable.map(async (team) => ({ team, json: await fetchPath(base.source, `team/${team.apiId}`) })),
  );
  settled.forEach((res, i) => {
    const team = syncable[i];
    if (res.status === "fulfilled") {
      const parsed = parseTeamRoster(res.value.json, team.id, id);
      players.push(...parsed.players);
      stats.push(...parsed.stats);
      warnings.push(...parsed.warnings);
      // The per-team endpoint carries the real team colors (the schedule feed's
      // are static brand shades). Use them as the base; manual overrides win below.
      const dst = dataset.teams.find((t) => t.id === team.id);
      if (dst) {
        if (parsed.colorPrimary) dst.colorPrimary = parsed.colorPrimary;
        if (parsed.colorSecondary) dst.colorSecondary = parsed.colorSecondary;
      }
      rosterTeams++;
    } else {
      // Keep this team's previous roster rather than dropping it.
      if (sameEvent && prev?.players) {
        const kept = prev.players.filter((p) => p.teamId === team.id);
        players.push(...kept);
        const keptIds = new Set(kept.map((p) => p.id));
        stats.push(...(prev.playerStats ?? []).filter((l) => keptIds.has(l.playerId)));
      }
      warnings.push(`Roster for ${team.name} could not be fetched.`);
    }
  });
  if (players.length > 0) {
    dataset.players = players;
    dataset.playerStats = stats;
  } else if (sameEvent && prev?.players?.length) {
    dataset.players = prev.players;
    dataset.playerStats = prev.playerStats;
  }

  // Leaders board.
  let leadersSynced = false;
  try {
    dataset.leaders = parseLeaders(await fetchPath(base.source, `leaders/${id}`));
    leadersSynced = true;
  } catch {
    if (sameEvent && prev?.leaders) dataset.leaders = prev.leaders;
    warnings.push("Leaders board could not be fetched.");
  }

  // Preserve everything entered locally across re-syncs (auto-sync re-runs
  // every few minutes, so it must never wipe the operator's work): playoff
  // results, All-Star flags, scouting writeups, and fetched game logs. These are
  // keyed by stable ids, so carrying them forward keeps them attached.
  if (sameEvent && prev) {
    if (prev.bracketResults) dataset.bracketResults = prev.bracketResults;
    // Auto-detected times are the baseline; any the operator fixed by hand
    // (pasted on the Bracket page) win and survive the re-sync.
    if (prev.playoffSchedule) {
      dataset.playoffSchedule = { ...(dataset.playoffSchedule ?? {}), ...prev.playoffSchedule };
    }
    if (prev.allStarIds) dataset.allStarIds = prev.allStarIds;
    if (prev.playerWriteups) dataset.playerWriteups = prev.playerWriteups;
    if (prev.playerGameLogs) dataset.playerGameLogs = prev.playerGameLogs;
    if (prev.ballot) dataset.ballot = prev.ballot;
    // Manual team-color overrides win over the API base and survive re-syncs.
    if (prev.teamColors) {
      dataset.teamColors = prev.teamColors;
      for (const t of dataset.teams) {
        const c = prev.teamColors[t.id];
        if (c) t.colorPrimary = c;
      }
    }
    // Default-preserve: any other Dataset field the API rebuild did not set
    // carries forward automatically, so a future locally-owned field cannot
    // be silently dropped by re-sync just because it is missing from this list.
    const src = prev as unknown as Record<string, unknown>;
    const dst = dataset as unknown as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (dst[key] === undefined && src[key] !== undefined) dst[key] = src[key];
    }
  }

  return {
    dataset,
    source: base.source,
    teamCount: summary.teamCount,
    roundRobinGames: summary.roundRobinGames,
    playoffGames: summary.playoffGames,
    divisionsAssigned: summary.divisionsAssigned,
    rosterTeams,
    playerCount: dataset.players?.length ?? 0,
    leadersSynced,
    warnings,
  };
}
