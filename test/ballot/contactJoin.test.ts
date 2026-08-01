import { describe, expect, it } from "vitest";
import { joinContacts } from "../../src/io/contactJoin.ts";
import type { Player, Team } from "../../src/engine/types.ts";

// Header mirrors the real HNIB registration export (same shape the
// registration importer's fixtures use), including the PII columns this join
// reads transiently and the payment columns it must ignore.
const HEADER =
  "Event,Event Team,#,First Name,Last Name,P/G Name,Address,City,ST,ZIP,PG Cell,PG Email,Player Cell,Player Email,DOB,COST,CC";

function row(team: string, jersey: string, first: string, last: string, extras: Partial<Record<string, string>> = {}): string {
  return [
    extras.event ?? "2026 Boys Major Showcase", team, jersey, first, last,
    extras.parentName ?? `${first} Sr.`, "1 Main St", "Boston", "MA", "02108",
    extras.parentCell ?? "617-555-0100", extras.parentEmail ?? "parent@example.com",
    extras.playerCell ?? "617-555-0101", extras.playerEmail ?? "player@example.com",
    "1/1/2009", "$975", "VISA",
  ].join(",");
}

const teams: Team[] = [
  { id: "t-mid", eventId: "e", divisionId: "d", name: "Middlesex" },
  { id: "t-ne", eventId: "e", divisionId: "d", name: "Northeast" },
];

function player(overrides: Partial<Player>): Player {
  return { id: "p", eventId: "e", teamId: "t-mid", jersey: 9, firstName: "Jack", lastName: "Sullivan", ...overrides };
}

describe("joinContacts", () => {
  it("matches by team and jersey and returns the contact columns", () => {
    const csv = [HEADER, row("Middlesex", "9", "Jack", "Sullivan")].join("\n");
    const result = joinContacts(csv, [player({})], teams);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      playerId: "p",
      parentName: "Jack Sr.",
      parentCell: "617-555-0100",
      parentEmail: "parent@example.com",
      playerCell: "617-555-0101",
      playerEmail: "player@example.com",
    });
    expect(result.unmatched).toHaveLength(0);
  });

  it("falls back to a name match when the jersey row has a different last name", () => {
    const csv = [
      HEADER,
      row("Middlesex", "9", "Tim", "Other"),
      row("Middlesex", "27", "Jack", "Sullivan", { parentEmail: "sullivan@example.com" }),
    ].join("\n");
    const result = joinContacts(csv, [player({})], teams);
    expect(result.warnings.join(" ")).toContain("matched by name instead");
    expect(result.rows[0]?.parentEmail).toBe("sullivan@example.com");
  });

  it("reports players with no registration row", () => {
    const csv = [HEADER, row("Northeast", "1", "Brady", "Olsen")].join("\n");
    const result = joinContacts(csv, [player({})], teams);
    expect(result.rows).toHaveLength(0);
    expect(result.unmatched[0]).toContain("Sullivan");
  });

  it("filters to the picked event in a multi-event export", () => {
    const csv = [
      HEADER,
      row("Middlesex", "9", "Jack", "Sullivan", { event: "2025 Jr High Festival", parentEmail: "wrong@example.com" }),
      row("Middlesex", "9", "Jack", "Sullivan", { event: "2026 Boys Major Showcase", parentEmail: "right@example.com" }),
    ].join("\n");
    const result = joinContacts(csv, [player({})], teams, "2026 Boys Major Showcase");
    expect(result.rows[0]?.parentEmail).toBe("right@example.com");
  });

  it("warns when the paste has no contact columns at all", () => {
    const csv = ["Event Team,#,First Name,Last Name", "Middlesex,9,Jack,Sullivan"].join("\n");
    const result = joinContacts(csv, [player({})], teams);
    expect(result.rows).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("No contact columns");
  });

  it("never mutates the players or teams it is given", () => {
    const p = player({});
    const before = JSON.stringify({ p, teams });
    joinContacts([HEADER, row("Middlesex", "9", "Jack", "Sullivan")].join("\n"), [p], teams);
    expect(JSON.stringify({ p, teams })).toBe(before);
  });
});
