# HNIB Tournament Expert - Project Handoff

A browser-only tool for running Hockey Night in Boston summer-festival competition:
schedules, standings, tiebreakers, playoff seeding, player stats and recruiting
cards, and an on-brand bracket export. Static build, deployed to SiteGround
`public_html`. No backend or database; all state lives in the browser.

Attach this file (and ideally `CLAUDE.md`) when starting a new session.

---

## How to run, build, deploy

```bash
npm install
npm run dev        # local dev server (http://localhost:5173)
npm test           # full test suite (vitest)
npm run build      # type-check + static bundle into dist/
```

**Deploy (SiteGround):** `npm run build`, then upload the contents of `dist/`
into `public_html/tournament` (or any folder) via Site Tools -> File Manager.
`base: './'` in `vite.config.ts` keeps asset paths relative so it works in any
folder. After uploading: **Site Tools -> Speed -> Caching -> Flush Cache**, then
hard-refresh (Ctrl+F5). `dist/` also contains `hnib-proxy.php`, an optional
read-only relay (see "Live sync").

Stack: Vite + TypeScript + Preact, Vitest, `html-to-image` for PNG export.
~115 tests currently pass.

`npm run build` also runs a second Vite build (`vite.planner.config.ts`) that
inlines everything into `dist/hnib-event-planner.html`, the standalone offline
event planner. `npm run build:planner` rebuilds just that file.

---

## Architecture (layers are kept separate on purpose)

- `src/engine/` - PURE, side-effect-free (no DOM, no Preact, no I/O). Portable
  (could be lifted into Google Apps Script).
  - `types.ts` - all data types (Event, Division, Team, Game, Player, etc.)
  - `standings.ts` - games -> standings (Win 2 / Tie 1 / Loss 0, configurable)
  - `tiebreak/` - the ONE tie-breaking procedure (see below)
  - `playoff/field.ts` - seeded 8-team field; `playoff/bracket.ts` - bracket;
    `playoff/rules.ts` - seeding + tiebreak rules text for the Schedule page
  - `schedule/` - Phase 1 matchups (circle method + crossovers) and Phase 2
    placement (greedy + local search), re-flow diff, fairness report
  - `players/summary.ts` - aggregate stat lines -> per-player summary;
    `players/writeup.ts` - generated scouting report text
  - `planner/` - the event planner: `format.ts` (teams x games -> pairings,
    pools, placement round, closest alternatives), `schedule.ts` (weekend grid:
    round robin, practices, playoffs, All-Star; no back-to-back; ice-fit
    check), `pnl.ts` (P&L, break-evens, sensitivity, family value),
    `defaults.ts` (Satellite / MA Festival / MA Showcase profiles), `text.ts`
    (copy summary, CSV)
- `src/render/` - SVG renderers + PNG export. `bracket/`, `player/PlayerCard.tsx`,
  `brand.ts` (bundled brand assets as data URLs), `exportImage.ts`.
- `src/io/` - data in/out. `dataset.ts` (the Dataset shape), `session.ts`
  (multi-event localStorage), `sampleData.ts`, CSV importers, the Tourno API
  importers and `sync.ts`. `plannerFromEvent.ts` derives a planner structure
  from a synced event; `plannerStore.ts` persists planner scenarios.
- `src/ui/` - Preact views (`views/*`) and `state/store.ts` (derived data).
  `ui/planner/PlannerApp.tsx` is the planner screen shared by the Planner tab
  and the standalone file (`src/planner-main.tsx` + `planner.html`).
- `src/styles/` - light theme tokens (matches the HNIB mobile app).
- `src/assets/brand/` - logo, card strips, watermark from the HNIB asset pack.
- `test/` - engine fixtures (tiebreak, field, schedule), importers, render smoke.

---

## The app (tabs)

Header has the event title, an **event switcher** (multi-event), and a sync
control bar with **"Results as of"** (a date/time cutoff for scenario analysis),
plus **Sync now / Auto-sync (3 min)** when the event was loaded from hnib.app.

- **Results** - enter round-robin scores; everything recomputes live.
- **Standings** - per-division ranked tables with explainable tiebreak notes.
- **Bracket** - seeded 8-team single elim; enter playoff results; export on-brand
  PNG (1080x1350 / 1920 / 1080).
- **Schedule** - generate a balanced schedule, re-flow under constraints, fairness
  report; the **playoff seeding + tie-breaking rules** are printed at the bottom.
- **Players** - per-team rosters; player card preview + PNG export; on-demand
  game log; editable scouting report.
- **Stats** - ALL players in sortable tables (skaters: GP/G/A/PTS; goalies:
  GP/GAA/SV%), team filter, **All-Star flagging** (star toggle) with an
  All-Star Pool and CSV export.
- **Planner** - the event planner (see `PLANNER_README.md`): scenarios side by
  side, weekend schedule grid, P&L with break-evens and fill sensitivity,
  family value, copy summary / CSV / print / JSON. "Seed from a past event"
  copies teams, rosters, games per team, days, sheets, block cadence, and
  playoff rounds from any synced event. Scenarios persist in localStorage.
- **Setup** - sync/import events, assign divisions, event settings, data
  reset/remove, CSV/JSON export, registration import.

---

## Domain rules (confirmed; do not silently change)

- Point system: Win 2 / Tie 1 / Loss 0.
- ONE tie-breaking procedure, same for Jr. High and Sophomore, applied to teams
  tied on points and to every seeding/placing step:
  1. Points (the grouping) 2. Most Wins 3. Head-to-Head - ONLY when exactly two
  teams are tied (skipped for 3+) 4. Goals Against (fewest) 5. Goals For (most)
  6. Coin flip (auto, timestamped) 7. Director discretion (manual, not automated).
  - Head-to-Head is a mini-table among the tied teams; no-op unless the group is
    exactly two. When a team breaks out of a 3+ tie the procedure RESTARTS for
    the rest, so a group that narrows to two then gets head-to-head.
  - No plus/minus in tiebreaking. Every decision is logged/explainable.
