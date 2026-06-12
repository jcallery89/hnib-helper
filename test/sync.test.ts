import { afterEach, describe, expect, it, vi } from "vitest";
import { syncEvent } from "../src/io/sync.ts";

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
