import { describe, expect, it } from "vitest";
import { importApiData } from "../src/io/importApi.ts";

// A trimmed slice of a real https://hnib.app/api/schedule/{id} response.
const SCHEDULE = JSON.stringify({
  Games: [
    { GameID: "g1", HomeTeamName: "Middlesex", HomeTeamCode: "Middlesex", HomeTeamPrimaryRGB: "#c00000", HomeTeamSecondaryRGB: "#ffffff", AwayTeamName: "Northeast", AwayTeamCode: "Northeast", AwayTeamPrimaryRGB: "#00b050", AwayTeamSecondaryRGB: "#ffffff", HomeTeamScore: 4, AwayTeamScore: 1, Status: "FINAL", Date: "2025-06-27T09:45:00Z", Time: "09:45 AM", Location: "Worcester Ice Center-MGH", LocationCode: "WIC-MGH", Description: "Game 1" },
    { GameID: "g19", HomeTeamName: "Middlesex", HomeTeamCode: "Middlesex", AwayTeamName: "Metropolitan", AwayTeamCode: "Metro", AwayTeamPrimaryRGB: "#008080", HomeTeamScore: 7, AwayTeamScore: 0, Status: "FINAL", Date: "2025-06-30T16:00:00Z", Time: "04:00 PM", LocationCode: "WIC-MGH", Description: "Playoff 1" },
    { GameID: "sf1", HomeTeamName: "Western", HomeTeamCode: "Western", AwayTeamName: "Bay State", AwayTeamCode: "Bay State", HomeTeamScore: 2, AwayTeamScore: 2, Status: "FINAL", Date: "2025-07-01T08:00:00Z", Time: "08:00 AM", LocationCode: "WIC-MGH", Description: "SemiFinal 1" },
    { GameID: "champ", HomeTeamName: "Middlesex", HomeTeamCode: "Middlesex", AwayTeamName: "Bay State", AwayTeamCode: "Bay State", HomeTeamScore: 3, AwayTeamScore: 0, Status: "FINAL", Date: "2025-07-01T10:00:00Z", Time: "10:00 AM", LocationCode: "WIC-MGH", Description: "Championship" },
    { GameID: "as", HomeTeamName: "Orange All-Stars", HomeTeamCode: "ORNG", AwayTeamName: "White All-Stars", AwayTeamCode: "WHITE", HomeTeamScore: 3, AwayTeamScore: 3, Status: "SCHEDULED", Date: "2025-07-01T12:30:00Z", Time: "12:30 PM", LocationCode: "WIC-MGH", Description: "All-Star Game" },
  ],
});

const TEAMS = JSON.stringify([
  { ID: "east", Name: "EAST", Teams: [{ ID: "api-mid", Code: "Middlesex", Name: "Middlesex", Coach: "R. Sullivan" }, { ID: "api-bay", Code: "Bay State", Name: "Bay State" }, { ID: "api-nor", Code: "Northeast", Name: "Northeast" }] },
  { ID: "west", Name: "WEST", Teams: [{ ID: "api-wes", Code: "Western", Name: "Western" }, { ID: "api-met", Code: "Metro", Name: "Metropolitan" }] },
]);

