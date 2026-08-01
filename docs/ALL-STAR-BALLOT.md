# All-Star Ballot - syncing roster data into Gravity Forms

How to feed live tournament data (names, jersey numbers, stats) into the
Gravity Forms All-Star ballot so coaches see who they are voting for, and so you
never hand-build the roster table again.

---

## How last year's ballot worked

The "Sophomore All-Star Ballot" (Gravity Forms form **id 41**) uses the
**Gravity Wiz "Populate Anything" (GPPA)** add-on. Every dropdown is populated
from a **custom database table in your WordPress database named
`gf_soph_rosters`**. Last year that table had only two useful columns,
`team_name` and `player_name`:

- **Team** (field 13) -> the distinct list of `team_name` values.
- **#1/#2/#3 Overall Forward** (16/17/18), **#1/#2 Overall Defenseman**
  (20/19), **#1 Overall Goalie** (21) -> `player_name`, **filtered to
  `team_name = the team the coach picked`**, sorted by name.

So a coach picks their team, then nominates players from that same team. The
"manual crap" was (1) rebuilding/repopulating `gf_soph_rosters` by hand each
year, and (2) the dropdown showed only a bare name - no jersey, no stats.

> Note: those `Social Media / Advertisement / Word of Mouth / Other` entries
> still sitting in the player fields are leftover junk from the
> `webinar_registration` template GPPA overrides at runtime. Harmless, but you
> can delete them.

---

## What the app now gives you

On the **Stats** tab there are two new buttons under **All-Star Ballot (Gravity
Forms)**:

- **Ballot roster (SQL)** - a complete `.sql` file: it creates the table if
  needed, clears it, and re-inserts every player on the active event. Paste it
  into phpMyAdmin and the ballot is refreshed in one shot.
- **Ballot roster (CSV)** - the same data as a CSV, for a CSV-to-table import.

Both include far more than last year's two columns:

| Column        | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| `player_id`   | Stable id (primary key); survives name spelling changes |
| `team_name`   | Team (the filter the Team dropdown uses)             |
| `player_name` | "First Last"                                         |
| `jersey`      | Jersey number ("" if unknown)                        |
| `position`    | F / D / G                                            |
| `gp g a pts`  | Skater stats                                         |
| `gaa svpct`   | Goalie rates (blank for skaters)                     |
| `display`     | Ready-made dropdown label, e.g. `#12 Jane Smith - 4GP 3G 5A 8P` |

The table name is derived from the event ("Sophomore" -> `gf_soph_rosters`,
"Jr. High" -> `gf_jrhigh_rosters`). Each age group gets its own table and its
own ballot form.

---

## One-time form setup (do this once)

You only need to touch the GPPA settings once; after that you just refresh the
table data each year.

### 1. Let the new columns land

The first time you run the **Ballot roster (SQL)** export and paste it into
phpMyAdmin, it `CREATE`s the wider table (or adds rows to your existing one).
If your existing `gf_soph_rosters` is narrower, either drop it first (the SQL
recreates it) or add the missing columns - the export's `CREATE TABLE`
statement lists the exact schema.

### 2. Upgrade the dropdown label (the big quality-of-life win)

For each player field (16, 17, 18, 19, 20, 21), open
**Field -> Populate Anything -> Choices**:

- **Label Template:** `{display}`  ->  the coach now sees
  `#12 Jane Smith - 4GP 3G 5A 8P` instead of a bare name.
- **Value Template:** `{player_name}`  ->  keeps the submission email readable
  (matches last year). Use `{player_id}` instead if you would rather store a
  stable id.
- Keep the existing **Filter:** `team_name is {Team (field 13)}`.

### 3. (Recommended) two small filters

While you are in each field's Populate Anything settings:

- **Position filter** so goalies do not appear in the forward/defense lists and
  vice versa: add `position is F` on the three forward slots, `position is D`
  on the two defense slots, `position is G` on the goalie slot.
- **No duplicate picks:** turn on GPPA's "exclude values already selected in
  other fields" so a coach cannot pick the same player as #1 and #2.

### 4. Sanity-check positions

The position filters depend on every player having an F/D/G position. If some
players come through with a blank position, fix it in the source (registration
import on the Players tab, or the roster on hnib.app) before exporting.

---

## Each year / during the tournament: refreshing the data

### Manual (works today, nothing to install)

1. Open the event in the app, **Sync** so stats are current.
2. **Stats tab -> Ballot roster (SQL)**.
3. **Site Tools -> Devs -> phpMyAdmin**, pick the WordPress database, open the
   **SQL** tab, paste, **Go**.

