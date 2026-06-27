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

If you want the ballot to track stats without you exporting and pasting, see
**`hnib-ballot-sync.php`** in this folder. It is a small same-origin endpoint
(same idea as the existing `hnib-proxy.php`) that receives the roster from the
app and writes `gf_soph_rosters` for you using WordPress's own database handle -
no separate database credentials, parameterized writes only.

This needs one code change in the app (have each auto-sync also POST the roster
to the endpoint, guarded by a shared secret). That change is **not wired up
yet** - ask and it can be added. The manual path above is the verified
default in the meantime.

---

## A question worth settling

The "#X **Overall** Forward" labels suggest event-wide bests, but the filter
restricts each dropdown to the coach's own team. Confirmed intent: **coaches
nominate only their own team's players.** If that ever changes (best across the
whole event or a division), the only edit is the GPPA filter on each player
field - the exported table already carries the data either way.
