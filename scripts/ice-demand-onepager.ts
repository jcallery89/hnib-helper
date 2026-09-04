// One-page "Satellite Weekend Ice Demand" sheet for a partner rink, generated
// from the planner engine so the numbers match the tool. Run with:
//   npx vite-node scripts/ice-demand-onepager.ts
// Writes dist/hnib-satellite-ice-demand.html (print it to Letter for a PDF).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { newScenario, planScenario } from "../src/engine/planner/index.ts";

const PRACTICE_MINUTES = 60;
const COMBOS: Array<[number, number]> = [
  [3, 2], [3, 3], [3, 4],
  [4, 3], [4, 4],
  [5, 4],
  [6, 3], [6, 4],
  [8, 3], [8, 4],
];

interface Row {
  teams: number;
  games: number;
  players: number;
  possible: boolean;
  format: string;
  totalGames: number;
  practices: number;
  gameIce: number;
  practiceIce: number;
  totalIce: number;
  perDay: string;
  note: string;
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toString();

const rows: Row[] = COMBOS.map(([teams, games]) => {
  const s = newScenario("satellite");
  s.structure.teams = teams;
  s.structure.gamesPerTeam = games;
  s.structure.practice = true;
  s.structure.practiceMinutes = PRACTICE_MINUTES;
  const r = planScenario(s);
  const possible = r.format.exact;
  if (!possible) {
    const need = (teams * games) / 2;
    return {
      teams, games, players: r.pnl.players, possible: false, format: "", totalGames: 0, practices: teams,
      gameIce: 0, practiceIce: teams, totalIce: 0, perDay: "",
      note: `Not possible: ${teams} teams x ${games} games each needs ${need} games and every game uses two teams. Use ${games - 1} or ${games + 1} games.`,
    };
  }
  const sch = r.schedule;
  const gameIce = (sch.totalGames * s.structure.blockMinutes) / 60;
  const practiceIce = (sch.practiceSessions * PRACTICE_MINUTES) / 60;
  return {
    teams, games, players: r.pnl.players, possible: true,
    format: r.format.plan.title.replace("Two pools of", "2 pools of").replace(" plus ", " + ").replace(" crossover games", " crossovers").replace(" crossover game", " crossover"),
    totalGames: sch.totalGames, practices: sch.practiceSessions,
    gameIce, practiceIce, totalIce: sch.activeHours,
    perDay: sch.days.map((d) => h1(d.bookedHours)).join(" / "),
    note: sch.bookedHours > sch.activeHours + 0.05 ? `${teams} teams at ${games} games: book ${h1(sch.bookedHours)} h` : "",
  };
});

const logo = `data:image/png;base64,${readFileSync("src/assets/brand/logo_white_transparent.png").toString("base64")}`;
const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const notes = rows.filter((r) => r.possible && r.note).map((r) => r.note);
const bookingNotes = notes.length ? `, and a little open time remains in two cases (${notes.join("; ")})` : "";

const tableRows = rows
  .map((r, i) => {
    const first = i === 0 || rows[i - 1].teams !== r.teams;
    const cls = [first ? "first" : "", r.teams === 3 ? "min" : "", r.teams === 4 && r.games === 4 ? "target" : "", r.possible ? "" : "na"].filter(Boolean).join(" ");
    if (!r.possible) {
      return `<tr class="${cls}"><td class="t">${first ? r.teams : ""}</td><td class="num">${r.players}</td><td class="num">${r.games}</td><td colspan="7" class="note">${esc(r.note)}</td></tr>`;
    }
    return `<tr class="${cls}"><td class="t">${first ? r.teams : ""}</td><td class="num">${r.players}</td><td class="num">${r.games}</td><td>${esc(r.format)}</td><td class="num">${r.totalGames}</td><td class="num">${r.practices}</td><td class="num">${h1(r.gameIce)}</td><td class="num">${h1(r.practiceIce)}</td><td class="num strong">${h1(r.totalIce)}</td><td class="num">${r.perDay}</td></tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Satellite Weekend Ice Demand</title>
<style>
  @page { size: letter; margin: 0.45in 0.5in 0.45in; }
  :root {
    --navy: #111e3f; --gold: #d4a843; --ice: #a8cce0; --ice-2: #e6eff6; --line: #cdd6e1; --dim: #5b6b84; --text: #111e3f;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--text); }
  body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif; font-size: 9.6pt; line-height: 1.28; width: 7.5in; margin: 0 auto; }
  .band { background: var(--navy); color: #fff; padding: 9pt 12pt 8pt; display: flex; align-items: center; gap: 14pt; border-bottom: 4pt solid var(--gold); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .band img { height: 34pt; width: auto; }
  .band h1 { font-size: 19pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; line-height: 1; }
  .band .sub { font-size: 9.5pt; color: var(--ice); letter-spacing: 0.12em; text-transform: uppercase; margin-top: 4pt; }
  p { margin: 0 0 6pt; }
  .intro { margin: 7pt 0 6pt; }
  .targets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7pt; margin: 0 0 7pt; }
  .tile { border: 1pt solid var(--line); border-top: 3pt solid var(--gold); padding: 4pt 8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tile .k { font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); }
  .tile .v { font-size: 15pt; font-weight: 700; line-height: 1.15; margin: 2pt 0 1pt; }
  .tile .s { font-size: 9pt; color: var(--dim); }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4pt; color: var(--navy); }
  table { width: 100%; border-collapse: collapse; font-size: 8.6pt; font-variant-numeric: tabular-nums; }
  th, td { padding: 2.4pt 4.5pt; border-bottom: 0.75pt solid var(--line); text-align: left; vertical-align: top; }
  th { background: var(--navy); color: #fff; font-size: 7.6pt; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  th:nth-child(4), td:nth-child(4) { width: 1.45in; }
  th:nth-child(1), td:nth-child(1) { width: 0.5in; }
  td.t { font-weight: 700; font-size: 10pt; }
  tr.first td { border-top: 1.5pt solid var(--navy); }
  tr.target td { background: var(--ice-2); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td.strong { font-weight: 700; }
  td.note, tr.na td { color: var(--dim); font-style: italic; }
  .sub { display: block; font-size: 7.8pt; color: var(--dim); font-style: italic; white-space: normal; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin-top: 7pt; }
  ul { margin: 0; padding-left: 14pt; }
  li { margin: 0 0 1pt; }
  .fine { font-size: 7.6pt; color: var(--dim); margin-top: 6pt; border-top: 0.75pt solid var(--line); padding-top: 5pt; }
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

<p class="intro">Hockey Night in Boston is planning a regional satellite weekend with a partner rink and program in Virginia: a low-cost, high-quality event that identifies players to invite to the Major Showcase in Worcester, MA. This sheet shows the players and teams we plan around and how much ice each format needs, so we can size the weekend together. Games are two 23-minute stop-time periods with referees and a scorekeeper, in 80-minute ice blocks (warmup, two periods, resurface); every team also gets one 60-minute practice.</p>

<div class="targets">
  <div class="tile"><div class="k">Players per team</div><div class="v">17</div><div class="s">9 forwards, 6 defense, 2 goalies</div></div>
  <div class="tile"><div class="k">Teams</div><div class="v">3 minimum, 4 target</div><div class="s">51 players at 3 teams, 68 at 4, up to 136 at 8</div></div>
  <div class="tile"><div class="k">Weekend footprint</div><div class="v">Sat + Sun, one sheet</div><div class="s">80-minute game blocks, 60-minute practices</div></div>
</div>

<h2>Ice demand by format (each team gets one 60-minute practice)</h2>
<table>
  <thead>
    <tr>
      <th>Teams</th><th class="num">Players</th><th class="num">Games each</th><th>Format</th><th class="num">Total games</th><th class="num">Practices</th><th class="num">Game ice (h)</th><th class="num">Practice ice (h)</th><th class="num">Total ice (h)</th><th class="num">Hours Sat / Sun</th>
    </tr>
  </thead>
  <tbody>
${tableRows}
  </tbody>
</table>

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
      <li>Ice in 80-minute game blocks plus 60-minute practice blocks, back to back on one sheet, with a rate per hour or a flat weekend package</li>
      <li>Two locker rooms per game, a scoreboard and clock, and a scorekeeper table</li>
      <li>A partner program to help fill rosters: coaches who bring players earn a referral commission</li>
    </ul>
  </div>
</div>

<p class="fine">Total ice is the sum of game blocks and practices. Hours Sat / Sun is the window we would book each day with no team playing back-to-back; where that rule leaves an open block a practice fills it${bookingNotes}. Round-robin games are split evenly across the two days; a placement round or playoff, if added, goes on Sunday after the last round-robin game. Every game uses two teams, so an odd product (3 teams at 3 games, 5 teams at 3 games) cannot be scheduled evenly; those counts step to 2 or 4 games.</p>
<div class="foot"><span>Hockey Night in Boston, since 1972 · PlayHNIB.com</span><span>Prepared ${today} with the HNIB Event Planner</span></div>
</body>
</html>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/hnib-satellite-ice-demand.html", html);
console.log("dist/hnib-satellite-ice-demand.html written,", rows.length, "rows");
