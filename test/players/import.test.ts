import { describe, expect, it } from "vitest";
import { importRosterCsv, importPlayerStatsCsv } from "../../src/io/importPlayers.ts";
import type { Dataset } from "../../src/io/dataset.ts";
import { DEFAULT_POINT_SYSTEM } from "../../src/engine/pointSystem.ts";

function baseDataset(): Dataset {
  return {
    event: { id: "e", name: "Test", year: 2025, venues: [], format: "festival", hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { ...DEFAULT_POINT_SYSTEM } },
    divisions: [{ id: "d", eventId: "e", name: "D", teamIds: ["t-mid", "t-wes"] }],
    teams: [
      { id: "t-mid", eventId: "e", divisionId: "d", name: "Middlesex" },
      { id: "t-wes", eventId: "e", divisionId: "d", name: "Western" },
    ],
    games: [],
  };
}

describe("importRosterCsv", () => {
  it("matches teams by name and parses bio fields", () => {
    const csv = `Name,Team,Jersey,Position,Class,Height,Hometown
Jack Sullivan,Middlesex,9,F,2030,5'6",Andover MA
Brady Olsen,Middlesex,1,G,2030,5'4",Dracut MA
Ryan Walsh,Western,11,Defense,2029,68,Worcester MA`;
    const { players, warnings } = importRosterCsv(baseDataset(), csv);
    expect(players).toHaveLength(3);
    const jack = players.find((p) => p.id === "p-t-mid-9")!;
    expect(jack).toMatchObject({ firstName: "Jack", lastName: "Sullivan", teamId: "t-mid", jersey: 9, position: "F", classYear: 2030, heightInches: 66 });
    expect(players.find((p) => p.id === "p-t-wes-11")!.position).toBe("D");
    expect(warnings).toEqual([]);
  });

  it("flags teams it cannot find", () => {
    const csv = "Name,Team,Jersey\nSomeone,Nowhere,5";
    const { players, warnings } = importRosterCsv(baseDataset(), csv);
    expect(players).toHaveLength(0);
    expect(warnings.join(" ")).toContain("not found");
  });
});

describe("importPlayerStatsCsv", () => {
  it("matches stats to roster players by team and jersey, flagging the rest", () => {
    const data = baseDataset();
    const roster = importRosterCsv(data, "Name,Team,Jersey,Position\nJack Sullivan,Middlesex,9,F").players;
    data.players = roster;

    const csv = `Team,Jersey,G,A,PIM
Middlesex,9,8,6,2
Middlesex,99,1,1,0`;
    const { lines, matched, unmatched } = importPlayerStatsCsv(data, csv);
    expect(matched).toBe(1);
    expect(unmatched).toBe(1);
    expect(lines[0]).toMatchObject({ playerId: "p-t-mid-9", goals: 8, assists: 6, pim: 2 });
  });
});
