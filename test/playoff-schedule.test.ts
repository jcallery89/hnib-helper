import { describe, expect, it } from "vitest";
import { parsePlayoffSchedule } from "../src/io/importPlayoffSchedule.ts";

// The master schedule the operator pastes (tab-separated), both events mixed.
const SCHEDULE = [
  "Mon 6/29\t8:00 AM\tLamacchia\t43\tSoph 2nd\tSoph 7th\tSophomore",
  "Mon 6/29\t8:10 AM\tMGH\t44\tSoph 3rd\tSoph 6th\tSophomore",
  "Mon 6/29\t9:00 AM\tLamacchia\t45\tSoph 1st\tSoph 8th\tSophomore",
  "Mon 6/29\t9:10 AM\tMGH\t46\tSoph 4th\tSoph 5th\tSophomore",
  "Mon 6/29\t10:00 AM\tLamacchia\t47\tJr High 4th\tJr High 5th\tJr. High",
  "Mon 6/29\t10:10 AM\tMGH\t48\tJr High 3rd\tJr High 6th\tJr. High",
  "Mon 6/29\t11:00 AM\tLamacchia\t49\tW 43\tW 44\tSophomore",
  "Mon 6/29\t11:10 AM\tMGH\t50\tW 45\tW 46\tSophomore",
  "Mon 6/29\t12:00 PM\tLamacchia\t51\tJr High 1st\tW 47\tJr. High",
  "Mon 6/29\t12:10 PM\tMGH\t52\tJr High 2nd\tW 48\tJr. High",
  "Mon 6/29\t1:00 PM\tLamacchia\t53\tSoph Championship\t\tSophomore",
  "Mon 6/29\t2:00 PM\tLamacchia\t54\tJr High Championship\t\tJr. High",
  "Mon 6/29\t3:00 PM\tLamacchia\t55\tSoph All-Stars (East)\tSoph All-Stars (West)\tSophomore",
  "Mon 6/29\t3:30 PM\tMGH\t56\tJr High All-Stars\t\tJr. High",
  "Mon 6/29\t4:40 PM\tLamacchia\t57\tSoph All-Stars (North)\tSoph All-Stars (South)\tSophomore",
].join("\n");

describe("parsePlayoffSchedule", () => {
  it("maps the 8-team Sophomore games to the right bracket cells", () => {
    const { byCell, matched } = parsePlayoffSchedule(SCHEDULE, { fieldSize: 8, eventKeyword: "soph", year: 2026 });
    expect(matched).toBe(7); // 4 QF + 2 SF + final, All-Star excluded
    // QFs: 1v8 -> qf1, 4v5 -> qf2, 2v7 -> qf3, 3v6 -> qf4
    expect(byCell.qf1).toMatchObject({ gameNumber: 45, rink: "Lamacchia", slotStart: "2026-06-29T09:00:00" });
    expect(byCell.qf2.gameNumber).toBe(46);
    expect(byCell.qf3.gameNumber).toBe(43);
    expect(byCell.qf4.gameNumber).toBe(44);
    // SFs: W45/W46 feed sf1, W43/W44 feed sf2.
    expect(byCell.sf1.gameNumber).toBe(50);
    expect(byCell.sf2.gameNumber).toBe(49);
    expect(byCell.final).toMatchObject({ gameNumber: 53, slotStart: "2026-06-29T13:00:00" });
  });

  it("maps the 6-team Jr. High games, byes picking the semifinal", () => {
    const { byCell, matched } = parsePlayoffSchedule(SCHEDULE, { fieldSize: 6, eventKeyword: "jr", year: 2026 });
    expect(matched).toBe(5); // 2 play-ins + 2 SF + final
    expect(byCell.qf1.gameNumber).toBe(47); // 4v5
    expect(byCell.qf2.gameNumber).toBe(48); // 3v6
    expect(byCell.sf1).toMatchObject({ gameNumber: 51, slotStart: "2026-06-29T12:00:00" }); // seed 1 bye
    expect(byCell.sf2.gameNumber).toBe(52); // seed 2 bye
    expect(byCell.final.gameNumber).toBe(54);
  });

  it("ignores the other event's rows", () => {
    const soph = parsePlayoffSchedule(SCHEDULE, { fieldSize: 8, eventKeyword: "soph", year: 2026 });
    // No Jr. High game numbers leaked in.
    const nums = Object.values(soph.byCell).map((s) => s.gameNumber);
    expect(nums).not.toContain(47);
    expect(nums).not.toContain(54);
  });
});

