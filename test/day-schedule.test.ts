import { describe, expect, it } from "vitest";
import { parseDaySchedule, posterRowsFor, scheduleDays, dayLabel } from "../src/io/importDaySchedule.ts";

const SCHEDULE = [
  "Mon 6/29\t8:00 AM\tLamacchia\t43\tSoph 2nd\tSoph 7th\tSophomore",
  "Mon 6/29\t10:00 AM\tWorcester Ice Center - Lamacchia\t47\tJr High 4th\tJr High 5th\tJr. High",
  "Mon 6/29\t11:00 AM\tLamacchia\t49\tW 43\tW 44\tSophomore",
  "Mon 6/29\t12:00 PM\tLamacchia\t51\tJr High 1st\tW 47\tJr. High",
  "Mon 6/29\t1:00 PM\tLamacchia\t53\tSoph Championship\t\tSophomore",
  "Mon 6/29\t3:30 PM\tMGH\t56\tJr High All-Stars\t\tJr. High",
  "Sun 6/28\t6:00 PM\tLamacchia\t15\tWestern\tAtlantic\tJr. High",
].join("\n");

describe("day schedule poster", () => {
  const rows = parseDaySchedule(SCHEDULE, 2026);

  it("lists the distinct days with labels", () => {
    expect(scheduleDays(rows)).toEqual([
      { date: "2026-06-28", label: "Sunday, June 28" },
      { date: "2026-06-29", label: "Monday, June 29" },
    ]);
  });

  it("cleans matchups and infers phases for one day, in time order", () => {
    const poster = posterRowsFor(rows, "2026-06-29");
    expect(poster.map((r) => r.matchup)).toEqual([
      "2nd vs 7th",
      "4th vs 5th",
      "Winners of Games 43 & 44",
      "1st vs Winner of Game 47",
      "Championship Game",
      "All-Star Game",
    ]);
    expect(poster.map((r) => r.phase)).toEqual([
      "Quarterfinal",
      "Play-In",
      "Semifinal",
      "Semifinal",
      "Championship",
      "All-Star Game",
    ]);
    expect(poster.map((r) => r.eventKey)).toEqual(["soph", "jr", "soph", "jr", "soph", "jr"]);
  });

  it("shortens the long rink name", () => {
    const poster = posterRowsFor(rows, "2026-06-29");
    expect(poster[1].rink).toBe("Lamacchia"); // from "Worcester Ice Center - Lamacchia"
  });

  it("formats a day label", () => {
    expect(dayLabel("2026-06-29")).toBe("Monday, June 29");
  });
});
