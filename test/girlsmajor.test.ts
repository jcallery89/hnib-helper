import { describe, expect, it } from "vitest";
import { buildPlayoffField } from "../src/engine/playoff/field.ts";
import { buildBracket, type BracketResult } from "../src/engine/playoff/bracket.ts";
import { computeLayout } from "../src/render/bracket/layout.ts";
import type { Division, Game, HnibEvent, PlayoffSeed, Team } from "../src/engine/types.ts";

// Girls Major Showcase: 5 divisions, 12-team field. Top 2 per division (winners
// seeded 1-5, runners-up 6-10 by the tiebreakers), then 2 wildcards 11-12.
const event: HnibEvent = {
  id: "gm", name: "Girls Major", year: 2026, venues: [], format: "festival",
  hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", fieldSize: 12,
  pointSystem: { win: 2, tie: 1, loss: 0 },
};

// Each division d (0-4) has a clear ladder W > R > L, with goals arranged so
// GA separates the winners (W_d concedes d), the runners-up (R_d concedes 3+d),
// and GF separates the last-place teams (L_d scores d).
const teams: Team[] = [];
const divisions: Division[] = [];
const games: Game[] = [];
let gid = 0;
function game(home: string, away: string, hs: number, as: number, div: string): Game {
  return { id: `g${gid++}`, divisionId: div, round: "rr", rink: null, slotStart: null, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, status: "final", decidedBy: "regulation" };
}
for (let d = 0; d < 5; d++) {
  const [w, r, l] = [`W${d}`, `R${d}`, `L${d}`];
  for (const id of [w, r, l]) teams.push({ id, eventId: "gm", divisionId: `d${d}`, name: id });
  divisions.push({ id: `d${d}`, eventId: "gm", name: `Div ${d}`, teamIds: [w, r, l] });
  games.push(game(w, r, 6, d, `d${d}`)); // W_d GA accumulates d
  games.push(game(w, l, 6, 0, `d${d}`));
  games.push(game(r, l, 6, d, `d${d}`)); // L_d GF accumulates d, R_d GA 6+d
}

