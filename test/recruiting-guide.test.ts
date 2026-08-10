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
