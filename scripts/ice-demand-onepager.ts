// One-page "Satellite Weekend Ice Demand" sheet for a partner rink, generated
// from the planner engine so the numbers match the tool. Run with:
//   npx vite-node scripts/ice-demand-onepager.ts
// Writes dist/hnib-satellite-ice-demand.html (print it to Letter for a PDF).
//
// Two offerings, chosen by team count: "3 games + 1 practice" (3 teams play a
// single round robin, 2 games) or "4 games, no practice". Game blocks are 90
// minutes: warmup, two 23-minute stop-time periods, and an ice cut at the half.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { newScenario, planScenario } from "../src/engine/planner/index.ts";

const TEAM_COUNTS = [3, 4, 5, 6, 8];
const PRACTICE_MINUTES = 60;
const BLOCK_MINUTES = 90;

interface Cell {
  available: boolean;
  /** Hours if teams may play back-to-back blocks (no open blocks). */
  compact: number;
  games: number; // per team
  totalGames: number;
  practices: number;
  ice: number; // active hours: game blocks plus practices
  booked: number; // window to book, rest gaps included
  perDay: string;
  mark: string; // footnote marker
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toString();

function cell(teams: number, games: number, practice: boolean, mark = ""): Cell {
  const s = newScenario("satellite");
  s.structure.teams = teams;
  s.structure.gamesPerTeam = games;
  s.structure.practice = practice;
  s.structure.practiceMinutes = PRACTICE_MINUTES;
  s.structure.blockMinutes = BLOCK_MINUTES;
  const r = planScenario(s);
  if (!r.format.exact) return { available: false, compact: 0, games, totalGames: 0, practices: 0, ice: 0, booked: 0, perDay: "", mark };
  const sch = r.schedule;
  const loose = structuredClone(s);
  loose.structure.restBlocks = 0;
  return {
    available: true,
    compact: planScenario(loose).schedule.bookedHours,
    games,
    totalGames: sch.totalGames,
    practices: sch.practiceSessions,
    ice: sch.activeHours,
    booked: sch.bookedHours,
    perDay: sch.days.map((d) => h1(d.bookedHours)).join(" / "),
    mark,
  };
}

interface Row {
  teams: number;
  players: number;
  a: Cell; // 3 games + 1 practice
  b: Cell; // 4 games, no practice
}

const rows: Row[] = TEAM_COUNTS.map((teams) => {
  const players = teams * 17;
  // 3 teams: a single round robin is 2 games each. 5 teams: 3 games each is not an even split.
  const aGames = teams === 3 ? 2 : 3;
  const a = cell(teams, aGames, true, teams === 3 ? "*" : (teams * aGames) % 2 ? "†" : "");
  const b = cell(teams, 4, false);
  return { teams, players, a, b };
});

const trims = rows
  .flatMap((r) => [
    [r, r.a, "Option A"] as const,
    [r, r.b, "Option B"] as const,
  ])
  .filter(([, c]) => c.available && c.booked > c.compact + 0.05)
  .map(([r, c, label]) => `${r.teams} teams ${label} to ${h1(c.compact)} h`);

const logo = `data:image/png;base64,${readFileSync("src/assets/brand/logo_white_transparent.png").toString("base64")}`;
const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const cellHtml = (c: Cell) =>
  c.available
    ? `<td>${c.totalGames}${c.practices ? `<span class="sub">+ ${c.practices} practices</span>` : ""}</td><td class="ice">${h1(c.booked)}${c.mark ? `<sup>${c.mark}</sup>` : ""}${c.booked > c.ice + 0.05 ? `<span class="sub">${h1(c.ice)} h of play</span>` : ""}</td><td class="days">${c.perDay}</td>`
    : `<td class="na" colspan="3">Not an even split, use 4 games<sup>${c.mark}</sup></td>`;

const tableRows = rows
  .map(
    (r) =>
      `<tr class="${r.teams === 4 ? "target" : ""}"><td class="t">${r.teams}${r.teams === 3 ? `<span class="tag">minimum</span>` : r.teams === 4 ? `<span class="tag">target</span>` : ""}</td><td class="players">${r.players}</td>${cellHtml(r.a)}<td class="gap"></td>${cellHtml(r.b)}</tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Satellite Weekend Ice Demand</title>
<style>
  @page { size: letter; margin: 0.45in 0.5in 0.45in; }
  :root { --navy: #111e3f; --gold: #d4a843; --ice: #a8cce0; --ice-2: #e9f1f7; --line: #d3dbe6; --dim: #5b6b84; --text: #111e3f; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--text); }
  body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif; font-size: 9.8pt; line-height: 1.3; width: 7.5in; margin: 0 auto; }
  .band { background: var(--navy); color: #fff; padding: 10pt 12pt 9pt; display: flex; align-items: center; gap: 14pt; border-bottom: 4pt solid var(--gold); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .band img { height: 36pt; width: auto; }
  .band h1 { font-size: 20pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; line-height: 1; }
  .band .sub { font-size: 9pt; color: var(--ice); letter-spacing: 0.12em; text-transform: uppercase; margin-top: 4pt; }
  p { margin: 0 0 6pt; }
  .intro { margin: 9pt 0 8pt; }
  .targets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin: 0 0 10pt; }
  .tile { border: 1pt solid var(--line); border-top: 3pt solid var(--gold); padding: 6pt 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tile .k { font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); }
  .tile .v { font-size: 15pt; font-weight: 700; line-height: 1.15; margin: 2pt 0 1pt; }
  .tile .s { font-size: 8.8pt; color: var(--dim); }
  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 5pt; color: var(--navy); }

  table.matrix { width: 100%; table-layout: fixed; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .matrix col.c-teams { width: 13%; }
  .matrix col.c-players { width: 10%; }
  .matrix col.c-gap { width: 2%; }
  .matrix col.c-num { width: 12.5%; }
  .matrix th { font-weight: 700; padding: 5pt 4pt; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .matrix th.group { background: var(--navy); color: #fff; font-size: 9pt; letter-spacing: 0.06em; text-transform: uppercase; }
  .matrix th.blank, .matrix td.gap { background: transparent; border: none; padding: 0; }
  .matrix th.col { background: var(--ice-2); color: var(--navy); font-size: 7.6pt; letter-spacing: 0.08em; text-transform: uppercase; }
  .matrix th.col.left { text-align: left; padding-left: 8pt; }
  .matrix td { padding: 0 4pt; height: 34pt; border-bottom: 0.75pt solid var(--line); vertical-align: middle; text-align: center; font-size: 10.5pt; }
  .matrix td.t { text-align: left; padding-left: 8pt; font-size: 15pt; font-weight: 700; white-space: nowrap; }
  .matrix td.players { color: var(--dim); }
  .matrix td.ice { font-weight: 700; font-size: 12pt; }
  .matrix td.days { color: var(--dim); }
  .matrix td.na { color: var(--dim); font-style: italic; font-size: 9pt; }
  .matrix tr.target td:not(.gap) { background: var(--ice-2); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .matrix td .sub { display: block; font-size: 7.4pt; color: var(--dim); font-weight: 400; line-height: 1.1; margin-top: 1pt; }
  .matrix .tag { display: inline-block; font-size: 6.6pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--navy); background: var(--gold); padding: 1pt 4pt; border-radius: 2pt; margin-left: 5pt; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .matrix sup { font-size: 7pt; color: var(--dim); font-weight: 400; }
  .legend { font-size: 8pt; color: var(--dim); margin: 5pt 0 0; }
  .legend b { color: var(--navy); }

  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; margin-top: 11pt; }
  ul { margin: 0; padding-left: 14pt; }
  li { margin: 0 0 2pt; }
  .fine { font-size: 7.8pt; color: var(--dim); margin-top: 9pt; border-top: 0.75pt solid var(--line); padding-top: 5pt; }
  .foot { display: flex; justify-content: space-between; font-size: 8pt; color: var(--dim); margin-top: 6pt; letter-spacing: 0.04em; }
</style>
</head>
<body>
<div class="band">
  <img src="${logo}" alt="Hockey Night in Boston" />
  <div>
    <h1>Satellite Weekend Ice Demand</h1>
    <div class="sub">Planning sheet for a regional partner rink</div>
  </div>
</div>

<p class="intro">Hockey Night in Boston is planning a regional satellite weekend with a partner rink and program in Virginia: a low-cost, high-quality event that identifies players to invite to the Major Showcase in Worcester, MA. This sheet shows the players and teams we plan around and how much ice each option needs, so we can size the weekend together. Depending on the number of teams, the weekend runs as <b>3 games plus one practice</b> per team or <b>4 games</b> per team. Games are two 23-minute stop-time periods with referees and a scorekeeper, in 90-minute ice blocks with an ice cut at the half.</p>

<div class="targets">
  <div class="tile"><div class="k">Players per team</div><div class="v">17</div><div class="s">9 forwards, 6 defense, 2 goalies</div></div>
  <div class="tile"><div class="k">Teams</div><div class="v">3 minimum, 4 target</div><div class="s">51 players at 3 teams, 68 at 4, up to 136 at 8</div></div>
  <div class="tile"><div class="k">Weekend footprint</div><div class="v">Sat + Sun, one sheet</div><div class="s">90-minute game blocks, 60-minute practices</div></div>
</div>

<h2>Ice demand by team count</h2>
<table class="matrix">
  <colgroup>
    <col class="c-teams" /><col class="c-players" />
    <col class="c-num" /><col class="c-num" /><col class="c-num" />
    <col class="c-gap" />
    <col class="c-num" /><col class="c-num" /><col class="c-num" />
  </colgroup>
  <thead>
    <tr>
      <th class="blank" colspan="2"></th>
      <th class="group" colspan="3">Option A: 3 games + 1 practice</th>
      <th class="blank"></th>
      <th class="group" colspan="3">Option B: 4 games, no practice</th>
    </tr>
    <tr>
      <th class="col left">Teams</th><th class="col">Players</th>
      <th class="col">Games</th><th class="col">Ice hours</th><th class="col">Sat / Sun</th>
      <th class="blank"></th>
      <th class="col">Games</th><th class="col">Ice hours</th><th class="col">Sat / Sun</th>
    </tr>
  </thead>
  <tbody>
${tableRows}
  </tbody>
</table>
<p class="legend"><b>Ice hours</b> is the ice to book for the weekend (${BLOCK_MINUTES}-minute game blocks, 60-minute practices, and any open block the schedule needs); <b>Sat / Sun</b> splits it by day. * 3 teams play a single round robin (2 games each) plus the practice; 4 games is a double round robin. † 5 teams cannot split 3 games each evenly, since every game uses two teams.</p>

<div class="two">
  <div>
    <h2>HNIB brings</h2>
    <ul>
      <li>Referees and a scorekeeper for every game, and a custom game jersey for every player</li>
      <li>Coaches, team balancing, schedules, standings, registration, and the hnib.app event page with rosters and stats</li>
      <li>Evaluators on site; standout players are invited to the Major Showcase in Worcester</li>
    </ul>
  </div>
  <div>
    <h2>We need from the rink</h2>
    <ul>
      <li>Ice in 90-minute game blocks (plus 60-minute practice blocks for Option A), back to back on one sheet, with a rate per hour or a flat weekend package</li>
      <li>Two locker rooms per game, a scoreboard and clock, and a scorekeeper table</li>
      <li>A partner program to help fill rosters: coaches who bring players earn a referral commission</li>
    </ul>
  </div>
</div>

<p class="fine">Round-robin games are split evenly across Saturday and Sunday and no team plays back-to-back blocks; where that leaves an open block a practice fills it, and the rest is counted in the ice hours above.${trims.length ? ` If teams may play back-to-back, the weekend compresses: ${trims.join("; ")}.` : ""} A placement round or playoff, if added, goes on Sunday after the last round-robin game. Other team counts are easy to price with the same rules.</p>
<div class="foot"><span>Hockey Night in Boston, since 1972 · PlayHNIB.com</span><span>Prepared ${today} with the HNIB Event Planner</span></div>
</body>
</html>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/hnib-satellite-ice-demand.html", html);
console.log("dist/hnib-satellite-ice-demand.html written,", rows.length, "team counts");
for (const r of rows) console.log(r.teams, "teams:", r.a.available ? `A ${r.a.totalGames}g+${r.a.practices}p ${r.a.ice}h (book ${r.a.booked}) ${r.a.perDay}` : "A n/a", "|", `B ${r.b.totalGames}g ${r.b.ice}h (book ${r.b.booked}) ${r.b.perDay}`);
