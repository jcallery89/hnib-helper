import { describe, expect, it } from "vitest";
import {
  buildBallotRoster,
  ballotRosterCsv,
  ballotRosterSql,
  defaultBallotTable,
} from "../src/io/ballotExport.ts";
import { summarizePlayers } from "../src/engine/players/summary.ts";
import type { Dataset } from "../src/io/dataset.ts";
import type { HnibEvent, Player, PlayerStatLine, PlayerSummary } from "../src/engine/types.ts";

const event: HnibEvent = {
  id: "e1",
  name: "Sophomore Festival",
  year: 2026,
  venues: [],
  format: "festival",
  hasPlayoffBracket: true,
  seedingRule: "soph_division_winners",
  pointSystem: { win: 2, tie: 1, loss: 0 },
};

const players: Player[] = [
  { id: "p1", eventId: "e1", teamId: "tA", jersey: 12, firstName: "Jane", lastName: "Smith", position: "F" },
  { id: "p2", eventId: "e1", teamId: "tA", jersey: 3, firstName: "Bob", lastName: "Jones", position: "D" },
  { id: "p3", eventId: "e1", teamId: "tB", jersey: 31, firstName: "Pat", lastName: "Lee", position: "G" },
  { id: "p4", eventId: "e1", teamId: "tA", jersey: null, firstName: "No", lastName: "Number", position: "F" },
];

const stats: PlayerStatLine[] = [
  { playerId: "p1", gameId: "g1", goals: 2, assists: 3 },
  { playerId: "p1", gameId: "g2", goals: 1, assists: 2 },
  { playerId: "p2", gameId: "g1", goals: 0, assists: 1 },
  { playerId: "p3", gameId: null, gp: 2, goals: 0, assists: 0, saves: 46, goalsAgainst: 4, shots: 50 },
];

const dataset: Dataset = {
  event,
  divisions: [],
  teams: [
    { id: "tA", eventId: "e1", divisionId: "d1", name: "Coastal" },
    { id: "tB", eventId: "e1", divisionId: "d1", name: "Bay State" },
  ],
  games: [],
  players,
  playerStats: stats,
};

function summaries(): Map<string, PlayerSummary> {
  return new Map(summarizePlayers(players, stats).map((s) => [s.playerId, s]));
}

describe("buildBallotRoster", () => {
  it("emits one row per player with name, jersey, position and stats", () => {
    const rows = buildBallotRoster(dataset, summaries());
    expect(rows).toHaveLength(4);
    const jane = rows.find((r) => r.player_id === "p1")!;
    expect(jane).toMatchObject({
      team_name: "Coastal",
      player_name: "Jane Smith",
      jersey: 12,
      position: "F",
      gp: 2, g: 3, a: 5, pts: 8,
    });
    expect(jane.display).toBe("#12 Jane Smith - 2GP 3G 5A 8P");
  });

  it("formats goalie rows with GAA and SV%, omitting GP from the label", () => {
    const goalie = buildBallotRoster(dataset, summaries()).find((r) => r.player_id === "p3")!;
    expect(goalie.position).toBe("G");
    expect(goalie.gaa).toBe("2.00"); // 4 GA / 2 GP
    expect(goalie.svpct).toBe(".920"); // 46 / 50, leading zero stripped
    expect(goalie.display).toBe("#31 Pat Lee - 2.00GAA .920SV%");
  });

  it("rounds a fractional goalie GP (Tourno split-start share) for the column", () => {
    const ds: Dataset = {
      ...dataset,
      players: [{ id: "g9", eventId: "e1", teamId: "tB", jersey: 40, firstName: "Split", lastName: "Start", position: "G" }],
      playerStats: [{ playerId: "g9", gameId: null, gp: 0.333, goals: 0, assists: 0, saves: 6, goalsAgainst: 3, shots: 9, gaa: 9.01, savePct: 0.67 }],
    };
    const row = buildBallotRoster(ds, new Map(summarizePlayers(ds.players!, ds.playerStats!).map((s) => [s.playerId, s])))[0];
    expect(row.gp).toBe(0); // 0.333 rounded - lands cleanly in the INT column
    expect(row.display).toBe("#40 Split Start - 9.01GAA .670SV%"); // no fractional GP in the label
  });

  it("leaves a missing jersey blank rather than 0", () => {
    const row = buildBallotRoster(dataset, summaries()).find((r) => r.player_id === "p4")!;
    expect(row.jersey).toBeNull();
    expect(row.display).toBe("No Number - 0GP 0G 0A 0P");
  });

  it("sorts by team then jersey so output is stable", () => {
    const rows = buildBallotRoster(dataset, summaries());
    expect(rows.map((r) => r.player_id)).toEqual(["p3", "p2", "p1", "p4"]);
  });
});

describe("ballotRosterCsv", () => {
  it("has a header and one line per player", () => {
    const csv = ballotRosterCsv(buildBallotRoster(dataset, summaries()));
    const lines = csv.split("\n");
    expect(lines[0]).toBe("player_id,team_name,player_name,jersey,position,gp,g,a,pts,gaa,svpct,display");
    expect(lines).toHaveLength(5);
  });

  it("quotes cells that contain commas or hyphenated displays safely", () => {
    const csv = ballotRosterCsv(buildBallotRoster(dataset, summaries()));
    // the display column contains a hyphen and spaces but no comma, so it stays unquoted
    expect(csv).toContain("#12 Jane Smith - 2GP 3G 5A 8P");
  });
});

describe("ballotRosterSql", () => {
  it("drops, recreates and inserts every row", () => {
    const sql = ballotRosterSql(buildBallotRoster(dataset, summaries()), "gf_soph_rosters");
    expect(sql).toContain("DROP TABLE IF EXISTS `gf_soph_rosters`;");
    expect(sql).toContain("CREATE TABLE `gf_soph_rosters`");
    expect(sql).toContain("INSERT INTO `gf_soph_rosters`");
    expect((sql.match(/\(\s*'p\d'/g) ?? [])).toHaveLength(4);
  });

  it("declares jersey as INT and emits it unquoted so the ballot can sort numerically", () => {
    const sql = ballotRosterSql(buildBallotRoster(dataset, summaries()), "gf_soph_rosters");
    expect(sql).toContain("`jersey` INT");
    expect(sql).toContain("'Jane Smith', 12,"); // jersey 12 is a bare number, not '12'
  });

  it("escapes single quotes in names", () => {
    const ds: Dataset = {
      ...dataset,
      players: [{ id: "p9", eventId: "e1", teamId: "tA", jersey: 7, firstName: "Sha'Carri", lastName: "O'Neil", position: "F" }],
      playerStats: [],
    };
    const sql = ballotRosterSql(buildBallotRoster(ds, new Map()), "t");
    expect(sql).toContain("'Sha''Carri O''Neil'");
  });

  it("sanitizes the table name", () => {
    const sql = ballotRosterSql([], "gf_soph; DROP TABLE x");
    expect(sql).toContain("`gf_sophDROPTABLEx`");
    expect(sql).not.toContain("DROP TABLE x;");
  });
});

describe("defaultBallotTable", () => {
  it("maps event names to a source table", () => {
    expect(defaultBallotTable(event)).toBe("gf_soph_rosters");
    expect(defaultBallotTable({ ...event, name: "Jr. High Festival" })).toBe("gf_jrhigh_rosters");
    expect(defaultBallotTable({ ...event, name: "Bantam Major" })).toBe("gf_bantam_major_rosters");
  });
});
