# Session Brief - paste this into a new Claude Code session

This is a self-contained kickoff for the **HNIB Tournament Expert**. Paste the
whole file as your first message to a new Claude Code session (repo
`jcallery89/hnib-helper`). It has everything the agent needs to start; deeper
detail is in `HANDOFF.md` and `CLAUDE.md` (the latter auto-loads on the branch).

---

You are continuing work on the **HNIB Tournament Expert**, a browser-only Vite +
TypeScript + Preact app for running Hockey Night in Boston summer festivals
(standings, tiebreakers, playoff seeding + brackets, clinch/elimination
scenarios, player stats/recruiting cards, an All-Star ballot sync, and on-brand
social graphics). Static build, deployed to SiteGround. No backend; all event
data lives in the operator's browser (localStorage).

## First, get the baseline

All work lives on branch **`claude/stoic-babbage-toy386-xglxrh`** (repo
`jcallery89/hnib-helper`). `main` is empty - always work from the branch.

```bash
git fetch origin claude/stoic-babbage-toy386-xglxrh
git checkout claude/stoic-babbage-toy386-xglxrh   # or: git reset --hard origin/<branch> if the tree is empty
npm install
npm test          # expect ~129 passing
```

Read `HANDOFF.md` and `CLAUDE.md` for full context. Confirm the baseline (tests
pass, `npm run build` succeeds), then tell me and wait for my request.

## Ground rules (do not deviate)

- Develop, commit, and push ONLY to `claude/stoic-babbage-toy386-xglxrh`. Never
  push elsewhere without asking. Do NOT open a PR unless I ask.
- Keep the layers separate: `src/engine/` is PURE (no DOM/Preact/I/O),
  `src/render/`, `src/io/`, `src/ui/`. Tiebreak/engine changes need `test/` fixtures.
- Brand voice: no em dashes; no exclamation points in coach-facing copy.
- The build/dev environment CANNOT reach hnib.app (network policy). If you need
  live API JSON, ask me to paste it from a browser.
- Verify visually when it matters: render an SVG (preact-render-to-string) and
  rasterize the file with the bundled Chromium before claiming a graphic looks right.
- Build + test before committing: `npm run build && npm test`.

## Confirmed domain rules (do not silently change)

- Point system: Win 2 / Tie 1 / Loss 0 (configurable in Setup).
- ONE tiebreak procedure, both events: Points -> Most Wins -> Head-to-Head (only
  when exactly 2 tied) -> Goals Against (fewest) -> Goals For (most) -> coin flip
  (timestamped) -> director discretion. A 3+ tie restarts when a team breaks out.
- Seeding by event (`seedingRule` + `fieldSize` in Setup):
  - Jr. High: 2 divisions, 6-team field. Winners seeded 1-2; next two per division
    POOLED and ranked 3-6 (no wildcards; top 3 per division).
    `jrhigh_winners_next_two`, fieldSize 6. 6-team elim: 1-2 byes, play-ins 4v5 / 3v6.
  - Sophomore: 3 divisions, 8-team field. Winners 1-3, runners-up 4-6, 2 wildcards
    7-8. `jrhigh_top2_per_division`, fieldSize 8. 8-team elim: 1v8 / 4v5 / 2v7 / 3v6.

## What's here (tabs)

Results, Standings (CLINCHED/OUT tags), Scenarios (key scenarios + What-If),
Bracket (seed color bubbles + game times, PNG export), Schedule (generator +
rules text), Players (recruiting cards), Stats (All-Star flagging), Share
(seeding / playoff picture / tiebreakers / announcement / **Day Schedule** poster
combining all events), Setup (sync, divisions, event config, team colors, ballot
auto-sync, import/export).

## Deploy

Automatic: pushing to the branch runs `.github/workflows/deploy.yml`, which
FTPS-uploads `dist/` to SiteGround (needs repo secrets FTP_SERVER / FTP_USERNAME
/ FTP_PASSWORD). After deploy, flush SiteGround cache and hard-refresh. Manual
fallback: `npm run build`, upload `dist/` via File Manager.

## Handy facts

- 2025 Jr. High event id: `63655fc1-1db9-46a5-a948-44f63d297810`.
- Git commit trailers end with `Co-Authored-By: Claude <noreply@anthropic.com>`
  and a `Claude-Session:` link (keep the model id out of committed artifacts).
- All-Star ballot setup: `docs/ALL-STAR-BALLOT.md`.
