# HNIB Tournament Expert - Project Handoff

A browser-only tool for running Hockey Night in Boston summer-festival
competition: schedules, standings, tiebreakers, playoff seeding and brackets,
playoff clinch/elimination scenarios, player stats and recruiting cards, an
All-Star nomination ballot sync, and on-brand social graphics. Static build,
deployed to SiteGround `public_html`. No backend or database; all event data
lives in the operator's browser.

Attach this file (and `CLAUDE.md`) when starting a new dev session. For running
an event, jump to the **Operator runbook** near the bottom.

---

## 1. Run, build, deploy

```bash
npm install
npm run dev        # local dev server (http://localhost:5173)
npm test           # full test suite (vitest) - ~129 tests
npm run build      # type-check + static bundle into dist/
```

Stack: Vite + TypeScript + Preact, Vitest, `html-to-image` for PNG export.

**Deploy is automated.** A GitHub Action (`.github/workflows/deploy.yml`) builds
and FTPS-uploads `dist/` to SiteGround on every push to the working branch. It
only runs when the FTP secrets are set on the repo:

- `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (Settings -> Secrets and variables
  -> Actions). Never commit these.
- Target is the folder the site is served from (`server-dir` in the workflow).

**Manual deploy (fallback):** `npm run build`, then upload the contents of
`dist/` into the site folder via SiteGround Site Tools -> File Manager. `base:
'./'` in `vite.config.ts` keeps asset paths relative so any folder works.

**After any deploy:** SiteGround caches aggressively. Site Tools -> Speed ->
Caching -> **Flush Cache**, then hard-refresh (Ctrl/Cmd+Shift+R) or use an
incognito window.

---

## 2. Architecture (layers kept separate on purpose)

- **`src/engine/`** - PURE, side-effect-free (no DOM, no Preact, no I/O). Takes
  plain data, returns plain data, so it stays portable.
  - `types.ts` - all data types (Event, Division, Team, Game, Player, etc.).
  - `standings.ts` - games -> standings (Win 2 / Tie 1 / Loss 0, configurable).
  - `tiebreak/` - the ONE tie-breaking procedure (section 4).
  - `playoff/field.ts` - seeded field by `seedingRule` + `fieldSize`.
  - `playoff/bracket.ts` - 6- and 8-team single-elim bracket; `qfPairings()`.
  - `playoff/scenarios.ts` - clinch/eliminate engine + What-If forecast.
  - `playoff/rules.ts` - seeding + tiebreak rules text (scales to division count).
  - `playoff/shareCards.ts` - content for the share graphics.
  - `schedule/` - Phase 1 matchups (circle method + crossovers), Phase 2
    placement (greedy + local search), re-flow diff, fairness report.
  - `players/` - per-player summary + generated scouting writeup.
- **`src/render/`** - SVG renderers + PNG export.
  - `bracket/BracketSvg.tsx` + `layout.ts` - bracket graphic (seed color bubbles,
    game-time captions, grouped QF pairs).
  - `share/ShareCard.tsx` - the Instagram card layout (auto-fit body).
  - `schedule/SchedulePosterSvg.tsx` - combined day-schedule poster.
  - `player/PlayerCard.tsx` - recruiting card.
  - `brand.ts` - bundled brand assets as data URLs; `fontEmbed.ts` - inlines
    `@font-face` INTO the SVG so PNG exports keep Teko/Barlow (a rasterized SVG
    can't see page fonts).
  - `exportImage.ts` - node -> PNG.
- **`src/io/`** - data in/out. `dataset.ts` (the Dataset shape), `session.ts`
  (multi-event localStorage), `sampleData.ts`, CSV importers, the Tourno API
  importers (`importApi.ts`, `importApiPlayers.ts`), `sync.ts`, the ballot sync
  (`ballotSync.ts`, `ballotExport.ts`), and the schedule parsers
  (`importPlayoffApi.ts`, `importPlayoffSchedule.ts`, `importDaySchedule.ts`).
- **`src/ui/`** - Preact views (`views/*`) and `state/store.ts` (derived data).
- **`src/styles/`** - light theme tokens; `fonts.css` (base64 `@font-face`).
- **`public/`** - `hnib-ballot-sync.php`, `hnib-proxy.php` (shipped in `dist/`).
- **`test/`** - engine fixtures, importers, render smoke, scenario/schedule tests.

---

## 3. The app (tabs)

Header: event title, an **event switcher** (multi-event), and a control bar with
**"Results as of"** (a date/time cutoff for scenario analysis) plus **Sync now /
Auto-sync (3 min)** when the event was loaded from hnib.app.

- **Results** - enter round-robin scores; everything recomputes live.
- **Standings** - per-division ranked tables with explainable tiebreak notes;
  CLINCHED / OUT tags once the field is decided.
- **Scenarios** - "Key Scenarios" (each single result that clinches or eliminates
  a team, computed by enumerating remaining games) plus an interactive **What-If**
  (set hypothetical results, watch the seeds update). Shows the active playoff
  format so a mis-set event is self-diagnosing.
- **Bracket** - seeded single-elim (6 or 8 team). Seeds render as jersey-color
  bubbles; playoff game times show above each game. Enter playoff results; export
  on-brand PNG. See **Game times** (section 6).
- **Schedule** - generate a balanced schedule, re-flow under constraints, fairness
  report; the seeding + tie-breaking rules are printed at the bottom.
- **Players** - per-team rosters; player-card preview + PNG export; on-demand
  game log; editable scouting report.
- **Stats** - ALL players in sortable tables (skaters: GP/G/A/PTS; goalies:
  GP/GAA/SV%), team filter, **All-Star flagging** (star toggle) with an
  All-Star Pool and CSV export.
- **Ballot** - coaches ballot built for the Boys Major Showcase: by default
  every rostered player in the event is ballot-eligible (a pool switch can
  narrow it to the All-Star flags from Stats). Sections by position
  pre-sorted by production, configurable targets, one rank column per coach
  with Avg Rank + Votes (spreadsheet model), duplicate-rank warnings,
  directors' Final rank and Roster/Alternate calls, final roster summary.
  Exports: blank ballot CSV, results CSV, and per-position Gravity Forms
  choice lists ("Last, First - Team (GP-G-A-P)"). Engine logic in
  `src/engine/ballot/`; state in `Dataset.ballot`, preserved across re-sync.
  For the LIVE-STATS Gravity Forms ballot on hnibonline.com (GP Populate
  Anything reading a MySQL table refreshed from the API by a server-side
  cron), see `wp/` - sync PHP, importable form JSON, and the setup runbook.
- **Share** - on-brand graphics: **Playoff Seeding**, **Playoff Picture**
  (clinched / in the hunt / eliminated), **Tiebreakers**, **Announcement /
  Scenario** (free text), and **Day Schedule** (combines every event on a chosen
  day). Pick a size, export PNG.
- **Setup** - sync/import events, assign divisions, event settings (seeding rule,
  playoff teams, point system, playoff bracket on/off), team colors, ballot
  auto-sync, data reset/remove, CSV/JSON export, registration import.

---

## 4. Domain rules (confirmed; do not silently change)

- **Point system:** Win 2 / Tie 1 / Loss 0 (configurable in Setup).
- **ONE tie-breaking procedure** (`src/engine/tiebreak/`), same for Jr. High and
  Sophomore, applied to teams tied on points and to every seeding/placing step:
  1. Points (the grouping) 2. Most Wins 3. Head-to-Head - ONLY when exactly two
  teams are tied (skipped for 3+) 4. Goals Against (fewest) 5. Goals For (most)
  6. Coin flip (auto, timestamped) 7. Director discretion (manual, not automated).
  - Head-to-Head is a mini-table among the tied teams; a no-op unless the group
    is exactly two. When a team breaks out of a 3+ tie the procedure RESTARTS for
    the rest, so a group that narrows to two then gets head-to-head.
  - No plus/minus in tiebreaking (GA then GF). Every decision is logged/explainable.
- **Seeding differs by event** (set via `seedingRule` + `fieldSize` in Setup):
  - **Jr. High:** 2 divisions (East/West), **6-team** field. Division winners are
    seeded 1-2; the **next two teams from each division are pooled** and ranked
    3-6 by the tiebreakers. NO wildcards - each division is capped at 3 (top 3
    per division). 6-team single elim: seeds 1-2 get byes, play-ins are 4v5 and
    3v6. (`seedingRule: "jrhigh_winners_next_two"`, `fieldSize: 6`)
  - **Sophomore:** 3 divisions, **8-team** field. Division winners 1-3, runners-up
    4-6, then 2 wildcards (best of the rest) 7-8. 8-team single elim, 1v8 / 4v5 /
    2v7 / 3v6. (`seedingRule: "jrhigh_top2_per_division"`, `fieldSize: 8`)
  - A fresh sync auto-picks the rule by division count (2 -> Jr. High, else
    Sophomore). Events saved before that logic keep their old config, so an event
    showing the wrong field size needs Setup -> Event fixed by hand.
- Min rest window 120 min; target 4 games/team (scheduler).
- Round robin allows ties (no OT). Playoff ties: prelim/QF/SF shootout; final is
  3-on-3 OT then shootout; `decidedBy` recorded.

---

## 5. Live data: the Tourno API (hnib.app)

Public read API at `https://hnib.app/api`: `/event/{id}`, `/schedule/{eventId}`,
`/teams/{eventId}`, `/standings/{eventId}`, `/team/{teamId}` (has real colors,
`PrimaryRGB`), `/player_profile/{id}`, `/leaders/{eventId}`.

- **Setup -> Sync event** with the event UUID pulls schedule, scores, real team
  colors, exact playoff rounds (from each game's Description), divisions, every
  team roster with player stats, the leaders board, and **playoff game times**
  (section 6). Known event ids (also quick-pick buttons in Setup): 2026 Boys
  Major Showcase `ebc5c5b9-9a1e-44f7-a6b8-466aefac97ee`, 2025 Jr. High
  `63655fc1-1db9-46a5-a948-44f63d297810`.
- API docs are checked in under `docs/`: `TOURNO-API.md` (field-by-field
  reference with real observed shapes, date/time quirks, and playoff
  Description gotchas - the practical source of truth) and `tourno-api.html`
  (reverse-engineered OpenAPI spec; open in a browser, Redoc). Notables
  beyond what the tool consumes: `/game/{id}` returns a full box score with
  per-game player lines and a goal-by-goal ScoringSummary (scorer +
  assists), and `/search/{eventId}` finds players by name.
- Re-sync PRESERVES all local work: playoff results, ballot state, All-Star
  flags, scouting writeups, fetched game logs, team-color overrides, and
  hand-fixed game times. Any Dataset field the sync does not rebuild is
  carried forward by default (`src/io/sync.ts`), so new locally-owned fields
  survive without touching the preserve list.
- `src/io/sync.ts` calls the browser first; if blocked (CORS) it falls back to
  `public/hnib-proxy.php`, a same-origin whitelist-only GET relay shipped in
  `dist/`.
- Game logs (`/player_profile/{id}`) are fetched on demand per player.
- **The build/dev environment cannot reach hnib.app** (network policy). To
  capture sample API JSON, open the URL in a real browser and paste it.

**API shape note (playoffs):** the feed labels bracket games by `Description`
("Play-in 1/2", "Semi-Final 1/2"), with real seeded teams filled into the first
round and text winner refs ("Winner of Play-in 1") after. The championship is an
unlabeled "Game N" with empty teams (no "Championship" text), followed later by
the All-Star game. Round-robin games are "Game N" with real teams.

---

## 6. Playoff game times on the bracket

Two paths, both feeding `dataset.playoffSchedule` (keyed by bracket cell id
qf1..final):

1. **Automatic on sync** (`src/io/importPlayoffApi.ts` -> `extractPlayoffSlots`).
   Maps feed games to cells by the Description number (Play-in/Semi-Final N),
   and takes the championship as the earliest still-to-play game with no real
   teams (the later empty-team game is the All-Star and is ignored).
2. **Manual paste** (Bracket -> Game Times; `src/io/importPlayoffSchedule.ts`).
   Paste the master schedule rows; matched to cells by seed placeholders
   ("Soph 1st", "Jr High 4th") and winner refs ("W 43"). Hand-pasted times win
   over synced times and survive future syncs.

Caveat: auto-mapping is verified against a live **6-team** feed. The **8-team**
first-round labels are assumed to be "Quarterfinal N" / "Play-in N" in bracket
order; sanity-check a Sophomore bracket after sync, and use the paste box to
override if needed.

---

## 7. All-Star nomination ballot sync (Gravity Forms)

**Current approach (Boys Major 2026, live on hnibonline.com): `wp/`.** A
server-side PHP (`wp/hnib-ballot-sync.php`, uploaded to the WordPress root,
run by a SiteGround cron every 15 min) PULLS rosters + stats straight from the
hnib.app API and refreshes `gf_boysmajor_rosters`; the importable form
(`wp/boys-major-ballot-form.json`) reads it via Gravity Wiz "Populate
Anything" (GPPA) with team-chained dropdowns. No browser involvement at all.
See `wp/README.md` for the runbook.

**Legacy approach (Sophomore/Jr. High, superseded):** the tool could PUSH each
event's roster from the browser to a PHP endpoint on the WordPress site.

- **Setup -> All-Star ballot auto-sync**: enable it, set the endpoint URL and a
  shared token. Every sync then also pushes the roster. Leave this OFF for
  events using the `wp/` cron approach - the new endpoint rejects pushes.
- Endpoint template: `public/hnib-ballot-sync.php` (deployed as
  `hnibballotsync.php`). Token-gated, CORS-locked. Full setup in
  `docs/ALL-STAR-BALLOT.md`.
- Sophomore and Jr. High used separate ballot forms and tables
  (`gf_soph_rosters`, `gf_jrhigh_rosters`).

---

## 8. Data model & storage

- **`Dataset`** (`src/io/dataset.ts`): event, divisions, teams, games, plus
  optional `bracketResults`, `playoffSchedule`, `players`, `playerStats`,
  `leaders`, `playerGameLogs`, `playerWriteups`, `allStarIds`, `teamColors`,
  `ballot` (coaches-ballot state).
- **`HnibEvent`**: `seedingRule`, `fieldSize` (6 or 8), `hasPlayoffBracket`,
  `pointSystem`.
- **`Player`**: keyed by id; `jersey` unique within a team, NOT globally. Has
  `birthYear` (age-group differentiator; full DOB never stored), `position`, etc.
- **Multi-event** (`src/io/session.ts`): each event saved under its own
  localStorage key with an index + active pointer. Header switcher; a tab can be
  pinned with `?event=<id>` so two festivals run in two tabs, each auto-syncing.
  `window` access is guarded for SSR/tests.

---

## 9. Brand

- Light theme matching the HNIB mobile app: white cards, royal blue (#344eaa),
  deep navy text (#1c2660), gold accents (#d4a843). Tokens in
  `src/styles/tokens.css` and `src/render/bracket/theme.ts`.
- Fonts: Teko (headings) + Barlow Condensed (body), self-hosted as base64
  `@font-face` and inlined into export SVGs.
- **Brand voice: no em dashes; no exclamation points in coach-facing copy.**

---

## 10. Operator runbook (running an event day)

You do not need to touch code. Everything below is in the app.

1. **Load the event.** Setup -> Sync from hnib.app -> paste the event UUID ->
   Sync event. Assign teams into divisions if prompted.
2. **Confirm the format.** Setup -> Event: set **Seeding rule** and **Playoff
   teams** (Jr. High = 6 + "winners + next two per division"; Sophomore = 8 +
   "winners + runners-up + wildcards"). The Scenarios tab shows the active format
   as a sanity check.
3. **During round robin.** Turn on **Auto-sync (3 min)** in the control bar (or
   hit Sync now). Standings, tiebreaks, and the bracket update live. Team colors
   come from the API; fix any in Setup -> Team Colors.
4. **Track the race.** Standings shows CLINCHED / OUT. Scenarios shows what each
   remaining game locks in, and the What-If box answers "if X beats Y, is Z out?"
5. **Post graphics.** Share tab: Playoff Seeding, Playoff Picture, Tiebreakers,
   or a free-text Announcement. For a whole-day poster combining both events, use
   **Day Schedule** and paste the master schedule.
6. **Playoff day.** The Bracket seeds fill in from results; game times appear
   automatically on sync (or paste them in Bracket -> Game Times). Enter playoff
   scores to advance teams; export the bracket PNG at your chosen size.
7. **All-Star ballot.** If enabled (Setup), every sync also refreshes the ballot
   so coaches vote on live rosters. See `docs/ALL-STAR-BALLOT.md`.

Your event data (scores, flags, colors, times) lives in your browser, not in the
code. Starting a new chat or redeploying never touches it. Two festivals at once:
open each in its own tab with `?event=<id>` in the address.

---

## 11. Known quirks / decisions

- Tourno box scores often report GP as 0; the tool falls back to the team's
  completed-game count (overstates goalie GP since goalies split starts). Goalie
  GAA / SV% prefer the API's published rates.
- A player is treated as a goalie if position is "G" OR any stat line has goalie
  data - catches blank-position goalies.
- Sync controls only appear for events loaded by their hnib.app id. JSON-paste /
  demo events show a hint instead.
- Playoff games with placeholder teams are skipped by the roster/standings import
  but their TIMES are captured separately (section 6).

---

## 12. Open / possible next steps

- Balanced All-Star game squads from the flagged pool (the coaches ballot and
  final at-large roster are built; see the Ballot tab).
- Read divisions automatically from the standings page if needed.
- Headshots into the card avatar once registration provides photo URLs.
- Confirm 8-team playoff game-time auto-mapping against a live Sophomore feed.
- Fuller AI-written scouting reports (needs an API key path; static site cannot
  safely hold a secret - would require a small server piece).
- CP-SAT scheduler upgrade (current Phase 2 is greedy + local search in JS).

---

## 13. Git

Work lives on branch **`claude/all-star-ballot-system-pzj8x1`** (repo
`jcallery89/hnib-helper`). Earlier branches (`claude/stoic-babbage-toy386*`,
`claude/transparent-social-cards-gn5sou`) were merged into it on 2026-08-01 and
are behind - never build or deploy from them. `main` is empty. Build and test
before committing: `npm run build && npm test`. Pushing the branch triggers the
FTPS deploy GitHub Action. Do not create PRs unless asked. See `START_HERE.md`
for the new-session kickoff prompt.
