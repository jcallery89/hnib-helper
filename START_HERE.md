# Start Here - kicking off a new session

How to resume the HNIB Tournament Expert in a fresh Claude Code session.

## The one rule
All work lives on the branch **`claude/all-star-ballot-system-pzj8x1`** (repo
`jcallery89/hnib-helper`). This branch contains EVERYTHING: earlier lines of
work (`claude/stoic-babbage-toy386*`, `claude/transparent-social-cards-gn5sou`)
were merged into it on 2026-08-01 - do not start from them, they are behind.
`main` is empty - a session that starts on `main` will see nothing.

## Steps
1. Open a new session on **claude.ai/code** (or the app) and pick the repo
   **jcallery89/hnib-helper**.
2. If asked for a branch/base, choose **`claude/all-star-ballot-system-pzj8x1`**.
3. Attach **HANDOFF.md** for full context. (CLAUDE.md auto-loads from the repo
   root once the branch is checked out.)
4. Paste the kickoff prompt below as your first message.
5. Wait for it to confirm the baseline (all tests passing), then ask for new work.

## Kickoff prompt (copy/paste)

> Continue work on the HNIB Tournament Expert. All existing work is on the branch
> `claude/all-star-ballot-system-pzj8x1` (repo jcallery89/hnib-helper) - start by getting it:
> `git fetch origin claude/all-star-ballot-system-pzj8x1` then `git checkout claude/all-star-ballot-system-pzj8x1`
> (or `git reset --hard origin/claude/all-star-ballot-system-pzj8x1` if the working tree is empty).
> Then run `npm install` and `npm test` to confirm the baseline (the full suite should pass).
> Read HANDOFF.md and CLAUDE.md for full context. Keep developing on this same branch,
> commit and push to it, and build the deployable site with `npm run build`.
> Once the tests pass, tell me and wait for my next request.

## Reminders
- Keep committing/pushing to `claude/all-star-ballot-system-pzj8x1` so history
  stays in one place. NEVER deploy from any other branch - a build from a
  stale branch uploaded to SiteGround removes whole tabs from the live app.
- Deploy is automatic: pushing to the branch runs the GitHub Action that FTPS-uploads
  `dist/` to SiteGround (needs the FTP_* repo secrets). Then flush SiteGround cache and
  hard-refresh. Manual fallback: `npm run build`, upload `dist/` via File Manager.
- Your tool data (events, scores, All-Star flags, colors, game times) lives in your
  browser on SiteGround, not in the code - starting a new chat never touches it.
- The 2026 Boys Major Showcase event id is `ebc5c5b9-9a1e-44f7-a6b8-466aefac97ee`.
- The 2025 Jr. High event id is `63655fc1-1db9-46a5-a948-44f63d297810`.
- The dynamic Gravity Forms ballot (live stats on hnibonline.com) is in `wp/` -
  see its README before touching the WordPress side.
