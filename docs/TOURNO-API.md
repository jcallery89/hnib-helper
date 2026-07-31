# HNIB / Tourno API Reference

How to read schedule (dates and times), divisions, rosters, stats, and playoff
structure from the Hockey Night in Boston event platform. The HNIB app is built
on **Tourno**; this is its public, read-only JSON API. Hand this file to another
chat as the single source of truth for pulling event data.

- **Base URL:** `https://hnib.app/api`
- **Auth:** none. All endpoints are public GET requests.
- **Format:** JSON. Every endpoint returns either a top-level object or array
  (details per endpoint below).
- **Event id:** a UUID, e.g. `63655fc1-1db9-46a5-a948-44f63d297810` (2025 Jr.
  High). It's the `eventId` in every URL below. Player and team ids are also
  UUID-like strings.
- **Read-only:** there are no write endpoints. You cannot post scores or rosters.

> CORS note: a browser on another domain may be blocked from calling `hnib.app`
> directly. If so, proxy the GET through a same-origin relay (the HNIB tool ships
> `hnib-proxy.php`, a whitelist-only GET passthrough). Server-side / curl calls
> are not subject to CORS.

---

## Endpoints at a glance

| Purpose | Endpoint |
| --- | --- |
| Schedule + scores + times | `GET /schedule/{eventId}` |
| Divisions + team roster codes + coaches | `GET /teams/{eventId}` |
| One team: roster + cumulative box stats + colors | `GET /team/{teamId}` |
| Event stat leaders | `GET /leaders/{eventId}` |
| One player's game-by-game lines | `GET /player_profile/{playerId}` |

Other paths exist on the platform (`/event/{id}`, `/standings/{eventId}`,
`/game/{id}`) but the five above cover schedule, standings inputs, rosters, and
stats. Standings are normally computed from `/schedule` results rather than read
from `/standings`.

---

## 1. Schedule (dates, times, scores, playoff structure)

`GET /schedule/{eventId}`

Returns `{ "Games": [ ... ] }` (an object with a `Games` array). Each game:

| Field | Type | Notes |
| --- | --- | --- |
| `GameID` | string | Stable UUID. |
| `Description` | string | Round label. See "Reading the round" below. |
| `Status` | string | `"FINAL"` or `"SCHEDULED"`. |
| `Date` | string | ISO with a trailing `Z`, e.g. `2026-06-29T12:00:00Z`. **The `Z` is cosmetic** - it is the local wall-clock time, not UTC. See "Dates and times". |
| `Time` | string | Display time, e.g. `"12:00 PM"`. Matches `Date`'s wall clock. |
| `Location` | string | Full venue, e.g. `"Worcester Ice Center - Lamacchia"`. |
| `LocationCode` | string | Short code, e.g. `"WIC-LAM"`, `"WIC-MGH"`. |
| `HomeTeamName` | string | Empty until the team is determined (playoffs). |
| `HomeTeamCode` | string | Short team code; empty for undetermined slots. |
| `HomeTeamPlaceholder` | string | Fills in when the team is unknown, e.g. `"Winner of Play-in 1"`. Often empty even for playoff games. |
| `HomeTeamPrimaryRGB` / `HomeTeamSecondaryRGB` | string | Hex like `"#0033a0"`. These are schedule-feed brand shades; for a team's real colors use `/team/{id}` (see note in section 3). |
| `HomeTeamScore` | number | `0` when not played. |
| `AwayTeamName` / `AwayTeamCode` / `AwayTeamPlaceholder` / `AwayTeam*RGB` / `AwayTeamScore` | | Same shape as Home. |

### Example (a round-robin game and a playoff game)

```json
{ "Games": [
  {
    "GameID": "8e0fb084-7d3c-465e-9c84-e2b922f7d62a",
    "Description": "Game 1",
    "Status": "FINAL",
    "Date": "2026-06-26T11:30:00Z",
    "Time": "11:30 AM",
    "Location": "Worcester Ice Center - Lamacchia",
    "LocationCode": "WIC-LAM",
    "HomeTeamName": "Eastern", "HomeTeamCode": "Eastern", "HomeTeamScore": 1,
    "AwayTeamName": "Suburban", "AwayTeamCode": "Suburban", "AwayTeamScore": 1
  },
  {
    "GameID": "313997dd-6745-415b-a88a-beed394ff6fa",
    "Description": "Semi-Final 1",
    "Status": "SCHEDULED",
    "Date": "2026-06-29T12:00:00Z",
    "Time": "12:00 PM",
    "Location": "Worcester Ice Center - Lamacchia",
    "LocationCode": "WIC-LAM",
    "HomeTeamName": "Western", "HomeTeamCode": "Western", "HomeTeamScore": 0,
    "AwayTeamName": "", "AwayTeamPlaceholder": "Winner of Play-in 1", "AwayTeamScore": 0
  }
] }
```

### Dates and times

- `Date` looks like UTC (`...T12:00:00Z`) but is really the **local wall-clock**
  time; `Time` confirms it (`"12:00 PM"`). Do **not** convert timezones. Read the
  clock time straight off either field.
- To get a clean naive timestamp, strip the `Z`:
  `"2026-06-29T12:00:00Z"` -> `"2026-06-29T12:00:00"`.
- To get a nice rink name from `Location`, take the part after `" - "`:
  `"Worcester Ice Center - Lamacchia"` -> `"Lamacchia"`.

### Reading the round from `Description`

There is no numeric round field; classify from `Description` (case-insensitive):

