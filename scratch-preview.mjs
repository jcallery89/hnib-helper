// Renders the reworked bracket layout to an SVG file for visual review,
// using the real Boys Major seeds and playoff times.
import { h } from "preact";
import { render } from "preact-render-to-string";
import { writeFileSync } from "node:fs";
import { BracketSvg } from "/home/user/hnib-helper/src/render/bracket/BracketSvg.tsx";

const teams = {
  wm: "Western Mass", ns: "North Shore", mid: "Middlesex", ss: "South Shore",
  nat: "National", gb: "Greater Boston", ne: "New England", sne: "Southern NE",
  soph: "Sophomore All Stars",
};
const names = { ...teams };
const colors = {
  wm: "#6d28d9", ns: "#d6453d", mid: "#1c2660", ss: "#7aa7d9",
  nat: "#0f766e", gb: "#b45309", ne: "#334155", sne: "#831843", soph: "#0e7490",
};

const g = (id, round, hs, ls, hi, lo, feeds) => ({
  id, round, highSeed: hs, lowSeed: ls, highTeamId: hi, lowTeamId: lo,
  highScore: null, lowScore: null, winnerTeamId: null, decidedBy: null, feedsGameId: feeds,
});

const bracket = [
  g("qf1", "qf", 1, 8, "wm", "ns", "sf1"),
  g("qf2", "qf", 4, 5, "mid", "ss", "sf1"),
  g("qf3", "qf", 2, 7, "nat", "soph", "sf2"),
  g("qf4", "qf", 3, 6, "ne", "sne", "sf2"),
  g("sf1", "sf", null, null, null, null, "final"),
  g("sf2", "sf", null, null, null, null, "final"),
  g("final", "final", null, null, null, null, null),
];

const slots = {
  qf1: { slotStart: "2026-08-02T08:00:00", rink: "Lamacchia" },
  qf2: { slotStart: "2026-08-02T08:00:00", rink: "MGH" },
  qf3: { slotStart: "2026-08-02T09:10:00", rink: "Lamacchia" },
  qf4: { slotStart: "2026-08-02T09:10:00", rink: "MGH" },
  sf1: { slotStart: "2026-08-02T10:00:00", rink: "Lamacchia" },
  sf2: { slotStart: "2026-08-02T11:10:00", rink: "Lamacchia" },
  final: { slotStart: "2026-08-02T13:00:00", rink: "Lamacchia" },
};

const svg = render(
  h(BracketSvg, {
    width: 1080,
    height: 1350,
    title: "Boys Major Showcase 2026 - Playoffs",
    bracket,
    nameById: (id) => names[id] ?? id,
    colorById: (id) => colors[id],
    scheduleByCell: (id) => slots[id],
    fieldSize: 8,
    embedFonts: true,
  }),
);
const out = "/tmp/claude-0/-home-user-hnib-helper/5d072677-fdc1-51c6-91b5-cfd8f8bb08ba/scratchpad/bracket-preview.svg";
writeFileSync(out, svg);
console.log("wrote", out, svg.length, "bytes");