describe("Girls Major 12-team seeding", () => {
  const field = buildPlayoffField(event, divisions, teams, games);
  const ids = field.seeds.map((s) => s.teamId);

  it("seeds exactly twelve teams", () => {
    expect(field.seeds).toHaveLength(12);
    expect(field.seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("ranks winners 1-5, runners-up 6-10, wildcards 11-12", () => {
    expect(ids.slice(0, 5)).toEqual(["W0", "W1", "W2", "W3", "W4"]); // by GA
    expect(ids.slice(5, 10)).toEqual(["R0", "R1", "R2", "R3", "R4"]);
    // Wildcards: best of the rest by the tiebreakers (all L tied on points/wins/GA,
    // so GF most decides - L4 then L3).
    expect(ids.slice(10)).toEqual(["L4", "L3"]);
    expect(field.seeds[10].source).toBe("wildcard");
    expect(field.seeds[11].source).toBe("wildcard");
  });
});

describe("Girls Major tiebreak order (H2H before wins)", () => {
  // A and B tied on 4 points: A went 2-2 (2 wins), B went 1-1-2 (1 win, 2 ties)
  // and BEAT A head-to-head. Standard order ranks A first (Most Wins); the
  // Girls Major order ranks B first (Head-to-Head).
  const two: Team[] = [
    { id: "A", eventId: "gm", divisionId: "dx", name: "A" },
    { id: "B", eventId: "gm", divisionId: "dx", name: "B" },
    { id: "C", eventId: "gm", divisionId: "dx", name: "C" },
    { id: "D", eventId: "gm", divisionId: "dx", name: "D" },
  ];
  const dx: Division[] = [{ id: "dx", eventId: "gm", name: "DX", teamIds: ["A", "B", "C", "D"] }];
  const g = (h: string, a: string, hs: number, as: number): Game =>
    ({ id: `t${gid++}`, divisionId: "dx", round: "rr", rink: null, slotStart: null, homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, status: "final", decidedBy: "regulation" });
  const gamesTwo: Game[] = [
    g("B", "A", 2, 1), // B beats A head-to-head
    g("A", "C", 5, 0), // A: W
    g("A", "D", 5, 0), // A: W -> A finishes 2W 2L, 4 pts
    g("C", "A", 3, 0), // A: L
    g("B", "C", 1, 1), // B: T
    g("B", "D", 1, 1), // B: T
    g("D", "B", 2, 0), // B: L -> B finishes 1W 2T 1L, 4 pts (C and D land on 3)
  ];

  it("ranks the head-to-head winner first under girls_major, the wins leader under standard", () => {
    const base = { ...event, fieldSize: 4 };
    const std = buildPlayoffField({ ...base, tiebreakRule: "standard" }, dx, two, gamesTwo);
    const gm = buildPlayoffField({ ...base, tiebreakRule: "girls_major" }, dx, two, gamesTwo);
    const top = (f: typeof std) => f.divisionStandings.get("dx")!.slice(0, 2).map((s) => s.teamId);
    expect(top(std)).toEqual(["A", "B"]); // Most Wins first: A (2) over B (1)
    expect(top(gm)).toEqual(["B", "A"]); // Head-to-Head first: B beat A
  });
});

describe("12-team bracket", () => {
  const seeds: PlayoffSeed[] = Array.from({ length: 12 }, (_, i) => ({ seed: i + 1, teamId: `s${i + 1}`, source: "auto", notes: [] }));

  it("gives seeds 1-4 byes and pairs Round 1 as 8v9, 5v12, 7v10, 6v11", () => {
    const b = buildBracket(seeds, new Map(), 12);
    const byId = new Map(b.map((g) => [g.id, g]));
    expect(b.filter((g) => g.round === "prelim")).toHaveLength(4);
    expect(byId.get("pr1")).toMatchObject({ highSeed: 8, lowSeed: 9, feedsGameId: "qf1" });
    expect(byId.get("pr2")).toMatchObject({ highSeed: 5, lowSeed: 12, feedsGameId: "qf2" });
    expect(byId.get("pr3")).toMatchObject({ highSeed: 7, lowSeed: 10, feedsGameId: "qf3" });
    expect(byId.get("pr4")).toMatchObject({ highSeed: 6, lowSeed: 11, feedsGameId: "qf4" });
    // Bye seeds host the QFs; the low side is TBD until the prelims are played.
    expect(byId.get("qf1")).toMatchObject({ highSeed: 1, highTeamId: "s1", lowTeamId: null });
    expect(byId.get("qf2")).toMatchObject({ highSeed: 4, highTeamId: "s4" });
    expect(byId.get("qf3")).toMatchObject({ highSeed: 2, highTeamId: "s2" });
    expect(byId.get("qf4")).toMatchObject({ highSeed: 3, highTeamId: "s3" });
  });

  it("advances Round 1 winners into the right quarterfinals", () => {
    const results = new Map<string, BracketResult>([
      ["pr1", { highScore: 2, lowScore: 1, decidedBy: "regulation" }], // s8 over s9
      ["pr2", { highScore: 0, lowScore: 3, decidedBy: "regulation" }], // s12 upsets s5
    ]);
    const byId = new Map(buildBracket(seeds, results, 12).map((g) => [g.id, g]));
    expect(byId.get("qf1")).toMatchObject({ lowTeamId: "s8", lowSeed: 8 });
    expect(byId.get("qf2")).toMatchObject({ lowTeamId: "s12", lowSeed: 12 });
  });

  it("lays out five columns with all eleven games", () => {
    const layout = computeLayout(1080, 1920, 12);
    expect(layout.columns.map((c) => c.text)).toEqual(["ROUND 1", "QUARTERFINALS", "SEMIFINALS", "FINAL", "CHAMPION"]);
    expect(layout.cells.map((c) => c.id).sort()).toEqual(
      ["final", "pr1", "pr2", "pr3", "pr4", "qf1", "qf2", "qf3", "qf4", "sf1", "sf2"].sort(),
    );
    // Each QF shares its center with the Round 1 game feeding it.
    const cell = (id: string) => layout.cells.find((c) => c.id === id)!;
    expect(cell("qf1").y).toBe(cell("pr1").y);
    expect(cell("qf4").y).toBe(cell("pr4").y);
  });
});
