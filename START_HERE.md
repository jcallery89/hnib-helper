# Start Here - kicking off a new session

How to resume the HNIB Tournament Expert in a fresh Claude Code session.

## The one rule
All work lives on the branch **`claude/stoic-babbage-toy386-xglxrh`** (repo
`jcallery89/hnib-helper`). `main` is empty - a session that starts on `main`
will see nothing. Always work from the branch.

## Steps
1. Open a new session on **claude.ai/code** (or the app) and pick the repo
   **jcallery89/hnib-helper**.
2. If asked for a branch/base, choose **`claude/stoic-babbage-toy386-xglxrh`**.
3. Attach **HANDOFF.md** for full context. (CLAUDE.md auto-loads from the repo
   root once the branch is checked out.)
4. Paste the kickoff prompt below as your first message.
5. Wait for it to confirm the baseline (~129 tests passing), then ask for new work.

## Kickoff prompt (copy/paste)

> Continue work on the HNIB Tournament Expert. All existing work is on the branch
> `claude/stoic-babbage-toy386-xglxrh` (repo jcallery89/hnib-helper) - start by getting it:
> `git fetch origin claude/stoic-babbage-toy386-xglxrh` then `git checkout claude/stoic-babbage-toy386-xglxrh`
> (or `git reset --hard origin/claude/stoic-babbage-toy386-xglxrh` if the working tree is empty).
> Then run `npm install` and `npm test` to confirm the baseline (about 129 tests should pass).
> Read HANDOFF.md and CLAUDE.md for full context. Keep developing on this same branch,
> commit and push to it, and build the deployable site with `npm run build`.
> Once the tests pass, tell me and wait for my next request.

## Reminders
- Keep committing/pushing to `claude/stoic-babbage-toy386-xglxrh` so history stays in one place.
- Deploy is automatic: pushing to the branch runs the GitHub Action that FTPS-uploads
  `dist/` to SiteGround (needs the FTP_* repo secrets). Then flush SiteGround cache and
  hard-refresh. Manual fallback: `npm run build`, upload `dist/` via File Manager.
- Your tool data (events, scores, All-Star flags, colors, game times) lives in your
  browser on SiteGround, not in the code - starting a new chat never touches it.
- The 2025 Jr. High event id is `63655fc1-1db9-46a5-a948-44f63d297810`.
