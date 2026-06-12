import { describe, expect, it } from "vitest";
import { listRegistrationEvents, mergeRegistration } from "../../src/io/importRegistration.ts";
import type { Dataset } from "../../src/io/dataset.ts";
import type { Player } from "../../src/engine/types.ts";
import { DEFAULT_POINT_SYSTEM } from "../../src/engine/pointSystem.ts";

// Header shaped exactly like the real HNIB registration export, including the
// PII columns the importer must never read.
const HEADER =
  "Event,Referral,Selection,Notes,Event Team,#,YR,POS,First Name,Last Name,School (Fall),Team (Next Season),P/G Name,Hockey Level,Address,City,ST,ZIP,PG Cell,PG Email,Player Cell,Player Email,DOB,COST,DEP,BAL,APP,Referral,Mail,Import,CC,CC2,Payment,Shoots,G,A,Pts,Ht,Wt,Reg Date,Transaction ID,Payment Status,Social";

function row(overrides: Record<string, string>): string {
  const base: Record<string, string> = {
    Event: "Jr. High 2025", "Event Team": "", "#": "", YR: "9th", POS: "Forward",
    "First Name": "", "Last Name": "", "School (Fall)": "", City: "", ST: "MA",
    Shoots: "Right", Ht: "5'6\"", Wt: "130",
    Address: "12 Private Way", "PG Email": "parent@example.com", DOB: "1/1/11",
    "Transaction ID": "120000000000", "Payment Status": "Paid",
  };
  Object.assign(base, overrides);
  return HEADER.split(",").map((h) => {
    const v = base[h] ?? "";
    return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

function baseDataset(players: Player[] = []): Dataset {
  return {
    event: {
      id: "ev-1", name: "2025 Jr. High Festival", year: 2025, venues: [], format: "festival",
      hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { ...DEFAULT_POINT_SYSTEM },
    },
    divisions: [{ id: "d", eventId: "ev-1", name: "EAST", teamIds: ["t-mid", "t-bay"] }],
    teams: [
      { id: "t-mid", eventId: "ev-1", divisionId: "d", name: "Middlesex", apiId: "api-mid" },
      { id: "t-bay", eventId: "ev-1", divisionId: "d", name: "Bay State", apiId: "api-bay" },
    ],
    games: [],
    players,
  };
}

const syncedJack: Player = {
  id: "u-jack-api", eventId: "ev-1", teamId: "t-mid", jersey: 9,
  firstName: "Jack", lastName: "Sullivan",
};

describe("listRegistrationEvents", () => {
  it("returns distinct events ordered by row count", () => {
    const csv = [HEADER,
      row({ Event: "Sophomore 2025", "Last Name": "A" }),
      row({ Event: "Sophomore 2025", "Last Name": "B" }),
      row({ Event: "Jr. High 2025", "Last Name": "C" }),
    ].join("\n");
    expect(listRegistrationEvents(csv)).toEqual(["Sophomore 2025", "Jr. High 2025"]);
  });
});

describe("mergeRegistration", () => {
  it("enriches a synced player matched by team + jersey, keeping the app identity", () => {
    const csv = [HEADER, row({
      "Event Team": "Middlesex", "#": "9", "First Name": "Jack", "Last Name": "Sullivan",
      YR: "8th", POS: "Forward", City: "Andover", ST: "MA", Shoots: "Left",
      Ht: "5'6\"", Wt: "126", "School (Fall)": "St. John's Prep",
    })].join("\n");
    const { players, report } = mergeRegistration(baseDataset([syncedJack]), csv, "Jr. High 2025");

    expect(report.matched).toBe(1);
    expect(report.created).toBe(0);
    const jack = players.find((p) => p.id === "u-jack-api")!; // app id preserved
    expect(jack).toMatchObject({
      classYear: 2030, // entering 8th grade in fall 2025
      heightInches: 66,
      weightLbs: 126,
      shoots: "L",
      hometown: "Andover, MA",
      school: "St. John's Prep",
    });
  });

  it("never copies PII columns into the dataset", () => {
    const csv = [HEADER, row({ "Event Team": "Middlesex", "#": "9", "First Name": "Jack", "Last Name": "Sullivan" })].join("\n");
    const { players } = mergeRegistration(baseDataset([syncedJack]), csv, "Jr. High 2025");
    const json = JSON.stringify(players);
    expect(json).not.toContain("parent@example.com");
    expect(json).not.toContain("Private Way");
    expect(json).not.toContain("120000000000");
    expect(json).not.toContain("1/1/11");
  });

  it("flags a name mismatch on the same team + jersey and leaves the player untouched", () => {
    const csv = [HEADER, row({ "Event Team": "Middlesex", "#": "9", "First Name": "Liam", "Last Name": "Doyle" })].join("\n");
    const { players, report } = mergeRegistration(baseDataset([syncedJack]), csv, "Jr. High 2025");
    expect(report.nameMismatches).toHaveLength(1);
    expect(report.nameMismatches[0]).toContain("Middlesex #9");
    const jack = players.find((p) => p.id === "u-jack-api")!;
    expect(jack.lastName).toBe("Sullivan");
    expect(jack.school).toBeUndefined();
  });

  it("creates players with no app counterpart and reports unassigned and unmatched", () => {
    const csv = [HEADER,
      row({ "Event Team": "Bay State", "#": "12", "First Name": "Josh", "Last Name": "Kupka" }),
      row({ "Event Team": "", "#": "", "First Name": "Patrick", "Last Name": "McGibbon" }),
      row({ Event: "Sophomore 2025", "Event Team": "Middlesex", "#": "9", "Last Name": "Other" }),
    ].join("\n");
    const { players, report } = mergeRegistration(baseDataset([syncedJack]), csv, "Jr. High 2025");

    expect(report.created).toBe(1);
    expect(players.some((p) => p.id === "p-t-bay-12" && p.lastName === "Kupka")).toBe(true);
    expect(report.unassigned).toEqual(["Patrick McGibbon"]);
    // Jack got no registration row in the filtered event.
    expect(report.unmatchedAppPlayers.join(" ")).toContain("Sullivan");
    // The Sophomore row was filtered out entirely.
    expect(players.some((p) => p.lastName === "Other")).toBe(false);
  });

  it("treats junk schools and unknown teams correctly", () => {
    const csv = [HEADER,
      row({ "Event Team": "Middlesex", "#": "9", "First Name": "Jack", "Last Name": "Sullivan", "School (Fall)": "Undecided" }),
      row({ "Event Team": "Nowhere", "#": "4", "First Name": "Lost", "Last Name": "Player" }),
    ].join("\n");
    const { players, report } = mergeRegistration(baseDataset([syncedJack]), csv, "Jr. High 2025");
    expect(players.find((p) => p.id === "u-jack-api")!.school).toBeUndefined();
    expect(report.unknownTeams).toEqual(["Nowhere"]);
  });
});