describe("importApiData", () => {
  it("builds teams with colors and classifies rounds from Description", () => {
    const { dataset, summary } = importApiData(SCHEDULE, null);
    expect(summary.teamCount).toBe(5);
    expect(summary.roundRobinGames).toBe(1);
    expect(summary.playoffGames).toBe(3); // Playoff 1 + SemiFinal 1 + Championship
    expect(summary.skipped).toBe(1); // All-Star

    const mid = dataset.teams.find((t) => t.id === "t-middlesex")!;
    expect(mid.colorPrimary).toBe("#c00000");
    // Code differs from name (Metro -> Metropolitan).
    expect(dataset.teams.find((t) => t.id === "t-metro")!.name).toBe("Metropolitan");

    const byId = new Map(dataset.games.map((g) => [g.id, g]));
    expect(byId.get("g1")!.round).toBe("rr");
    expect(byId.get("g19")!.round).toBe("qf");
    expect(byId.get("sf1")!.round).toBe("sf");
    expect(byId.get("champ")!.round).toBe("final");
    expect(byId.get("g1")!.slotStart).toBe("2025-06-27T09:45:00"); // Z stripped
  });

  it("classifies Play-in games as bracket games, not round robin", () => {
    const schedule = JSON.stringify({
      Games: [
        { GameID: "pi1", HomeTeamName: "Eastern", HomeTeamCode: "Eastern", AwayTeamName: "Suburban", AwayTeamCode: "Suburban", HomeTeamScore: 0, AwayTeamScore: 0, Status: "SCHEDULED", Date: "2026-07-31T12:00:00Z", Time: "12:00 PM", Description: "Play-in 1" },
      ],
    });
    const { dataset, summary } = importApiData(schedule, null);
    expect(dataset.games[0].round).toBe("qf");
    expect(summary.roundRobinGames).toBe(0);
    expect(summary.playoffGames).toBe(1);
  });

  it("combines a date-only Date with the 12-hour Time field, per the API docs", () => {
    const schedule = JSON.stringify({
      Games: [
        { GameID: "g1", HomeTeamName: "Teal", HomeTeamCode: "TEAL", AwayTeamName: "Gold", AwayTeamCode: "GOLD", HomeTeamScore: null, AwayTeamScore: null, Status: "SCHEDULED", Date: "2026-07-31", Time: "04:40 PM", Description: "Game 1" },
        { GameID: "g2", HomeTeamName: "Teal", HomeTeamCode: "TEAL", AwayTeamName: "Gold", AwayTeamCode: "GOLD", HomeTeamScore: null, AwayTeamScore: null, Status: "SCHEDULED", Date: "2026-08-01", Time: "9:05 AM", Description: "Game 2" },
        { GameID: "g3", HomeTeamName: "Teal", HomeTeamCode: "TEAL", AwayTeamName: "Gold", AwayTeamCode: "GOLD", HomeTeamScore: null, AwayTeamScore: null, Status: "SCHEDULED", Date: "2026-08-01", Time: "16:40:00", Description: "Game 3" },
      ],
    });
    const { dataset } = importApiData(schedule, null);
    const byId = new Map(dataset.games.map((g) => [g.id, g]));
    expect(byId.get("g1")!.slotStart).toBe("2026-07-31T16:40:00");
    expect(byId.get("g2")!.slotStart).toBe("2026-08-01T09:05:00");
    expect(byId.get("g3")!.slotStart).toBe("2026-08-01T16:40:00");
  });

  it("assigns divisions when the teams JSON is provided", () => {
    const { dataset, summary } = importApiData(SCHEDULE, TEAMS);
    expect(summary.divisionsAssigned).toBe(true);
    const east = dataset.divisions.find((d) => d.name === "EAST")!;
    expect(east.teamIds).toContain("t-middlesex");
    expect(dataset.teams.find((t) => t.id === "t-middlesex")!.divisionId).toBe(east.id);
    expect(dataset.teams.find((t) => t.id === "t-middlesex")!.coach).toBe("R. Sullivan");
  });

  it("captures the API team id for roster sync", () => {
    const { dataset } = importApiData(SCHEDULE, TEAMS);
    expect(dataset.teams.find((t) => t.id === "t-middlesex")!.apiId).toBe("api-mid");
    expect(dataset.teams.find((t) => t.id === "t-metro")!.apiId).toBe("api-met");
  });
});

describe("premature scores (status is the only truth)", () => {
  const feed = JSON.stringify({
    Games: [
      { GameID: "g1", HomeTeamName: "Eastern", HomeTeamCode: "EAS", AwayTeamName: "Metro", AwayTeamCode: "MET", HomeTeamScore: 4, AwayTeamScore: 2, Status: "FINAL", Date: "2026-06-26T10:00:00Z", Description: "Game 1" },
      // The bad row: a goal entered while the game is still SCHEDULED.
      { GameID: "g2", HomeTeamName: "NE Connecticut", HomeTeamCode: "NEC", AwayTeamName: "Eastern", AwayTeamCode: "EAS", HomeTeamScore: 1, AwayTeamScore: 0, Status: "SCHEDULED", Date: "2026-06-29T16:20:00Z", Description: "Game 45" },
      // Feed idle default for unplayed games: 0-0. Not a warning.
      { GameID: "g3", HomeTeamName: "Metro", HomeTeamCode: "MET", AwayTeamName: "NE Connecticut", AwayTeamCode: "NEC", HomeTeamScore: 0, AwayTeamScore: 0, Status: "SCHEDULED", Date: "2026-06-29T18:00:00Z", Description: "Game 46" },
      // In progress with a live score: remaining, warned, score ignored.
      { GameID: "g4", HomeTeamName: "Eastern", HomeTeamCode: "EAS", AwayTeamName: "NE Connecticut", AwayTeamCode: "NEC", HomeTeamScore: 2, AwayTeamScore: 1, Status: "IN PROGRESS", Date: "2026-06-29T12:00:00Z", Description: "Game 44" },
    ],
  });

  it("imports non-final games with null scores no matter what the feed says", () => {
    const { dataset } = importApiData(feed, null);
    const byId = new Map(dataset.games.map((g) => [g.id, g]));
    expect(byId.get("g1")).toMatchObject({ status: "final", homeScore: 4, awayScore: 2 });
    expect(byId.get("g2")).toMatchObject({ status: "scheduled", homeScore: null, awayScore: null });
    expect(byId.get("g3")).toMatchObject({ status: "scheduled", homeScore: null, awayScore: null });
    expect(byId.get("g4")).toMatchObject({ status: "scheduled", homeScore: null, awayScore: null });
  });

  it("warns loudly for a score on a non-final game, and stays quiet for 0-0", () => {
    const { summary } = importApiData(feed, null);
    const dataWarnings = summary.warnings.filter((w) => w.startsWith("DATA WARNING"));
    expect(dataWarnings.some((w) => w.includes("Game 45") && w.includes("1-0") && w.includes("SCHEDULED"))).toBe(true);
    expect(dataWarnings.some((w) => w.includes("Game 44") && w.includes("IN PROGRESS"))).toBe(true);
    expect(dataWarnings.some((w) => w.includes("Game 46"))).toBe(false);
  });
});
