import { describe, expect, it } from "vitest";
import { buildRecruitingGuide } from "../src/io/recruitingGuide.ts";
import type { Dataset } from "../src/io/dataset.ts";
import fixture from "../src/fixtures/jrhigh-2025.json";

const dataset = fixture as unknown as Dataset;

describe("buildRecruitingGuide", () => {
  const guide = buildRecruitingGuide(dataset);
  const byName = new Map(guide.sheets.map((s) => [s.name, s]));

  it("builds overview, all-skaters, goalies, and a sheet per rostered team", () => {
    expect(guide.sheets[0].name).toBe("Overview");
    expect(byName.has("All Skaters")).toBe(true);
    expect(byName.has("Goalies")).toBe(true);
    const rosteredTeams = new Set((dataset.players ?? []).map((p) => p.teamId));
    expect(guide.sheets.length).toBe(3 + rosteredTeams.size);
    expect(guide.filename).toMatch(/recruiting-guide\.xlsx$/);
  });

  it("sorts the skater sheet by tournament points", () => {
    const rows = byName.get("All Skaters")!.rows.slice(3); // title, blank, header
    const pts = rows.map((r) => Number(r[13] ?? 0)); // PTS column
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("keeps goalies off the skater sheet and formats their rates", () => {
    const skaterRows = byName.get("All Skaters")!.rows.slice(3);
    const goalieRows = byName.get("Goalies")!.rows.slice(3);
    const goalieIds = new Set(
      (dataset.players ?? []).filter((p) => p.position === "G").map((p) => `${p.firstName} ${p.lastName}`),
    );
    for (const r of skaterRows) expect(goalieIds.has(String(r[2]))).toBe(false);
    // GAA formatted to 2 decimals, SV% to 3 with no leading zero, when present.
    for (const r of goalieRows) {
      const gaa = r[13];
      const sv = r[14];
      if (typeof gaa === "string") expect(gaa).toMatch(/^\d+\.\d{2}$/);
      if (typeof sv === "string") expect(sv).toMatch(/^\.\d{3}$|^1\.000$/);
    }
  });

  it("formats height as feet and inches on team sheets", () => {
    const team = guide.sheets[3];
    const header = team.rows[3];
    expect(header[4]).toBe("Ht");
    const withHeight = team.rows.slice(4).find((r) => r[4] !== null);
    if (withHeight) expect(String(withHeight[4])).toMatch(/^\d'\d{1,2}"$/);
  });

  it("caps sheet names at Excel's 31 characters", () => {
    for (const s of guide.sheets) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[\[\]:*?/\\]/);
    }
  });
});

describe("games played and registration merge", () => {
  // Tourno box scores routinely report GP as 0; the store's summaries carry a
  // team-games fallback. The guide must use the caller's summaries, not
  // recompute, or the GP column comes out blank.
  const ds = {
    ...dataset,
    event: { ...dataset.event, name: "Girls Major" },
    teams: [{ id: "t1", eventId: "e", divisionId: "d1", name: "45th Parallel" }],
    divisions: [{ id: "d1", eventId: "e", name: "BLUE", teamIds: ["t1"] }],
    games: [],
    players: [
      { id: "p1", eventId: "e", teamId: "t1", jersey: 2, firstName: "Ashlyn", lastName: "Beeles", position: "D" as const },
      { id: "p2", eventId: "e", teamId: "t1", jersey: 4, firstName: "Addison", lastName: "Gray", position: "D" as const },
    ],
    playerStats: [],
  } as unknown as Dataset;

  const summaries = new Map([
    ["p1", { playerId: "p1", isGoalie: false, gp: 4, goals: 3, assists: 6, points: 9, pim: 0 }],
    ["p2", { playerId: "p2", isGoalie: false, gp: 4, goals: 0, assists: 0, points: 0, pim: 2 }],
  ]) as any;

  // The operator's copy/paste from the registration database (tab separated).
  const REG = [
    "Event Team\t#\tYR\tPOS\tFirst Name\tLast Name\tSchool (Fall)\tTeam (Next Season)\tP/G Name\tHockey Level\tAddress\tCity\tST\tZIP\tPG Cell\tPG Email\tPlayer Cell\tPlayer Email\tDOB\tShoots\tHt\tWt\tSocial",
    "45th Parallel\t2\tSR\tDefense\tAshlyn\tBeeles\tCanton Central HS\tPotsdam Ny Ice Storm 19U\tWesley Beeles\tHS Varsity\t19 Gouverneur Street\tCanton\tNY\t13617\t(680) 888-5351\twbeeles@gmail.com\t(315) 224-8610\tashlynbeeles33@gmail.com\t3/20/09\tLeft\t5'5\"\t135\t@ashlynbeeles",
    "45th Parallel\t4\tJR\tDefense\tAddison\tGray\tOntario Hockey Academy\tOntario Hockey Academy (Tardiff)\tJaime Gray\tU22 Elite OWHL\t5659 Georgia Shore Rd\tSaint Labans\tVT\t05478\t(802) 309-3581\tjaimecol2977@yahoo.com\t(802) 370-2011\tjaimecol2977@yahoo.com\t9/26/08\tRight\t5'8\"\t155\taddisongray_22",
  ].join("\n");

  it("fills GP from the caller's summaries instead of recomputing to zero", () => {
    const g = buildRecruitingGuide(ds, { summaries });
    const rows = g.sheets.find((s) => s.name === "All Skaters")!.rows.slice(3);
    const gpCol = 10; // Team + 9 bio columns
    expect(rows.map((r) => r[gpCol])).toEqual([4, 4]);
  });

  it("merges registration details for matched players", () => {
    const g = buildRecruitingGuide(ds, { summaries, registrationCsv: REG });
    expect(g.registrationMatched).toBe(2);
    expect(g.registrationUnmatched).toEqual([]);

    const sheet = g.sheets.find((s) => s.name === "All Skaters")!;
    const head = sheet.rows[2] as string[];
    const ashlyn = sheet.rows.slice(3).find((r) => String(r[2]).includes("Ashlyn"))!;
    const at = (label: string) => ashlyn[head.indexOf(label)];

    expect(at("Grad Yr")).toBe("SR");
    expect(at("School (Fall)")).toBe("Canton Central HS");
    expect(at("Team (Next Season)")).toBe("Potsdam Ny Ice Storm 19U");
    expect(at("Level")).toBe("HS Varsity");
    expect(at("Parent / Guardian")).toBe("Wesley Beeles");
    expect(at("PG Cell")).toBe("(680) 888-5351");
    expect(at("PG Email")).toBe("wbeeles@gmail.com");
    expect(at("Player Email")).toBe("ashlynbeeles33@gmail.com");
    expect(at("Social")).toBe("@ashlynbeeles");
    // Registration fills bio gaps the API roster left blank.
    expect(at("Hometown")).toBe("Canton, NY");
    expect(at("Ht")).toBe("5'5\"");
    expect(at("Shoots")).toBe("L");
  });

  it("never pulls street address or ZIP into the workbook", () => {
    const g = buildRecruitingGuide(ds, { summaries, registrationCsv: REG });
    const flat = JSON.stringify(g.sheets);
    expect(flat).not.toContain("Gouverneur");
    expect(flat).not.toContain("13617");
  });

  it("reports players with no registration row rather than failing", () => {
    const extra = {
      ...ds,
      players: [...(ds.players ?? []), { id: "p3", eventId: "e", teamId: "t1", jersey: 99, firstName: "No", lastName: "Match", position: "F" as const }],
    } as unknown as Dataset;
    const g = buildRecruitingGuide(extra, { summaries, registrationCsv: REG });
    expect(g.registrationMatched).toBe(2);
    expect(g.registrationUnmatched.join(" ")).toContain("No Match");
  });
});
