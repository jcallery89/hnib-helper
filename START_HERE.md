# Start Here - kicking off a new session

How to resume the HNIB Tournament Expert in a fresh Claude Code session.

## The one rule
All work lives on the branch **`claude/stoic-babbage-toy386`** (repo
`jcallery89/hnib-helper`). `main` is empty - a session that starts on `main`
will see nothing. Always work from the branch.

## Steps
1. Open a new session on **claude.ai/code** (or the app) and pick the repo
   **jcallery89/hnib-helper**.
2. If asked for a branch/base, choose **`claude/stoic-babbage-toy386`**.
3. Attach **HANDOFF.md** for full context. (CLAUDE.md auto-loads from the repo
   root once the branch is checked out.)
4. Paste the kickoff prompt below as your first message.
5. Wait for it to confirm the baseline (~84 tests passing), then ask for new work.

## Kickoff prompt (copy/paste)

> Continue work on the HNIB Tournament Expert. All existing work is on the branch
> `claude/stoic-babbage-toy386` (repo jcallery89/hnib-helper) - start by getting it:
> `git fetch origin claude/stoic-babbage-toy386` then `git checkout claude/stoic-babbage-toy386`
> (or `git reset --hard origin/claude/stoic-babbage-toy386` if the working tree is empty).
> Then run `npm install` and `npm test` to confirm the baseline (about 84 tests should pass).
> Read HANDOFF.md and CLAUDE.md for full context. Keep developing on this same branch,
> commit and push to it, and build the deployable site with `npm run build`.
> Once the tests pass, tell me and wait for my next request.

## Reminders
- Keep committing/pushing to `claude/stoic-babbage-toy386` so history stays in one place.
- Every deploy: `npm run build`, then upload the contents of `dist/` to
  `public_html/tournament`, flush SiteGround cache, hard-refresh.
- Your tool data (events, scores, All-Star flags) lives in your browser on
  SiteGround, not in the code - starting a new chat never touches it.
- The 2026 Boys Major Showcase event id is `ebc5c5b9-9a1e-44f7-a6b8-466aefac97ee`.
- The 2025 Jr. High event id is `63655fc1-1db9-46a5-a948-44f63d297810`.