Re-run whenever you want the ballot to reflect updated stats. Takes about a
minute.

### Automatic (set up once, then hands-off)

The app can push the roster on every sync so you never touch phpMyAdmin during
the event. Two pieces:

1. **Deploy the endpoint where WordPress lives.** `hnib-ballot-sync.php` ships in
   the build (it is in `public/`, so it lands in `dist/`), but it can only write
   the ballot table from inside the WordPress site that owns that database. Put
   it on the **Gravity Forms site**, not necessarily with the app. Open it once
   and set `BALLOT_SYNC_TOKEN` to a long random string; confirm `WP_LOAD_PATH`
   reaches that site's `wp-load.php` and that `ALLOWED_TABLES` lists the exact
   bare table names GPPA reads (e.g. `gf_soph_rosters`). It writes through
   WordPress's own database handle (`$wpdb`) - no separate credentials,
   parameterized writes only - and only accepts requests carrying the token.

2. **Turn it on in the app.** Setup tab -> **All-Star ballot auto-sync**: tick
   "Push roster to the ballot on every sync", set the **Endpoint URL** and the
   **Shared token** (the same string you put in the PHP file), then **Test push
   now** to confirm. From then on, every Sync now and every Auto-sync (3 min)
   also refreshes the ballot table. A push failure never breaks the sync - it
   just notes "ballot push failed" in the status line.

### Same site vs different domains

- **App and WordPress on the same site** (e.g. app at `hnibonline.com/tournament`,
  WordPress at `hnibonline.com`): simplest. Endpoint URL stays `./hnib-ballot-sync.php`,
  leave `ALLOWED_ORIGIN` empty - no CORS involved.
- **App on a different domain** (e.g. app at `jamiecallery.com/tournament`,
  WordPress at `hnibonline.com`): put the PHP on **hnibonline.com**, set the
  app's Endpoint URL to the full `https://hnibonline.com/hnib-ballot-sync.php`,
  and set `ALLOWED_ORIGIN` in the PHP to the app's origin
  (`https://jamiecallery.com`) so the browser allows the cross-site POST.

Hosting the helper on the same site as the ballot is the least fiddly option. The
manual SQL/CSV path above still works any time regardless of where the app lives -
phpMyAdmin reaches the WordPress database directly, so the domain split does not
matter there.

### Keeping a business-critical WordPress site safe

The endpoint can write your database, so treat it like any write endpoint. Its
containment, in layers:

- **Token first.** The shared secret is checked before any database work and
  before WordPress is loaded, so requests without it get a `401` and touch
  nothing.
- **Table allowlist.** It only ever writes the tables in `ALLOWED_TABLES`
  (the ballot lookup tables). It cannot reach `wp_posts`, `wp_users`, or other
  Gravity Forms tables - those live elsewhere. Never add a core or
  Gravity-Forms-managed table to that list.
- **Parameterized writes.** Row content is bound, never concatenated into SQL,
  and the table name must match both the allowlist and a plain-identifier shape.

**Worst case** if the token leaks: someone can overwrite or empty the two ballot
lookup tables - which you rebuild instantly by pushing again. Other forms and the
rest of the site are not in reach.

**Two database modes** (top of `hnib-ballot-sync.php`):

- **Mode A (recommended for a critical site):** point it at a dedicated MySQL
  user `GRANT`ed `SELECT, INSERT, DELETE` on only the ballot tables. The script
  then never loads WordPress, and the database itself - not just the code -
  refuses any access beyond those tables. This is the strongest guarantee that a
  bug or a stolen token cannot affect other Gravity Forms.
- **Mode B (fallback):** uses WordPress's `$wpdb`. No credentials in the file,
  but the script then carries WordPress-level database rights, so the allowlist
  is the only wall. Fine, but Mode A is safer.

**Operational hygiene either way:** use a long random token and rotate it after
the festival; serve everything over HTTPS; back up the database before the first
real push; and remember the token sits in the operator's browser, so only enable
auto-sync on a machine you trust. If you want maximum caution, skip the endpoint
entirely and use the manual SQL/CSV path - it adds no code to the production site.

---

## A question worth settling

The "#X **Overall** Forward" labels suggest event-wide bests, but the filter
restricts each dropdown to the coach's own team. Confirmed intent: **coaches
nominate only their own team's players.** If that ever changes (best across the
whole event or a division), the only edit is the GPPA filter on each player
field - the exported table already carries the data either way.
