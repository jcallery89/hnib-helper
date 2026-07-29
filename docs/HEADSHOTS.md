# Player Headshots

Player cards (and the video frame builder at `public/frame.html`) show real
headshots when a same-origin photo exists for the player; otherwise they fall
back to the initials circle.

## How it works

- Tourno stores photos in a public GCS bucket keyed by API player ID:
  `https://storage.googleapis.com/tourno-39a2a.appspot.com/players/profile/{playerId}.jpg`
  The ID in our data model IS the Tourno player ID (sync keeps it), so lookup
  is a straight key match.
- The bucket sends **no CORS headers**, so the browser cannot inline those URLs
  into PNG exports (`html-to-image` would fail / taint). Photos are therefore
  re-hosted **same-origin**: `headshots/{playerId}.jpg` next to `index.html`,
  indexed by `headshots/manifest.js` which defines `window.HNIB_HEADSHOTS`
  (loaded by `index.html` before the bundle; missing file is harmless).
- `src/io/headshots.ts` exposes `headshotFor(playerId)`;
  `src/ui/views/PlayersView.tsx` fills `player.photoUrl` from it when the
  roster/registration did not supply one. `PlayerCard` renders `photoUrl`
  clipped in the avatar circle and the export embeds it automatically.

## Rebuilding the folder

```bash
python scripts/fetch_headshots.py EVENT_ID
```

Downloads every bucket photo for the event's rosters into `public/headshots/`
(converting the ~25% of bucket files that are PNG bytes mislabeled as .jpg) and
regenerates `manifest.js` from the full folder, preserving photos already there
from other events. Needs network access to hnib.app + storage.googleapis.com -
run it locally, not in a sandboxed dev env without egress.

## Players the bucket does not have

For the 2026 Boys Major, 204/255 players had bucket photos. 33 more were
recovered by matching **name + date of birth** against prior events' rosters
(their photos were uploaded last year under old player IDs) and saved under
this year's IDs. 18 had no photo anywhere. The match audit lives OUTSIDE this
repo (see privacy note): `Boys Major Headshots/RECOVERED_HEADSHOTS.csv` and
`MISSING_HEADSHOTS.csv` in the desktop project folder, plus
`headshot-pipeline/` with the scan/match JSON.

Recipe for recovery matching (per event): collect candidate rosters from other
events via `/teams/{eventId}` + `/team/{teamId}`, pull DOBs from
`/player_profile/{playerId}`, match on exact name+DOB (flag nickname and
DOB-typo near-misses for human confirmation), then check matched OLD player IDs
against the bucket and save hits under the CURRENT event's player ID.

## Privacy - do not commit photos or PII

This repo is **public**. `public/headshots/` is gitignored on purpose: youth
player photos and any name+DOB matching data must not be committed. The photos
live only on the deployed server (and operators' local folders). Deploys must
upload `headshots/` alongside the built `dist/` output - a plain `dist/` deploy
without it silently reverts every card to initials.

## Deployment state (2026-07-29)

The live site (jamiecallery.com/tournament/) currently runs a **hand-patched
bundle** (`assets/index-hnib-hs2.js` - the pre-source-recovery equivalent of
`headshotFor`) plus the uploaded `headshots/` folder (237 photos) and
`frame.html`. The next `npm run build` deploy from this repo supersedes the
patched bundle; keep the server's `headshots/` folder, and note that
`public/frame.html` + `public/frame-assets/` replace the old frame.html that
referenced hashed asset filenames.
