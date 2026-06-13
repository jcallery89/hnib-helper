# HNIB Tournament Expert - Project Guide

A browser-only tool for running HNIB summer festival competition: standings,
tiebreakers, playoff seeding, schedule generation, and an on-brand bracket
export. Static build, deployed to SiteGround `public_html`. See `README.md` for
build/deploy and the design rationale in `.claude/plans/` if present.

## Confirmed decisions (do not silently change)

- Point system: Win 2 / Tie 1 / Loss 0 (configurable in Setup).
- Plus/minus: uncapped. "Least Goals Allowed" ranks AHEAD of Plus/Minus.
- Minimum rest window: 120 minutes. Target games per team: 4.
- Auto-qualifier seeding: division winners take the top seeds (ranked among
  themselves by the playoff-seeding procedure), runners-up next (Jr. High);
  wildcards are the best of the rest. 8-team single elim, 1v8 / 4v5 / 2v7 / 3v6.

## Domain rules the engine encodes

Two tiebreaker procedures, kept distinct (`src/engine/tiebreak/`):

- **Divisional placing**: Head-to-Head, Least Goals Allowed, Best Plus/Minus, coin flip.
- **Playoff seeding** branches per (sub)group on whether the tied teams all
  played each other:
  - all played: Head-to-Head, then Least GA, Plus/Minus, coin flip.
  - not all played: Most Wins, then Least GA, Plus/Minus, coin flip.
- Head-to-Head is a mini-table among only the tied teams. When a team breaks out
  of a 3+ tie, the procedure RESTARTS for the rest (Head-to-Head recomputed).
- Every decision is logged/explainable; coin flips carry a timestamp.
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

Crossover pairing strategy, exact 2026 venue/dates, and whether the invite-only
Major Showcases want schedules/standings (no champion) from this tool.
