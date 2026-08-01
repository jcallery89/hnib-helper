# Dynamic Gravity Forms ballot - Boys Major Showcase

Coaches see live player stats in the ballot dropdowns. The pieces:

- `hnib-ballot-sync.php` - server-side sync. Pulls every roster and stat line
  from the Tourno API (hnib.app) and refreshes the `gf_boysmajor_rosters`
  MySQL table. Runs on the WordPress server, so browser CORS does not apply.
- `boys-major-ballot-form.json` - importable Gravity Forms form. Nomination
  style, same 3/2/1 structure as the Sophomore ballot: the coach picks their
  Team, and the player dropdowns (#1-#3 Forward, #1-#2 Defenseman, #1
  Goalie) then show only that team's roster, best-first with stats in every
  label. Wired with GP Populate Anything (GPPA, already installed - the
  Sophomore ballot uses it) reading the table above, so choices refresh on
  every page load. Player dropdowns are empty until a team is chosen - that
  is the chaining working, not a bug. Regenerate with
  `node wp/generate-form.mjs` if edits are needed.

Because GPPA stores the choice VALUE in entries - here a stable
`Last, First (Team #9)` key, not the stat label - stats can keep updating
after ballots are submitted without corrupting anything.

## Setup (one time, about 20 minutes)

1. Open `hnib-ballot-sync.php` and set `HNIB_SYNC_KEY` to a long random
   secret (the script refuses to run with the default). `HNIB_EVENT_ID` is
   already the 2026 Boys Major Showcase.
2. Upload the file to the WordPress ROOT folder - the one containing
   `wp-load.php` (on SiteGround usually `public_html/`). Note this is the
   WordPress site, not the `/tournament` tool folder.
3. Visit `https://YOUR-SITE/hnib-ballot-sync.php?key=YOUR-KEY` in a browser.
   You should get JSON like `{"ok":true,"teams":8,"players":160,...}`.
   Sanity-check the count against the tool's sync message, and spot-check
   rows in phpMyAdmin (`gf_boysmajor_rosters`).
4. Site Tools -> Devs -> Cron Jobs -> add:
   `curl -s "https://YOUR-SITE/hnib-ballot-sync.php?key=YOUR-KEY" >/dev/null`
   every 15 minutes. Remove the cron after the event.
5. WP admin -> Forms -> Import/Export -> Import Forms -> upload
   `boys-major-ballot-form.json`. If an earlier version of this form was
   already imported and has no real entries, trash it first - importing
   always creates a NEW form (new id), it never updates an existing one.
   Open the new form in the editor, click one player dropdown, and confirm
   the GPPA panel shows the table with a team_name filter pointing at the
   Team field.
6. Embed on an unlinked page with an Enfold Text Block:
   `[gravityform id="NN" title="false" description="false" ajax="true"]`
   (NN = the new form's id). Preview: pick a team, watch the dropdowns
   narrow to that roster, forwards sorted by points, goalie by SV%.
7. Test-submit once and check the entry stores values like
   `Sullivan, Jack (Middlesex #9)`.

## During the event

Nothing to do. The cron refreshes stats; every coach who opens the form sees
current numbers. To force a refresh, hit the sync URL manually.

## After ballots close

Forms -> Import/Export -> Export Entries (coach fields + all nominee
dropdowns). The stored `Last, First (Team #9)` values match players
unambiguously. Then in the HNIB tool's Ballot tab:

1. Tick **Nominated** for each player named in the entries (grouped by
   position, sorted by production, so they are easy to find).
2. Directors mark **Roster / Alternate** on the nominated group; add
   per-player notes as needed.
3. **Export nominated (CSV)** for the working list, and use the
   **Notification export** section (paste the registration export) to
   download the nominated players with parent and player contact columns.
   Contact details are used for that download only and are never saved in
   the app.

## Notes

- Do not edit the live form by re-importing JSON over it (that creates a
  duplicate form with a new id and breaks embeds) - tweak in the editor.
- The sync never wipes the table on a failed fetch: it only replaces rows
  after a full successful parse. Failed team fetches are listed in
  `skipped_teams`.
- To reuse for another event next year: change `HNIB_EVENT_ID` (and table
  name if you want to keep history), re-run, re-import a fresh form.
