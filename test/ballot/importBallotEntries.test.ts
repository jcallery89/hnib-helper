import { describe, expect, it } from "vitest";
import { parseBallotEntries, parseCsvWithNewlines } from "../../src/io/importBallotEntries.ts";
import type { Player, Team } from "../../src/engine/types.ts";

const teams: Team[] = [
  { id: "t-co", eventId: "e", divisionId: "d", name: "Coastal" },
  { id: "t-ce", eventId: "e", divisionId: "d", name: "Central" },
  { id: "t-li", eventId: "e", divisionId: "d", name: "Long Island" },
];

function p(id: string, teamId: string, jersey: number, first: string, last: string, position?: Player["position"]): Player {
  return { id, eventId: "e", teamId, jersey, firstName: first, lastName: last, position };
}

const players: Player[] = [
  p("co13", "t-co", 13, "Mckenzie", "Lima-Tower", "F"),
  p("co6", "t-co", 6, "Claire", "Griffith", "D"),
  p("co1", "t-co", 1, "Vivienne", "Melo", "G"),
  p("ce17", "t-ce", 17, "Reese", "Weaver", "F"),
  p("ce15", "t-ce", 15, "Abby", "Tredo", "D"),
  p("li10", "t-li", 10, "Emma", "Hagens", "F"),
];

// Mirrors the real Gravity Forms entries export, including a quoted note
// with embedded line breaks (the case that breaks line-based parsers).
const CSV = [
  `Coach's Name,Cell #,Team,#1 Forward,#2 Forward,#3 Forward,#1 Defenseman,#2 Defenseman,#1 Goalie,Important Notes`,
  `Chuck Costello,2157647386,Coastal,"#13 Mckenzie Lima-Tower - Coastal (GP 2, 2g 0a 2pts)",,,"#6 Claire Griffith - Coastal (GP 2, 0g 1a 1pts)",,"#1 Vivienne Melo - Coastal (GP 1, 3.00 GAA, .910 SV%)",`,
  `Matt Poulin,2075764449,Central,"#17 Reese Weaver - Central (GP 2, 1g 0a 1pts)",,,"#15 Abby Tredo - Central (GP 2, 0g 0a 0pts)",,,"Tredo is D, not forward.`,
  ``,
  `Two primary nominations."`,
  `Bret Erster,6462621826,Long Island,"#10 Emma Hagens - Long Island (GP 2, 6g 1a 7pts)",,,,,,"Can you add Ilya Thomas please FW`,
  `Thanks"`,
].join("\n");

describe("parseCsvWithNewlines", () => {
  it("keeps quoted line breaks inside one cell", () => {
    const rows = parseCsvWithNewlines(CSV);
    expect(rows).toHaveLength(4); // header + 3 ballots
    expect(rows[2][9]).toContain("Two primary nominations.");
    expect(rows[3][9]).toContain("Thanks");
  });
});

describe("parseBallotEntries", () => {
  it("marks every resolvable pick nominated and counts ballots", () => {
    const res = parseBallotEntries(CSV, players, teams);
    expect(res.ballots).toBe(3);
    expect(res.matched).toBe(6);
    expect(new Set(res.nominatedIds)).toEqual(new Set(["co13", "co6", "co1", "ce17", "ce15", "li10"]));
    expect(res.unmatched).toHaveLength(0);
  });

  it("surfaces coach notes with their team and coach", () => {
    const res = parseBallotEntries(CSV, players, teams);
    expect(res.notes).toHaveLength(2);
    expect(res.notes[0]).toMatchObject({ team: "Central", coach: "Matt Poulin" });
    expect(res.notes[1].note).toContain("Ilya Thomas");
  });

  it("reports a pick it cannot match instead of guessing", () => {
    const csv = [
      `Coach's Name,Cell #,Team,#1 Forward,#2 Forward,#3 Forward,#1 Defenseman,#2 Defenseman,#1 Goalie,Important Notes`,
      `Coach,555,Coastal,"#99 Nobody Real - Coastal (GP 2, 0g 0a 0pts)",,,,,,`,
    ].join("\n");
    const res = parseBallotEntries(csv, players, teams);
    expect(res.matched).toBe(0);
    expect(res.unmatched[0].cell).toContain("Nobody Real");
  });

  it("refuses a jersey hit whose name disagrees, then matches by name", () => {
    // Jersey 13 on Coastal is Lima-Tower, but the pick names Griffith with
    // the wrong number: the name wins over the jersey.
    const csv = [
      `Coach's Name,Cell #,Team,#1 Forward,#2 Forward,#3 Forward,#1 Defenseman,#2 Defenseman,#1 Goalie,Important Notes`,
      `Coach,555,Coastal,"#13 Claire Griffith - Coastal (GP 2, 0g 1a 1pts)",,,,,,`,
    ].join("\n");
    const res = parseBallotEntries(csv, players, teams);
    expect(res.nominatedIds).toEqual(["co6"]);
  });

  it("accepts the stored-key format too", () => {
    const csv = [
      `Coach's Name,Cell #,Team,#1 Forward,#2 Forward,#3 Forward,#1 Defenseman,#2 Defenseman,#1 Goalie,Important Notes`,
      `Coach,555,Coastal,"Lima-Tower, Mckenzie (Coastal #13)",,,,,,`,
    ].join("\n");
    const res = parseBallotEntries(csv, players, teams);
    expect(res.nominatedIds).toEqual(["co13"]);
  });
});
