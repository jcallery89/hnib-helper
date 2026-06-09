import { describe, expect, it } from "vitest";
import { parseSchedule } from "../src/io/importSchedule.ts";

const PASTE = `logo Schedule 2025 Jr. High Festival
Game #1 - June 27, 2025 - 09:45 AM (WIC-MGH)FINAL
Middlesex 4
 vs
1 Northeast
Game #2 - June 27, 2025 - 10:00 AM (WIC-LAM)FINAL
Bay State 8
 vs
6 Essex
Game #3 - June 27, 2025 - 03:00 PM (WIC-MGH)FINAL
Western 10
 vs
2 Metropolitan
Game #4 - June 27, 2025 - 03:15 PM (WIC-LAM)FINAL
Suburban 4
 vs
7 Atlantic
Game #5 - June 28, 2025 - 08:00 AM (WIC-MGH)FINAL
Northeast 3
 vs
3 Coastal
Game #6 - June 28, 2025 - 08:10 AM (WIC-LAM)FINAL
Metropolitan 3
 vs
0 Suburban
Game #7 - June 28, 2025 - 09:40 AM (WIC-MGH)FINAL
Middlesex 12
 vs
1 Essex
Game #8 - June 28, 2025 - 09:50 AM (WIC-LAM)FINAL
Western 5
 vs
3 Atlantic
Game #9 - June 28, 2025 - 02:40 PM (WIC-MGH)FINAL
Bay State 3
 vs
1 Coastal
Game #10 - June 29, 2025 - 01:00 PM (WIC-MGH)FINAL
Bay State 2
 vs
6 Atlantic
Game #11 - June 29, 2025 - 01:10 PM (WIC-LAM)FINAL
Essex 5
 vs
1 Coastal
Game #12 - June 29, 2025 - 02:40 PM (WIC-MGH)FINAL
Middlesex 1
 vs
1 Western
Game #13 - June 29, 2025 - 02:50 PM (WIC-LAM)FINAL
Northeast 6
 vs
1 Metropolitan
Game #14 - June 29, 2025 - 06:10 PM (WIC-LAM)FINAL
Bay State 5
 vs
2 Suburban
Game #15 - June 30, 2025 - 08:00 AM (WIC-MGH)FINAL
Coastal 6
 vs
0 Metropolitan
Game #16 - June 30, 2025 - 08:10 AM (WIC-LAM)FINAL
Northeast 5
 vs
2 Western
Game #17 - June 30, 2025 - 09:40 AM (WIC-MGH)FINAL
Suburban 3
 vs
6 Essex
Game #18 - June 30, 2025 - 09:50 AM (WIC-LAM)FINAL
Middlesex 4
 vs
2 Atlantic
Game #19 - June 30, 2025 - 04:00 PM (WIC-MGH)FINAL
Middlesex 7
 vs
0 Metropolitan
Game #20 - June 30, 2025 - 04:10 PM (WIC-LAM)FINAL
Western 5
 vs
1 Coastal
Game #21 - June 30, 2025 - 05:00 PM (WIC-MGH)FINAL
Bay State 3
 vs
1 Essex
Game #22 - June 30, 2025 - 05:10 PM (WIC-LAM)FINAL
Northeast 2
 vs
1 Atlantic
Game #23 - July 1, 2025 - 08:00 AM (WIC-MGH)FINAL
Western 2
 vs
2 Bay State
Game #24 - July 1, 2025 - 08:10 AM (WIC-LAM)FINAL
Middlesex 3
 vs
2 Northeast
Game #25 - July 1, 2025 - 10:00 AM (WIC-MGH)FINAL
Middlesex 3
 vs
0 Bay State
Game #26 - July 1, 2025 - 12:30 PM (WIC-MGH)SCHEDULED
Orange All-Stars -
 vs
- White All-Stars`;

describe("parseSchedule (hnib.app paste)", () => {
  const { dataset, summary } = parseSchedule(PASTE);

  it("extracts the event name and counts games", () => {
    expect(summary.eventName).toBe("2025 Jr. High Festival");
    expect(summary.teamCount).toBe(9); // All-Star teams excluded
    expect(summary.roundRobinGames).toBe(18);
    expect(summary.playoffGames).toBe(7);
    expect(summary.skippedAllStar).toBe(1);
  });

  it("parses a game's teams, score, time, and round", () => {
    const g1 = dataset.games.find((g) => g.id === "g1")!;
    expect(g1.homeTeamId).toBe("middlesex");
    expect(g1.awayTeamId).toBe("northeast");
    expect(g1.homeScore).toBe(4);
    expect(g1.awayScore).toBe(1);
    expect(g1.round).toBe("rr");
    expect(g1.status).toBe("final");
    expect(g1.slotStart).toBe("2025-06-27T09:45:00");
  });

  it("marks post-round-robin games as playoffs", () => {
    const g19 = dataset.games.find((g) => g.id === "g19")!;
    expect(g19.round).toBe("qf");
    expect(g19.slotStart).toBe("2025-06-30T16:00:00");
  });
});
