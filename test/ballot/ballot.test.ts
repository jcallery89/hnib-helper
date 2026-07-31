import { describe, expect, it } from "vitest";
import {
  type CoachBallot,
  aggregateBallots,
  ballotPosition,
  choiceLabel,
  compareBallotLines,
  compareProduction,
  emptyBallot,
  findDuplicateRanks,
} from "../../src/engine/ballot/ballot.ts";
import type { Player, PlayerSummary } from "../../src/engine/types.ts";

function coach(id: string, ranks: Record<string, number>): CoachBallot {
  return { id, coachName: `Coach ${id}`, ranks };
}

function player(id: string, position?: Player["position"]): Player {
  return { id, eventId: "e", teamId: "t", jersey: 9, firstName: "First", lastName: "Last", ...(position ? { position } : {}) };
}

function summary(overrides: Partial<PlayerSummary>): PlayerSummary {
  return { playerId: "p", isGoalie: false, gp: 4, goals: 0, assists: 0, points: 0, pim: 0, ...overrides };
}

describe("aggregateBallots", () => {
  it("averages ranks to one decimal and counts votes, like the spreadsheet", () => {
    const coaches = [coach("c1", { a: 1, b: 3 }), coach("c2", { a: 2 }), coach("c3", { a: 4, b: 3 })];
    const lines = aggregateBallots(coaches, ["a", "b", "c"]);
    expect(lines.get("a")).toEqual({ playerId: "a", avgRank: 2.3, votes: 3 });
    expect(lines.get("b")).toEqual({ playerId: "b", avgRank: 3, votes: 2 });
    expect(lines.get("c")).toEqual({ playerId: "c", avgRank: null, votes: 0 });
  });

  it("ignores non-positive ranks", () => {
    const lines = aggregateBallots([coach("c1", { a: 0, b: -2 })], ["a", "b"]);
    expect(lines.get("a")!.votes).toBe(0);
    expect(lines.get("b")!.votes).toBe(0);
  });
});

describe("compareBallotLines", () => {
  it("orders by average rank, then more votes, with unranked last", () => {
    const strong = { playerId: "a", avgRank: 1.5, votes: 2 };
    const weaker = { playerId: "b", avgRank: 3, votes: 3 };
    const sameAvgFewerVotes = { playerId: "c", avgRank: 1.5, votes: 1 };
    const unranked = { playerId: "d", avgRank: null, votes: 0 };
    const sorted = [unranked, weaker, sameAvgFewerVotes, strong].sort(compareBallotLines);
    expect(sorted.map((l) => l.playerId)).toEqual(["a", "c", "b", "d"]);
  });
});

describe("ballotPosition", () => {
  it("uses the roster position when present", () => {
    expect(ballotPosition(player("p", "D"))).toBe("D");
    expect(ballotPosition(player("p", "G"))).toBe("G");
    expect(ballotPosition(player("p", "F"))).toBe("F");
  });

  it("catches blank-position goalies via the summary", () => {
    expect(ballotPosition(player("p"), summary({ isGoalie: true }))).toBe("G");
  });

  it("defaults blank-position skaters to forward instead of dropping them", () => {
    expect(ballotPosition(player("p"), summary({}))).toBe("F");
  });
});

describe("compareProduction", () => {
  it("sorts skaters by points then goals", () => {
    const a = summary({ points: 8, goals: 5 });
    const b = summary({ points: 8, goals: 3 });
    const c = summary({ points: 10, goals: 1 });
    expect([a, b, c].sort((x, y) => compareProduction(x, y, "F")).map((s) => s.points + "-" + s.goals)).toEqual([
      "10-1", "8-5", "8-3",
    ]);
  });

  it("sorts goalies by save percentage then GAA, no-data goalies last", () => {
    const a = summary({ isGoalie: true, savePct: 0.92, gaa: 2.0 });
    const b = summary({ isGoalie: true, savePct: 0.92, gaa: 1.5 });
    const c = summary({ isGoalie: true });
    expect([a, c, b].sort((x, y) => compareProduction(x, y, "G"))).toEqual([b, a, c]);
  });
});

describe("findDuplicateRanks", () => {
  const groups = { F: ["f1", "f2", "f3"], D: ["d1", "d2"], G: ["g1"] };

  it("flags the same rank given twice within one position by one coach", () => {
    const dupes = findDuplicateRanks([coach("c1", { f1: 2, f2: 2, f3: 1 })], groups);
    expect(dupes).toEqual([{ coachId: "c1", position: "F", rank: 2, playerIds: ["f1", "f2"] }]);
  });

  it("allows the same rank number across positions and across coaches", () => {
    const coaches = [coach("c1", { f1: 1, d1: 1, g1: 1 }), coach("c2", { f1: 1 })];
    expect(findDuplicateRanks(coaches, groups)).toEqual([]);
  });
});

describe("choiceLabel", () => {
  it("formats a skater as Last, First - Team (GP-G-A-P)", () => {
    const p = { ...player("p", "F"), firstName: "Jack", lastName: "Sullivan" };
    const s = summary({ gp: 4, goals: 3, assists: 2, points: 5 });
    expect(choiceLabel(p, "Middlesex", s, "F")).toBe("Sullivan, Jack - Middlesex (4-3-2-5)");
  });

  it("formats a goalie with GAA and SV%", () => {
    const p = { ...player("p", "G"), firstName: "Brady", lastName: "Olsen" };
    const s = summary({ isGoalie: true, gp: 3, gaa: 2.15, savePct: 0.917 });
    expect(choiceLabel(p, "Northeast", s, "G")).toBe("Olsen, Brady - Northeast (3 GP, 2.15 GAA, .917 SV%)");
  });
});

describe("emptyBallot", () => {
  it("starts from the documented targets: 16 forwards, 10 defense, 3 goalies", () => {
    expect(emptyBallot().targets).toEqual({ F: 16, D: 10, G: 3 });
  });

  it("defaults the pool to every player in the event", () => {
    expect(emptyBallot().poolMode).toBe("event");
  });
});
