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
