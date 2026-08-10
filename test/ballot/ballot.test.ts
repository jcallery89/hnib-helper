import { describe, expect, it } from "vitest";
import {
  ballotPosition,
  countInvites,
  compareProduction,
  emptyBallot,
  positionLabel,
} from "../../src/engine/ballot/ballot.ts";
import type { Player, PlayerSummary } from "../../src/engine/types.ts";

function player(overrides: Partial<Player>): Player {
  return { id: "p", eventId: "e", teamId: "t", jersey: 9, firstName: "Jack", lastName: "Sullivan", ...overrides };
}

function summary(overrides: Partial<PlayerSummary>): PlayerSummary {
  return { playerId: "p", gp: 4, goals: 0, assists: 0, points: 0, pim: 0, isGoalie: false, ...overrides };
}

describe("emptyBallot", () => {
  it("starts with nothing marked", () => {
    expect(emptyBallot()).toEqual({});
  });
});

describe("ballotPosition", () => {
  it("uses the roster position when present", () => {
    expect(ballotPosition(player({ position: "D" }))).toBe("D");
    expect(ballotPosition(player({ position: "G" }))).toBe("G");
    expect(ballotPosition(player({ position: "F" }))).toBe("F");
  });

  it("classifies a blank-position goalie by stats instead of dropping it", () => {
    expect(ballotPosition(player({}), summary({ isGoalie: true }))).toBe("G");
  });

  it("defaults blank positions to forward", () => {
    expect(ballotPosition(player({}))).toBe("F");
  });
});

describe("compareProduction", () => {
  it("sorts skaters by points then goals", () => {
    const a = summary({ points: 5, goals: 1 });
    const b = summary({ points: 5, goals: 3 });
    const c = summary({ points: 7, goals: 0 });
    expect([a, b, c].sort((x, y) => compareProduction(x, y, "F"))[0]).toBe(c);
    expect([a, b].sort((x, y) => compareProduction(x, y, "F"))[0]).toBe(b);
  });

  it("sorts goalies by save percentage then GAA", () => {
    const a = summary({ isGoalie: true, savePct: 0.9, gaa: 2.5 });
    const b = summary({ isGoalie: true, savePct: 0.92, gaa: 3.0 });
    const sameSv = summary({ isGoalie: true, savePct: 0.9, gaa: 2.0 });
    expect([a, b].sort((x, y) => compareProduction(x, y, "G"))[0]).toBe(b);
    expect([a, sameSv].sort((x, y) => compareProduction(x, y, "G"))[0]).toBe(sameSv);
  });

  it("treats missing summaries as the bottom of the section", () => {
    const s = summary({ points: 1 });
    expect(compareProduction(undefined, s, "F")).toBeGreaterThan(0);
    expect(compareProduction(undefined, s, "G")).toBeGreaterThan(0);
  });
});

describe("positionLabel", () => {
  it("labels the three sections", () => {
    expect(positionLabel("F")).toBe("Forwards");
    expect(positionLabel("D")).toBe("Defense");
    expect(positionLabel("G")).toBe("Goaltenders");
  });
});

describe("countInvites", () => {
  const ballot = {
    invites: { a: "yes", b: "invited", c: "invited", d: "no", e: "yes" },
    targets: { F: 3, D: 2, G: 1 },
  } as const;

  it("tallies confirmed, pending, and declined against the position target", () => {
    const c = countInvites(ballot, ["a", "b", "c", "d", "e"], "F");
    expect(c).toMatchObject({ confirmed: 2, pending: 2, declined: 1, target: 3, over: 1 });
  });

  it("reports no overage without a target", () => {
    const c = countInvites({ invites: ballot.invites }, ["a", "b", "c"], "F");
    expect(c.target).toBeNull();
    expect(c.over).toBe(0);
  });

  it("only counts the ids it is given", () => {
    const c = countInvites(ballot, ["a"], "G");
    expect(c).toMatchObject({ confirmed: 1, pending: 0, target: 1, over: 0 });
  });
});
