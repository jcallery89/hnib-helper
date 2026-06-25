import { describe, expect, it } from "vitest";
import { parseLeaders, parsePlayerProfile, parseTeamRoster } from "../../src/io/importApiPlayers.ts";

// Shapes per the Tourno OpenAPI spec (/team/{id} and /leaders/{eventId}).
const TEAM = JSON.stringify({
  ID: "api-team-1",
  Name: "Middlesex",
  Players: [
    { ID: "u-jack", FirstName: "Jack", LastName: "Sullivan", Number: 9, Height: "5'6\"", Shot: "Left", Position: "Forward", BirthYear: "2011", Hometown: "Andover, MA" },
    { ID: "u-brady", FirstName: "Brady", LastName: "Olsen", Number: 1, Height: "5'4\"", Shot: "L", Position: "Goalie", SchoolYear: "2030" },
    { ID: null, FirstName: "No", LastName: "Stats", Number: 22, Position: "D" },
  ],
  BoxPlayers: [
    { ID: "u-jack", Name: "Jack Sullivan", Number: 9, Position: "F", Goals: 8, Assists: 6, Points: 14, Shots: 30, Saves: 0, GP: 7 },
    { ID: "u-brady", Name: "Brady Olsen", Number: 1, Position: "G", Goals: 0, Assists: 0, Points: 0, Shots: 130, Saves: 121, GP: 7, SVPCT: 0.93, GAA: 1.29 },
  ],
});

describe("parseTeamRoster", () => {
  const { players, stats, warnings } = parseTeamRoster(TEAM, "t-mid", "ev-1");

  it("maps roster bio fields onto Player", () => {
    const jack = players.find((p) => p.id === "u-jack")!;
    expect(jack).toMatchObject({
      teamId: "t-mid",
      jersey: 9,
      firstName: "Jack",
      lastName: "Sullivan",
      position: "F",
      birthYear: 2011,
      shoots: "L",
      heightInches: 66,
      hometown: "Andover, MA",
    });
    // Player without an API id gets a stable derived id.
    expect(players.find((p) => p.jersey === 22)!.id).toBe("p-t-mid-22");
    expect(warnings).toEqual([]);
  });

  it("joins box stats by API id and derives goalie goals against", () => {
    const jackLine = stats.find((s) => s.playerId === "u-jack")!;
    expect(jackLine).toMatchObject({ gp: 7, goals: 8, assists: 6 });
    expect(jackLine.goalsAgainst).toBeUndefined(); // skaters get no goalie fields

    const bradyLine = stats.find((s) => s.playerId === "u-brady")!;
    expect(bradyLine).toMatchObject({ gp: 7, saves: 121, shots: 130, goalsAgainst: 9 });
  });
});

const LEADERS = JSON.stringify({
  Points: [
    { PlayerID: "u-jack", FirstName: "Jack", LastName: "Sullivan", Number: "9", Position: "F", Team: "Middlesex", Points: 14, Goals: 8, Assists: 6 },
    { PlayerID: "u-liam", FirstName: "Liam", LastName: "Doyle", Number: "10", Position: "F", Team: "Middlesex", Points: 13 },
  ],
  Goals: [{ PlayerID: "u-jack", FirstName: "Jack", LastName: "Sullivan", Number: "9", Position: "F", Team: "Middlesex", Goals: 8 }],
  Assists: [],
  PIM: [{ PlayerID: "u-ty", FirstName: "Tyler", LastName: "Nguyen", Number: "8", Position: "D", Team: "Middlesex", Pim: 8 }],
  GAA: [{ PlayerID: "u-brady", FirstName: "Brady", LastName: "Olsen", Number: "1", Position: "G", Team: "Middlesex", Gaa: 1.29 }],
  SavePct: [{ PlayerID: "u-brady", FirstName: "Brady", LastName: "Olsen", Number: "1", Position: "G", Team: "Middlesex", SavePct: 0.931 }],
});

describe("parseLeaders", () => {
  const leaders = parseLeaders(LEADERS);

  it("maps each category and picks the right value", () => {
    expect(leaders.points[0]).toMatchObject({ playerId: "u-jack", lastName: "Sullivan", value: 14 });
    expect(leaders.goals[0].value).toBe(8);
    expect(leaders.assists).toEqual([]);
    expect(leaders.pim[0].value).toBe(8);
    expect(leaders.gaa[0].value).toBe(1.29);
    expect(leaders.savePct[0].value).toBe(0.931);
  });

  it("survives malformed input", () => {
    const empty = parseLeaders("not json");
    expect(empty.points).toEqual([]);
  });
});

describe("parsePlayerProfile", () => {
  it("maps the per-opponent stat lines into a game log", () => {
    const json = JSON.stringify({
      Player: { ID: "u-jack", FirstName: "Jack", LastName: "Sullivan" },
      Stats: [
        { Opponent: "Northeast", Goals: 2, Assists: 1, Points: 3, PIM: 0, Shots: 6, Saves: 0 },
        { Opponent: "Essex", Goals: 3, Assists: 2, PIM: 2, Shots: 8, Saves: 0 },
      ],
      Schedule: [],
    });
    const log = parsePlayerProfile(json);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ opponent: "Northeast", goals: 2, assists: 1, points: 3 });
    // Points derived from G+A when the API omits it.
    expect(log[1].points).toBe(5);
  });

  it("returns an empty log for malformed or statless profiles", () => {
    expect(parsePlayerProfile("not json")).toEqual([]);
    expect(parsePlayerProfile('{"Player":{}}')).toEqual([]);
  });
});