describe("published listing format (Girls Major 12-team)", () => {
  // The schedule exactly as published for Sunday, August 9.
  const LISTING = [
    "Sunday, August 9 · Playoffs",
    "8:00 AM", "12th seed vs 5th seed", "Lamacchia",
    "8:10 AM", "11th seed vs 6th seed", "MGH",
    "9:00 AM", "9th seed vs 8th seed", "Lamacchia",
    "9:10 AM", "10th seed vs 7th seed", "MGH",
    "10:00 AM", "5/12 winner vs 4th seed", "Lamacchia",
    "10:10 AM", "6/11 winner vs 3rd seed", "MGH",
    "11:00 AM", "8/9 winner vs 1st seed", "Lamacchia",
    "11:10 AM", "7/10 winner vs 2nd seed", "MGH",
    "12:00 PM", "Semifinal", "Lamacchia",
    "12:10 PM", "Semifinal", "MGH",
    "1:30 PM", "CHAMPIONSHIP", "Lamacchia",
  ].join("\n");

  it("maps every game of the published day onto the 12-team bracket", () => {
    const { byCell, matched } = parsePlayoffSchedule(LISTING, { fieldSize: 12, eventKeyword: "", year: 2026 });
    expect(matched).toBe(11);
    // Round 1 by seed pair.
    expect(byCell.pr2).toMatchObject({ slotStart: "2026-08-09T08:00:00", rink: "Lamacchia" }); // 5v12
    expect(byCell.pr4).toMatchObject({ slotStart: "2026-08-09T08:10:00", rink: "MGH" }); // 6v11
    expect(byCell.pr1).toMatchObject({ slotStart: "2026-08-09T09:00:00", rink: "Lamacchia" }); // 8v9
    expect(byCell.pr3).toMatchObject({ slotStart: "2026-08-09T09:10:00", rink: "MGH" }); // 7v10
    // Bye quarterfinals by "x/y winner vs Nth seed".
    expect(byCell.qf2).toMatchObject({ slotStart: "2026-08-09T10:00:00", rink: "Lamacchia" }); // 4 hosts 5/12
    expect(byCell.qf4).toMatchObject({ slotStart: "2026-08-09T10:10:00", rink: "MGH" }); // 3 hosts 6/11
    expect(byCell.qf1).toMatchObject({ slotStart: "2026-08-09T11:00:00", rink: "Lamacchia" }); // 1 hosts 8/9
    expect(byCell.qf3).toMatchObject({ slotStart: "2026-08-09T11:10:00", rink: "MGH" }); // 2 hosts 7/10
    // Bare semifinals in listing order, then the championship.
    expect(byCell.sf1).toMatchObject({ slotStart: "2026-08-09T12:00:00", rink: "Lamacchia" });
    expect(byCell.sf2).toMatchObject({ slotStart: "2026-08-09T12:10:00", rink: "MGH" });
    expect(byCell.final).toMatchObject({ slotStart: "2026-08-09T13:30:00", rink: "Lamacchia" });
  });

  it("keeps the eventKeyword filter out of listing pastes", () => {
    const { matched } = parsePlayoffSchedule(LISTING, { fieldSize: 12, eventKeyword: "girls", year: 2026 });
    expect(matched).toBe(11);
  });
});
