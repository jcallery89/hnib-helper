# HNIB Tournament Expert

The operational brain for the competitive side of Hockey Night in Boston summer
festivals. It is data-in, results-out: feed it teams and game results and get
back standings, explainable tiebreak resolutions, the seeded 8-team playoff
field, a generated schedule, and a render-ready, on-brand bracket image.

It runs entirely in the browser - no server, no database - so the built bundle
drops straight onto SiteGround shared hosting.

## What it does

- **Standings** from game results using the confirmed point system (Win 2 / Tie
  1 / Loss 0, configurable).
- **Tiebreakers** with both HNIB procedures kept distinct:
  - Divisional placing: Head-to-Head, Least Goals Allowed, Best Plus/Minus, coin flip.
  - Playoff seeding: branches on whether the tied teams all played each other
    (Head-to-Head vs Most Wins), then Least Goals Allowed, Best Plus/Minus, coin flip.
  - Multi-team ties resolve as a mini-table and restart when a team breaks out.
  - Every decision is logged and explainable; coin flips carry a timestamp.
- **Playoff field**: division winners take the top seeds, runners-up next (Jr.
  High), wildcards are the best of the rest. Single elimination, 1v8 / 4v5 / 2v7 / 3v6.
- **Schedule generator**: Phase 1 builds a balanced round robin plus crossover
  games (4 per team); Phase 2 places them across the sheets honoring a minimum
  rest window (120 min). Add a constraint and re-solve - only the games that
  must move will move, and the diff is shown.
- **Bracket export**: on-brand SVG rendered to PNG at 1080x1350, 1080x1920, and
  1080x1080.

## Develop

```bash
npm install
npm run dev        # local dev server (http://localhost:5173)
npm test           # engine + render test suite
npm run build      # type-check + produce static bundle in dist/
```

The app boots on a bundled demo Jr. High event. Edit scores in **Results** and
watch **Standings**, the **Bracket** seeding, and tiebreak explanations update
live. Use **Schedule** to generate and re-flow a slate, and **Setup** to load
the sample, import/export results CSV, or change event settings.

## Deploy to SiteGround

The build is pure static files - no Node, PHP, or database on the server.

1. `npm run build`
2. Upload everything inside `dist/` to `public_html` (or a subfolder like
   `public_html/tournament/`) via SiteGround File Manager or SFTP.
3. Open the site. That is the entire deploy.

Asset paths are relative (`base: './'` in `vite.config.ts`), so it works at the
domain root or any subfolder with no `.htaccess` rewrites. All parsing,
computing, rendering, and PNG export happen in the browser, so there are no API
keys or outbound calls. Event data persists in the browser session
(localStorage) with CSV/JSON import-export for moving between machines.

## Architecture

- `src/engine/` - pure, side-effect-free engine (no DOM, no Preact, no I/O):
  types, standings, the tiebreak resolver, the playoff field/bracket builders,
  and the two-phase scheduler. This surface is portable - it can be lifted into
  Google Apps Script later for a Sheets pipeline.
- `src/render/bracket/` - SVG bracket component, layout geometry, brand tokens,
  and the PNG export.
- `src/io/` - sample data, CSV parse/serialize, session persistence.
- `src/ui/` - Preact views (Results, Standings, Bracket, Schedule, Setup) and
  derived state.
- `test/` - the tiebreak fixtures (both procedures, the all-played vs
  not-all-played branch, the multi-team reset, coin-flip timestamp), standings,
  playoff field, scheduler, and render smoke tests.

## Tech

Vite + TypeScript + Preact, tested with Vitest, PNG export via `html-to-image`.

Get Seen. Get Recruited. PlayHNIB.com.
