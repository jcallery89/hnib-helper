# HNIB Tournament Expert - Project Guide

A browser-only tool for running HNIB summer festival competition: standings,
tiebreakers, playoff seeding, schedule generation, and an on-brand bracket
export. Static build, deployed to SiteGround `public_html`. See `README.md` for
build/deploy and the design rationale in `.claude/plans/` if present.

## Confirmed decisions (do not silently change)

- Point system: Win 2 / Tie 1 / Loss 0 (configurable in Setup).
- Minimum rest window: 120 minutes. Target games per team: 4.
- Seeding differs by event (set via `seedingRule` + `fieldSize` in Setup):
  - Jr. High: 2 divisions (East/West), **6-team** field. Division winners are
    seeded 1-2; the **next two teams from each division are pooled** and ranked
    3-6 by the tiebreakers (NO wildcards - each division is capped at 3). 6-team
    single elim: seeds 1-2 bye, play-in 4v5 and 3v6.
    (`seedingRule: "jrhigh_winners_next_two"`, `fieldSize: 6`)
  - Sophomore: 3 divisions, **8-team** field. Division winners 1-3, runners-up
    4-6, then 2 wildcards (best of the rest) 7-8. 8-team single elim,
    1v8 / 4v5 / 2v7 / 3v6. (`seedingRule: "jrhigh_top2_per_division"`, fieldSize 8)
  - Girls Major Showcase: 5 divisions, **12-team** field. Top 2 per division
    (winners seeded 1-5, runners-up 6-10) then 2 wildcards 11-12. 12-team single
    elim: seeds 1-4 bye; Round 1 is 8v9 / 5v12 / 7v10 / 6v11 feeding QFs
    1 v W(8v9), 4 v W(5v12), 2 v W(7v10), 3 v W(6v11).
    (`seedingRule: "jrhigh_top2_per_division"`, fieldSize 12)
  - Jr. High and Sophomore share the ONE tiebreak procedure below. The Girls
    Major uses its own order (`tiebreakRule: "girls_major"`): Head-to-Head
    FIRST (still only when exactly two teams are tied), then Most Wins, fewest
    Goals Allowed, most Goals For, coin toss. Pooled tiers and wildcard fills
    are ranked by the event's procedure.

## Domain rules the engine encodes

ONE tie-breaking procedure (`src/engine/tiebreak/`), same for Jr. High and
Sophomore, applied to teams tied on points and to every seeding/placing step:

1. Points (the grouping). 2. Most Wins. 3. Head-to-Head - ONLY when exactly two
teams are tied (skipped for 3+). 4. Goals Against (fewest). 5. Goals For (most).
6. Coin flip. 7. Director discretion (manual; not automated).

- Head-to-Head is a mini-table among the tied teams; it is a no-op unless the
  group is exactly two. When a team breaks out of a 3+ tie the procedure
  RESTARTS for the rest, so a group that narrows to two then gets head-to-head.
- No plus/minus in tiebreaking (GA then GF). Every decision is
  logged/explainable; coin flips carry a timestamp.
- The Schedule page shows the seeding explanation + these rules
  (`src/engine/playoff/rules.ts`), scaled to the event's division count.
- Round robin allows ties (no OT). Playoff ties: prelim/QF/SF shootout; final is
  3-on-3 OT then shootout. `decidedBy` recorded.
- Unequal game counts are flagged rather than compared blindly.

## Multiple events at once

The tool is a multi-event workspace. Each synced/imported event is saved under
its own `localStorage` key with an index + active pointer (`src/io/session.ts`);
the header has an event switcher. A browser tab can be pinned to one event with
`?event=<id>`, so two festivals can run in two tabs concurrently, each with its
own auto-sync. `window` access is guarded so SSR/tests do not crash.

## Architecture rule (important)

`src/engine/` is pure and side-effect-free: no DOM, no Preact, no I/O. It takes
plain data and returns plain data so it stays portable (e.g. to Google Apps
Script). Keep rendering (`src/render/`), I/O (`src/io/`), and UI (`src/ui/`) in
their own layers. Tiebreak logic changes MUST come with fixtures in `test/`.

## Stack

Vite + TypeScript + Preact, Vitest, `html-to-image` for PNG export. Brand tokens
live in `src/styles/tokens.css` and `src/render/bracket/theme.ts` - dark navy
theme, never a light background. No em dashes; no exclamation points in
coach-facing copy.

## Still open (defaults in use, confirm before locking)

Crossover pairing strategy and exact 2026 venue/dates. (The Girls Major
Showcase playoff question is settled - see the 12-team format above.)
