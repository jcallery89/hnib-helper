import { describe, expect, it } from "vitest";
import { extractPlayoffSlots } from "../src/io/importPlayoffApi.ts";

// Trimmed from a live hnib.app /schedule feed (6-team Jr. High bracket): a few
// round-robin games (real teams), the two play-ins, two semis, the unlabeled
// championship ("Game 21"), and the later All-Star game ("Game 22").
const FEED = JSON.stringify({
  Games: [
    { Description: "Game 1", HomeTeamCode: "Eastern", AwayTeamCode: "Suburban", Status: "FINAL", Date: "2026-06-26T11:30:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Game 16", HomeTeamCode: "Middlesex", AwayTeamCode: "Northeast", Status: "FINAL", Date: "2026-06-28T18:10:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
    { Description: "Play-in 1", HomeTeamCode: "Atlantic", AwayTeamCode: "Bay State", Status: "SCHEDULED", Date: "2026-06-29T10:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Play-in 2", HomeTeamCode: "Eastern", AwayTeamCode: "Metro", Status: "SCHEDULED", Date: "2026-06-29T10:10:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
    { Description: "Semi-Final 1", HomeTeamCode: "Western", AwayTeamCode: "", AwayTeamPlaceholder: "Winner of Play-in 1", Status: "SCHEDULED", Date: "2026-06-29T12:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Semi-Final 2", HomeTeamCode: "Northeast", AwayTeamCode: "", AwayTeamPlaceholder: "Winner of Play-in 2", Status: "SCHEDULED", Date: "2026-06-29T12:10:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
    { Description: "Game 21", HomeTeamCode: "", AwayTeamCode: "", Status: "SCHEDULED", Date: "2026-06-29T14:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Game 22", HomeTeamCode: "", AwayTeamCode: "", Status: "SCHEDULED", Date: "2026-06-29T15:30:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
  ],
});

describe("extractPlayoffSlots", () => {
  it("maps the live 6-team feed to bracket cells with short rinks", () => {
    const { byCell } = extractPlayoffSlots(FEED, 6);
    expect(byCell.qf1).toEqual({ slotStart: "2026-06-29T10:00:00", rink: "Lamacchia", gameNumber: 1 });
    expect(byCell.qf2).toMatchObject({ slotStart: "2026-06-29T10:10:00", rink: "MGH" });
    expect(byCell.sf1).toMatchObject({ slotStart: "2026-06-29T12:00:00", rink: "Lamacchia" });
    expect(byCell.sf2).toMatchObject({ slotStart: "2026-06-29T12:10:00", rink: "MGH" });
    // The championship is the earliest empty-team game; the All-Star (15:30) is ignored.
    expect(byCell.final).toMatchObject({ slotStart: "2026-06-29T14:00:00", rink: "Lamacchia" });
  });

  it("does not mistake round-robin games for the final", () => {
    const { byCell } = extractPlayoffSlots(FEED, 6);
    // Final is the 2:00 PM slot, not any 'Game N' round-robin game.
    expect(byCell.final?.slotStart).toBe("2026-06-29T14:00:00");
    // No stray cells beyond a 6-team field.
    expect(Object.keys(byCell).sort()).toEqual(["final", "qf1", "qf2", "sf1", "sf2"]);
  });
});

// The 2026 Boys Major feed (observed live): quarterfinals labeled "Playoff N"
// in ICE-TIME order with real seeded teams ("Playoff 1" was the 3v6 game),
// semifinals "SemiFinal N", an explicit "Championship", then the All-Star.
const BOYS_MAJOR_FEED = JSON.stringify({
  Games: [
    { Description: "Game 30", HomeTeamCode: "Central/West", AwayTeamCode: "CT/Mid-Atlantic", Status: "FINAL", Date: "2026-08-01T16:50:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
    { Description: "Playoff 1", HomeTeamCode: "New England", AwayTeamCode: "Southern NE", Status: "SCHEDULED", Date: "2026-08-02T08:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Playoff 2", HomeTeamCode: "National", AwayTeamCode: "Greater Boston", Status: "SCHEDULED", Date: "2026-08-02T08:10:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
    { Description: "Playoff 3", HomeTeamCode: "Western Mass", AwayTeamCode: "North Shore", Status: "SCHEDULED", Date: "2026-08-02T09:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Playoff 4", HomeTeamCode: "Middlesex", AwayTeamCode: "South Shore", Status: "SCHEDULED", Date: "2026-08-02T09:10:00Z", Location: "Worcester Ice Center - MGH", LocationCode: "WIC-MGH" },
    { Description: "SemiFinal 1", HomeTeamCode: "", AwayTeamCode: "", Status: "SCHEDULED", Date: "2026-08-02T10:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "SemiFinal 2", HomeTeamCode: "", AwayTeamCode: "", Status: "SCHEDULED", Date: "2026-08-02T11:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "Championship", HomeTeamCode: "", AwayTeamCode: "", Status: "SCHEDULED", Date: "2026-08-02T13:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
    { Description: "All-Star Game", HomeTeamCode: "", AwayTeamCode: "", Status: "SCHEDULED", Date: "2026-08-02T15:00:00Z", Location: "Worcester Ice Center - Lamacchia", LocationCode: "WIC-LAM" },
  ],
});

const BOYS_MAJOR_PAIRS: Array<{ cellId: string; teams: [string, string] }> = [
  { cellId: "qf1", teams: ["Western Mass", "North Shore"] },
  { cellId: "qf2", teams: ["Middlesex", "South Shore"] },
  { cellId: "qf3", teams: ["National", "Greater Boston"] },
  { cellId: "qf4", teams: ["New England", "Southern NE"] },
];

describe("extractPlayoffSlots - Playoff N labels with real teams", () => {
  it("maps first-round games by seeded team pair, not by ice-time numbering", () => {
    const { byCell } = extractPlayoffSlots(BOYS_MAJOR_FEED, 8, { qfTeamPairs: BOYS_MAJOR_PAIRS });
    expect(byCell.qf1).toMatchObject({ slotStart: "2026-08-02T09:00:00", rink: "Lamacchia" });
    expect(byCell.qf2).toMatchObject({ slotStart: "2026-08-02T09:10:00", rink: "MGH" });
    expect(byCell.qf3).toMatchObject({ slotStart: "2026-08-02T08:10:00", rink: "MGH" });
    expect(byCell.qf4).toMatchObject({ slotStart: "2026-08-02T08:00:00", rink: "Lamacchia" });
    expect(byCell.sf1).toMatchObject({ slotStart: "2026-08-02T10:00:00", rink: "Lamacchia" });
    expect(byCell.sf2).toMatchObject({ slotStart: "2026-08-02T11:00:00" });
    expect(byCell.final).toMatchObject({ slotStart: "2026-08-02T13:00:00" });
    expect(Object.keys(byCell).sort()).toEqual(["final", "qf1", "qf2", "qf3", "qf4", "sf1", "sf2"]);
  });

  it("falls back to the trailing number when playoff teams are unknown", () => {
    const noPairs = extractPlayoffSlots(BOYS_MAJOR_FEED, 8).byCell;
    // Without the seeded pairs the number is the only signal - qf1 lands on
    // the 8:00 game. Imperfect, but times still appear.
    expect(noPairs.qf1).toMatchObject({ slotStart: "2026-08-02T08:00:00" });
    expect(noPairs.final).toMatchObject({ slotStart: "2026-08-02T13:00:00" });
  });

  it("never treats the All-Star game as the championship", () => {
    const { byCell } = extractPlayoffSlots(BOYS_MAJOR_FEED, 8, { qfTeamPairs: BOYS_MAJOR_PAIRS });
    expect(byCell.final?.slotStart).not.toBe("2026-08-02T15:00:00");
  });
});