- Seeding: "top two per division" for both events. Division winners take the top
  tier, runners-up the next, wildcards the best of the rest. 2 divisions
  (Jr. High) -> seeds 1-2 / 3-4 / 5-8; 3 divisions (Sophomore) -> 1-3 / 4-6 / 7-8.
  Division count is data-driven. 8-team single elim, 1v8 / 4v5 / 2v7 / 3v6.
- Min rest window 120 min; target 4 games/team (scheduler).
- Round robin allows ties (no OT). Playoff ties: prelim/QF/SF shootout; final is
  3-on-3 OT then shootout; `decidedBy` recorded.

---

## Live data: the Tourno API (hnib.app)

The HNIB app is built on Tourno. Public read API at `https://hnib.app/api`:
`/event/{id}`, `/schedule/{eventId}`, `/teams/{eventId}`, `/standings/{eventId}`,
`/team/{teamId}`, `/player_profile/{id}`, `/game/{id}`, `/leaders/{eventId}`.

- **Setup -> Sync event** with the event UUID pulls schedule, scores, real team
  colors, exact playoff rounds (from each game's Description), divisions, every
  team roster with player stats, and the leaders board. The 2025 Jr. High event
  id is `63655fc1-1db9-46a5-a948-44f63d297810`.
- `src/io/sync.ts` tries the browser call first; if blocked (CORS) it falls back
  to `public/hnib-proxy.php` (a same-origin, whitelist-only GET relay) shipped in
  `dist/`. Re-sync PRESERVES all local work: playoff results, All-Star flags,
  scouting writeups, fetched game logs.
- Game logs (`/player_profile/{id}`) are fetched on demand per player.
- Cannot be reached from the build/dev environment (network policy), only from a
  real browser. To capture sample API JSON, open the URL in a browser.

---

## Data model & storage

- `Dataset` (`src/io/dataset.ts`): event, divisions, teams, games, plus optional
  `bracketResults`, `players`, `playerStats`, `leaders`, `playerGameLogs`,
  `playerWriteups`, `allStarIds`.
- `Player`: keyed by id; `jersey` is unique within a team, NOT globally. Has
  `birthYear` (the age-group differentiator), `position`, `shoots`, height/weight,
  `hometown`, `school`, optional `photoUrl`. `classYear` is legacy/fallback.
- **Multi-event** (`src/io/session.ts`): each event saved under its own
  localStorage key with an index + active pointer. Header switcher; a tab can be
  pinned to one event with `?event=<id>` so two festivals run in two tabs, each
  with its own auto-sync. `window` access is guarded for SSR/tests.

---

## Registration import (Setup or Players)

HNIB registration exports (one big multi-event CSV/TSV, or a single-event paste)
are matched to synced rosters by **team + jersey**, with last name as a safety
check. Detected by the "Event Team" column; an event picker appears only if the
file spans multiple events.

- Reads ONLY hockey fields: name, team, jersey, position, shoots, height, weight,
  hometown (city+state), school, and the YEAR from DOB (full DOB never stored).
  PII (emails, phones, addresses, payment) is never imported.
- Tab- and comma-delimited both work; the parser auto-detects the delimiter and
  treats a mid-field quote (the inch mark in 5'10") as literal.
- Validates fields; flags suspicious values (numeric hometown from a ZIP/City
  swap, out-of-range height/weight/birth year) and falls back to synced data.
- Match report shows enriched/created counts, name mismatches, unknown teams,
  unmatched roster spots, and flagged values.

---

## Player cards & brand

- Light theme matching the HNIB mobile app: white cards, royal-blue accents
  (#344eaa), deep navy text (#1c2660). Tokens in `src/styles/tokens.css` and
  `src/render/bracket/theme.ts`. Fonts: Teko (headings) + Barlow Condensed.
- Card: hero name + team-color chip + jersey number, bio strip (BORN year, POS,
  HT/WT, SHOOTS, HOMETOWN), GAME LOGS table (sized for up to 12 games), TOTALS
  row, SCOUTING REPORT, navy watermark, brand header/footer strips. Initials-
  circle placeholder until headshots arrive (`photoUrl`).
- Brand voice: no em dashes; no exclamation points in coach-facing copy.

---

## Known quirks / decisions

- The Tourno box score often reports GP as 0; the tool falls back to the team's
  completed-game count (overstates goalie GP since goalies split starts).
- Goalie GAA / SV% prefer the API's published rates (accurate for split starts).
- A player is treated as a goalie if position is "G" OR any stat line has goalie
  data (saves/shots/GA) - catches blank-position goalies.
- Sync controls only appear for events loaded by their hnib.app id (the Sync
  button sets that). JSON-paste/demo events show a hint instead.

---

## Open / possible next steps

- Planner: enter the real Worcester Ice Center ice rate (the MA profiles carry
  a $350/hour placeholder) and confirm satellite venue costs as they come in.
- All-Star roster builder from the flagged pool (balanced squads, exportable).
- Read divisions automatically from the standings page if needed.
- Headshots into the card avatar once registration provides photo URLs.
- Fuller AI-written scouting reports (needs an API key path; static site cannot
  safely hold a secret - would require a small server piece).
- CP-SAT scheduler upgrade (current Phase 2 is greedy + local search in JS).

---

## Git

Work is on branch `claude/stoic-babbage-toy386` (repo `jcallery89/hnib-helper`).
Build + test before committing: `npm run build && npm test`.
