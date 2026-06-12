import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlayerGameLog, fullSync, syncEvent } from "../src/io/sync.ts";

const SCHEDULE = '{"Games":[]}';
const TEAMS = "[]";

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncEvent", () => {
  it("uses the direct API when the browser is allowed to call it", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === "https://hnib.app/api/schedule/abc-12345") return jsonResponse(SCHEDULE);
      if (u === "https://hnib.app/api/teams/abc-12345") return jsonResponse(TEAMS);
      throw new Error(`unexpected url ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncEvent("abc-12345");
    expect(result.source).toBe("direct");
    expect(result.scheduleJson).toBe(SCHEDULE);
    expect(result.teamsJson).toBe(TEAMS);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to the PHP relay when the direct call is blocked (CORS)", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith("https://hnib.app/")) throw new TypeError("Failed to fetch"); // CORS-style failure
      if (u === "./hnib-proxy.php?path=schedule/abc-12345") return jsonResponse(SCHEDULE);
      if (u === "./hnib-proxy.php?path=teams/abc-12345") return jsonResponse(TEAMS);
      throw new Error(`unexpected url ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncEvent("abc-12345");
    expect(result.source).toBe("proxy");
    expect(result.scheduleJson).toBe(SCHEDULE);
    expect(result.teamsJson).toBe(TEAMS);
  });

  it("treats a missing teams response as a warning, not a failure", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === "https://hnib.app/api/schedule/abc-12345") return jsonResponse(SCHEDULE);
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncEvent("abc-12345");
    expect(result.scheduleJson).toBe(SCHEDULE);
    expect(result.teamsJson).toBeNull();
    expect(result.warnings.join(" ")).toContain("Divisions");
  });

  it("rejects ids that are not safe path segments", async () => {
    await expect(syncEvent("../../etc/passwd")).rejects.toThrow(/event ID/i);
  });

  it("rejects an HTML page masquerading as a JSON response", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>login</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(syncEvent("abc-12345")).rejects.toThrow(/Could not reach/);
  });
});

describe("fullSync", () => {
  const FULL_SCHEDULE = JSON.stringify({
    Games: [
      { GameID: "g1", HomeTeamName: "Middlesex", HomeTeamCode: "Middlesex", AwayTeamName: "Northeast", AwayTeamCode: "Northeast", HomeTeamScore: 4, AwayTeamScore: 1, Status: "FINAL", Date: "2025-06-27T09:45:00Z", Description: "Game 1" },
    ],
  });
  const FULL_TEAMS = JSON.stringify([
    { ID: "east", Name: "EAST", Teams: [{ ID: "api-mid-1234", Code: "Middlesex", Name: "Middlesex" }, { ID: "api-nor-1234", Code: "Northeast", Name: "Northeast" }] },
  ]);
  const TEAM_MID = JSON.stringify({
    ID: "api-mid-1234",
    Players: [{ ID: "u-jack", FirstName: "Jack", LastName: "Sullivan", Number: 9, Position: "F" }],
    BoxPlayers: [{ ID: "u-jack", Number: 9, Goals: 8, Assists: 6, GP: 7 }],
  });
  const TEAM_NOR = JSON.stringify({ ID: "api-nor-1234", Players: [], BoxPlayers: [] });
  const LEADERS = JSON.stringify({
    Points: [{ PlayerID: "u-jack", FirstName: "Jack", LastName: "Sullivan", Number: "9", Position: "F", Team: "Middlesex", Points: 14 }],
  });

  function stubApi(overrides: Record<string, Response | (() => Response)> = {}) {
    const routes: Record<string, string> = {
      "schedule/ev-12345678": FULL_SCHEDULE,
      "teams/ev-12345678": FULL_TEAMS,
      "team/api-mid-1234": TEAM_MID,
      "team/api-nor-1234": TEAM_NOR,
      "leaders/ev-12345678": LEADERS,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url).replace("https://hnib.app/api/", "");
        const override = overrides[u];
        if (override) return typeof override === "function" ? override() : override;
        const body = routes[u];
        if (!body) return new Response("not found", { status: 404 });
        return jsonResponse(body);
      }),
    );
  }

  it("syncs schedule, divisions, rosters, and leaders in one pass", async () => {
    stubApi();
    const r = await fullSync("ev-12345678");
    expect(r.teamCount).toBe(2);
    expect(r.divisionsAssigned).toBe(true);
    expect(r.rosterTeams).toBe(2);
    expect(r.playerCount).toBe(1);
    expect(r.leadersSynced).toBe(true);
    expect(r.dataset.players?.[0]).toMatchObject({ id: "u-jack", jersey: 9 });
    expect(r.dataset.playerStats?.[0]).toMatchObject({ playerId: "u-jack", goals: 8 });
    expect(r.dataset.leaders?.points[0].value).toBe(14);
  });

  it("preserves locally entered playoff results on re-sync of the same event", async () => {
    stubApi();
    const first = await fullSync("ev-12345678");
    first.dataset.bracketResults = { qf1: { highScore: 3, lowScore: 1, decidedBy: "regulation" } };
    const second = await fullSync("ev-12345678", first.dataset);
    expect(second.dataset.bracketResults?.qf1).toMatchObject({ highScore: 3, lowScore: 1 });
  });

  it("keeps a team's previous roster when its fetch fails", async () => {
    stubApi();
    const first = await fullSync("ev-12345678");
    stubApi({ "team/api-mid-1234": () => new Response("oops", { status: 500 }) });
    const second = await fullSync("ev-12345678", first.dataset);
    expect(second.dataset.players?.some((p) => p.id === "u-jack")).toBe(true);
    expect(second.warnings.join(" ")).toContain("Middlesex");
  });
});

describe("fetchPlayerGameLog", () => {
  it("fetches and parses a player profile", async () => {
    const profile = JSON.stringify({
      Stats: [{ Opponent: "Essex", Goals: 1, Assists: 0, Points: 1, PIM: 0, Shots: 3, Saves: 0 }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url) === "https://hnib.app/api/player_profile/u-jack-123") return jsonResponse(profile);
        return new Response("not found", { status: 404 });
      }),
    );
    const log = await fetchPlayerGameLog("u-jack-123");
    expect(log).toHaveLength(1);
    expect(log[0].opponent).toBe("Essex");
  });

  it("rejects players that did not come from a sync", async () => {
    await expect(fetchPlayerGameLog("p#bad id")).rejects.toThrow(/sync/);
  });
});
