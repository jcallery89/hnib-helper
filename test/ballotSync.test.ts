import { describe, expect, it } from "vitest";
import { ballotSyncPayload, pushBallotRoster, defaultBallotSyncConfig } from "../src/io/ballotSync.ts";
import { summarizePlayers } from "../src/engine/players/summary.ts";
import type { Dataset } from "../src/io/dataset.ts";
import type { HnibEvent, Player, PlayerStatLine, PlayerSummary } from "../src/engine/types.ts";

const event: HnibEvent = {
  id: "e1", name: "Sophomore Festival", year: 2026, venues: [], format: "festival",
  hasPlayoffBracket: true, seedingRule: "soph_division_winners", pointSystem: { win: 2, tie: 1, loss: 0 },
};

const players: Player[] = [
  { id: "p1", eventId: "e1", teamId: "tA", jersey: 12, firstName: "Jane", lastName: "Smith", position: "F" },
];
const stats: PlayerStatLine[] = [{ playerId: "p1", gameId: "g1", goals: 2, assists: 1 }];
const dataset: Dataset = {
  event, divisions: [], teams: [{ id: "tA", eventId: "e1", divisionId: "d1", name: "Coastal" }],
  games: [], players, playerStats: stats,
};

function summaries(): Map<string, PlayerSummary> {
  return new Map(summarizePlayers(players, stats).map((s) => [s.playerId, s]));
}

const cfg = { ...defaultBallotSyncConfig, url: "./hnib-ballot-sync.php", token: "secret" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ballotSyncPayload", () => {
  it("carries the derived table name and one row per player", () => {
    const payload = ballotSyncPayload(dataset, summaries());
    expect(payload.table).toBe("gf_soph_rosters");
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].player_name).toBe("Jane Smith");
  });
});

describe("pushBallotRoster", () => {
  it("POSTs JSON with the token header and returns the written count", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return jsonResponse(200, { ok: true, written: 1, table: "wp_gf_soph_rosters" });
    }) as unknown as typeof fetch;

    const result = await pushBallotRoster(dataset, summaries(), cfg, fakeFetch);
    expect(result).toEqual({ written: 1, table: "wp_gf_soph_rosters" });
    expect(seen!.url).toBe("./hnib-ballot-sync.php");
    expect(seen!.init.method).toBe("POST");
    expect((seen!.init.headers as Record<string, string>)["X-Ballot-Token"]).toBe("secret");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.rows[0].display).toBe("#12 Jane Smith - 1GP 2G 1A 3P");
  });

  it("rejects with the server's error message on a non-ok response", async () => {
    const fakeFetch = (async () => jsonResponse(401, { ok: false, error: "Bad token." })) as unknown as typeof fetch;
    await expect(pushBallotRoster(dataset, summaries(), cfg, fakeFetch)).rejects.toThrow("Bad token.");
  });

  it("rejects when the network is unreachable", async () => {
    const fakeFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(pushBallotRoster(dataset, summaries(), cfg, fakeFetch)).rejects.toThrow("Could not reach");
  });

  it("refuses to push an empty roster", async () => {
    const empty: Dataset = { ...dataset, players: [], playerStats: [] };
    const fakeFetch = (async () => jsonResponse(200, { ok: true })) as unknown as typeof fetch;
    await expect(pushBallotRoster(empty, new Map(), cfg, fakeFetch)).rejects.toThrow("No players");
  });
});
