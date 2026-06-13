import { describe, expect, it } from "vitest";
import { isRegistrationCsv, listRegistrationEvents, mergeRegistration } from "../../src/io/importRegistration.ts";
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

describe("tab-separated, single-event registration (no Event column)", () => {
  // Header begins at "Event Team" (no leading Event column), tab-delimited,
  // with a comma inside a field - exactly the failing real-world paste.
  const TSV = [
    "Event Team\t#\tYR\tPOS\tFirst Name\tLast Name\tCity\tST\tShoots\tHt\tWt\tTeam (Next Season)",
    "BLACK\t9\tSO\tForward\tAdriana\tBaltazar\tWilbraham\tMA\tLeft\t5'6\"\t130\tNorwich Hockey Club, Girls",
    "GRAY\t30\tJR\tGoaltender\tBailey\tBarnett\tDannemora\tNY\tLeft\t5'10\"\t230\tNorthshore Wings 19U",
  ].join("\n");

  it("is detected as a registration file by the Event Team column", () => {
    expect(isRegistrationCsv(TSV)).toBe(true);
    expect(listRegistrationEvents(TSV)).toEqual([]); // no Event column -> single event
  });

  function girlsDataset(): Dataset {
    const d = baseDataset([]);
    d.teams = [
      { id: "t-black", eventId: "ev-1", divisionId: "d", name: "BLACK" },
      { id: "t-gray", eventId: "ev-1", divisionId: "d", name: "GRAY" },
    ];
    d.divisions = [{ id: "d", eventId: "ev-1", name: "Major", teamIds: ["t-black", "t-gray"] }];
    return d;
  }

  it("merges all rows (no event filter) and keeps comma-bearing fields intact", () => {
    const { players, report } = mergeRegistration(girlsDataset(), TSV);
    expect(report.created).toBe(2);
    expect(report.unknownTeams).toEqual([]);
    const adriana = players.find((p) => p.lastName === "Baltazar")!;
    expect(adriana).toMatchObject({ teamId: "t-black", jersey: 9, position: "F", classYear: 2028, shoots: "L", heightInches: 66, weightLbs: 130 });
    // SO entering fall 2025 -> Class of 2028; comma field did not shift columns.
    expect(adriana.hometown).toBe("Wilbraham, MA");
  });
});

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

  it("flags a numeric hometown and falls back to the synced value", () => {
    const synced: Player = {
      id: "u-kyra", eventId: "ev-1", teamId: "t-mid", jersey: 40,
      firstName: "Kyra", lastName: "Sweeney", hometown: "Hamden, CT", heightInches: 69,
    };
    // Source row has ZIP where City should be -> hometown parses as "6518, CT".
    const csv = [HEADER, row({ "Event Team": "Middlesex", "#": "40", "First Name": "Kyra", "Last Name": "Sweeney", City: "6518", ST: "CT", Ht: "5'9\"", Wt: "145" })].join("\n");
    const { players, report } = mergeRegistration(baseDataset([synced]), csv, "Jr. High 2025");

    const kyra = players.find((p) => p.id === "u-kyra")!;
    expect(kyra.hometown).toBe("Hamden, CT"); // synced value kept, not "6518, CT"
    expect(kyra.heightInches).toBe(69); // valid height still applied (5'9")
    expect(report.suspicious.join(" ")).toContain("hometown");
    expect(report.suspicious.join(" ")).toContain("kept the synced value");
  });

  it("rejects out-of-range height and weight", () => {
    const csv = [HEADER, row({ "Event Team": "Bay State", "#": "7", "First Name": "Tiny", "Last Name": "Tot", Ht: "2'0\"", Wt: "12" })].join("\n");
    const { players, report } = mergeRegistration(baseDataset([]), csv, "Jr. High 2025");
    const p = players.find((x) => x.lastName === "Tot")!;
    expect(p.heightInches).toBeUndefined();
    expect(p.weightLbs).toBeUndefined();
    expect(report.suspicious.length).toBe(2);
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