| `Description` matches | Round |
| --- | --- |
| `all-star`, `all star`, `exhibition` | skip (not a bracket game) |
| `championship`, or `final` but NOT `semi` | Final / Championship |
| `semi` (e.g. `"Semi-Final 1"`) | Semifinal |
| `playoff`, `quarter`, `qf`, `play-in`, `play in` | Quarterfinal / Play-in |
| `prelim` | Preliminary |
| `game N`, `round robin`, `rr`, or anything else | Round robin |

### Playoff structure gotchas (important)

Observed on a live 6-team bracket:

- First-round games are labeled `"Play-in 1"`, `"Play-in 2"` (or
  `"Quarterfinal N"` for larger fields) and carry the **real seeded teams** in
  `HomeTeamName` / `AwayTeamName`.
- Semifinals are `"Semi-Final 1"`, `"Semi-Final 2"`, with the bye team named and
  the other side a text placeholder (`"Winner of Play-in 1"`).
- The **championship has no distinct label** - it appears as an unlabeled
  `"Game 21"` with **empty team names/codes**. The All-Star game is a later
  unlabeled `"Game 22"`, also empty. They are told apart only by time (the
  championship is earlier). Round-robin `"Game N"` entries always have real teams,
  so a `"Game N"` with empty teams is a bracket placeholder, not round robin.
- Numbering aligns with the bracket halves: `Play-in 1` / `Semi-Final 1` are the
  top half; `... 2` the bottom half.

---

## 2. Divisions + team codes + coaches

`GET /teams/{eventId}`

Returns either an array of divisions or `{ "Divisions": [ ... ] }`. Each division:

| Field | Type | Notes |
| --- | --- | --- |
| `ID` | string | Division id. |
| `Name` | string | e.g. `"EAST"`, `"WEST"`. |
| `Teams` | array | Members. Each: `Code` (matches the schedule's `HomeTeamCode`), `ID` (team id for `/team/{id}`), `Name`, `Coach`. |

Use this to group teams into divisions and to get each team's `ID` for the roster
call. If it fails, teams can still be read from the schedule (by code) and
divided by hand.

---

## 3. One team: roster + cumulative stats + real colors

`GET /team/{teamId}` (use a team `ID` from `/teams`)

Returns one team object:

| Field | Notes |
| --- | --- |
| `ID`, `Name` | Team identity. |
| `PrimaryRGB`, `SecondaryRGB` | The team's **real** colors (hex `#rrggbb`, or an `r,g,b` triple). Prefer these over the schedule feed's shades. |
| `Players` | Roster. Each: `ID`, `FirstName`, `LastName`, `Number` (jersey), `Height`, `Shot`, `Position`, `BirthYear` / `Dob`, `Hometown`, `SchoolYear`. |
| `BoxPlayers` | Cumulative stat lines. Each: `ID`, `Name`, `Number`, `Position`, `Goals`, `Assists`, `Points`, `Shots`, `Saves`, `GP`, `GAA`, `SVPCT`. |

Notes:
- Join `BoxPlayers` to `Players` by `ID` first, then by jersey `Number`.
- **Goalies:** treat a player as a goalie if `Position` is `"G"` or the box line
  has goalie data (`Saves`/`Shots`). Goals-against = `Shots - Saves`. Prefer the
  published `GAA` / `SVPCT` when present (accurate for split starts).
- `GP` is often `0` in the box score; if you need games played, fall back to the
  team's completed-game count (note this overstates goalie GP).
- Only a birth **year** is meaningful for age grouping; do not store full DOB.

---

## 4. Event stat leaders

`GET /leaders/{eventId}`

Returns an object of category -> array:
`{ "Goals": [...], "Assists": [...], "Points": [...], "PIM": [...], "GAA": [...], "SavePct": [...] }`.

Each entry: `PlayerID`, `FirstName`, `LastName`, `Number`, `Position`, `Team`,
and the category value (`Goals` / `Assists` / `Points` / `Pim` / `Gaa` /
`SavePct`).

---

## 5. One player's game-by-game log

`GET /player_profile/{playerId}` (use a player `ID` from a roster)

Returns `{ "Stats": [ ... ] }`, one line per opponent played. Each line:
`Opponent`, `Goals`, `Assists`, `Points`, `PIM`, `Shots`, `Saves`. If `Points`
is missing, compute `Goals + Assists`. Fetch these on demand (one request per
player); a full event can be well over a hundred players.

---

## Recipes

**Tomorrow's schedule with times and rinks**
1. `GET /schedule/{eventId}`.
2. For each game in `Games`: read `Time` (or strip the `Z` off `Date`),
   `Location` (take the part after `" - "` for a short rink), the matchup from
   `HomeTeamName` / `AwayTeamName` (or the `*Placeholder` when empty), and the
   round from `Description`.
3. Filter by the date portion of `Date` for one day.

**Full standings inputs**
1. `GET /schedule/{eventId}`, keep games where `Status === "FINAL"` and
   `Description` classifies as round robin.
2. Points from scores (HNIB: Win 2 / Tie 1 / Loss 0).

**Rosters with live stats (e.g. for a ballot or cards)**
1. `GET /teams/{eventId}` -> each team's `ID`.
2. `GET /team/{ID}` per team -> `Players` + `BoxPlayers`, joined by id/number.

---

## Environment caveat

Some sandboxes/CI cannot reach `hnib.app` (network policy) - a direct fetch there
returns a connection/403 error. In that case, ask a human to open the URL in a
browser and paste the JSON, or route through the site's `hnib-proxy.php`. Nothing
about the data shapes above changes; only how you fetch it.
