# HNIB Event Planner and P&L Calculator

A planning tool for pricing and scheduling an HNIB weekend event: satellite
events at partner rinks outside Massachusetts, and festivals and showcases at
Worcester Ice Center. Change any input and the schedule grid, the profit and
loss, and the family value view update immediately.

It ships two ways, from the same code:

- **`hnib-event-planner.html`**: one self-contained file. Double-click it on
  any Windows or Mac machine; it works offline and never contacts a server.
  Nothing is stored in the browser, so save your work with the
  "Save scenarios (JSON)" button.
- **The Planner tab of the HNIB Tournament Expert** (the tournament site).
  Same screen, but scenarios are remembered in the browser and the event
  structure can be seeded from any synced past event.

## Opening it

1. Open `hnib-event-planner.html` (or the Planner tab).
2. The file opens on the Virginia test case: four scenarios side by side
   ("4 games, no practice", "3 games + 60 min practice", "4 games + playoffs",
   "3 games + All-Star"), all four teams at $299.
3. Click a scenario chip to work on it. "+ Satellite", "+ MA Festival", and
   "+ MA Showcase" add a fresh scenario from that profile's defaults;
   "Duplicate" copies the current one so you can change one thing.

## Profiles

| Profile | Defaults |
| --- | --- |
| Satellite | 4 teams, 9 F / 6 D / 2 G, 4 games, Saturday and Sunday 7:00 AM to 10:00 PM, one sheet, 80-minute blocks, $299, ice $350/hour, 2 refs at $60, scorekeeper $40, coach $300, travel $800, lodging $600, marketing $200, misc $250 |
| MA Festival | 8 teams, 4 games plus an eight-team bracket, Friday to Sunday 8:00 AM to 8:00 PM, two sheets, 105-minute blocks, $379, no travel or lodging |
| MA Showcase | Same structure as the festival at $479 |

The Worcester ice rate in the MA profiles is a placeholder. Enter the contract
number (or the flat weekend package price) before trusting the MA margins.

## Inputs

**Event structure**: teams (2 to 12 checked; 3, 4, 6, 8 pre-verified), roster
by position, guaranteed games per team, format, playoff games, All-Star game,
practice per team, days, first and last ice, sheets, game block length, buffer,
rest blocks, and stop-time minutes per game.

- *Format* "Automatic" picks the best exact format. You can force a single or
  double round robin, a partial round robin, two pools plus crossover, or a
  round robin plus a placement round.
- *Rest blocks* is how many idle blocks a team gets between its games. 1 means
  no back-to-back games (the default). On one sheet with four teams that
  forces open blocks in the grid; set it to 0 to allow back-to-back and
  compress the ice.
- *Game block* should match the increment the rink sells ice in (80 minutes
  covers warmup, two 23-minute stop-time periods, and the resurface).

**Costs**: ice per hour (billed for the booked span including open gaps, or
for active blocks only), an optional flat weekend package or rink minimum,
referees per game and rate, scorekeeper per game, coach pay per team, coach
referral commission (on/off, amount, players referred per team), jersey, app
profile and insurance per player, card processing (percent plus flat, and the
share of families paying by card), and each event fixed cost on its own line.

**Pricing**: price per player, optional early-bird price and share, expected
fill rate.

## Outputs

1. **Weekend schedule**: an actual grid per day (start, end, sheet, type,
   stage, session). Round robin first, then practices (they fill open blocks
   first), then the placement round and playoffs on the last day, then the
   All-Star game. If the weekend does not fit, the unplaced sessions are
   listed with the hours short. Playoff seeds come from the round-robin
   standings using the HNIB tie-break rules (points, most wins, head-to-head
   when exactly two teams are tied, goals against, goals for).
2. **Profit and loss**: net revenue after processing fees, costs grouped by
   ice, officials, scorekeepers, coaches, referral commissions, per-player
   costs, and event fixed costs; net profit and margin; per-player revenue,
   cost, and profit; break-even price at the target roster; break-even player
   count at the set price; profit at 80, 90, 100, and 110 percent fill.
   "Show the math" lists every formula with the current numbers plugged in.
3. **Family value**: games, price per game, skater and goalie ice minutes,
   practice minutes, playoff and All-Star opportunity.
4. **Scenario comparison**: every scenario in one table.
5. **Export**: "Copy summary" puts a plain-text comparison on the clipboard
   for email; "Download schedule CSV" saves the grid; "Print" lays the
   outputs out on Letter with the inputs hidden; "Save scenarios (JSON)" and
   "Load scenarios (JSON)" move work between machines and between the file
   and the tournament site.

## Assumptions worth knowing

- Every game uses two teams, so teams x games per team must be even. Three
  teams at three games each is impossible (4.5 games); the tool says so and
  offers two games (single round robin) or four (double round robin), a
  fourth team, or an uneven "one team plays an extra game" option.
- A placement round is reused rather than stacked on top of playoffs: with
  "Final only" the 1 vs 2 placement game is the championship and 3 vs 4 plays
  for third; with "Semis plus final" the placement round becomes the
  semifinals (1 vs 4, 2 vs 3) and a final is added; with quarterfinals it
  becomes the eight-team bracket (1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6).
- Ice hours default to the booked span per sheet per day, from the first
  block to the last, including open blocks. Switch to "Active blocks only"
  if the rink lets you buy disjoint slots.
- Break-even price is the single flat price (early bird ignored) at which net
  revenue at the target roster equals total cost. Break-even players divides
  the costs that do not move with head count (ice, officials, scorekeepers,
  coaches, event fixed costs) by what each registrant contributes after fees
  and per-player costs.
- Skater ice minutes assume five skaters on the ice sharing the roster's
  skater spots for the stop-time minutes; goalies split the net.
- Round-robin games are balanced across days; the last day reserves the
  blocks its playoff rounds need.

## Verification of the pre-built cases (satellite defaults)

- **3 teams**: 3 games each does not resolve (explained on screen). 2 games
  (single round robin) and 4 games (double) build valid grids. On one sheet
  with the no-back-to-back rule, one open block appears between games.
- **4 teams**: 3 games (single round robin) and 4 games (round robin plus a
  placement round) both fit two days on one sheet; the 4-game case books
  14.66 hours, of which 4 are open blocks forced by the rest rule.
- **6 teams**: 3 games (two pools of 3 plus one crossover, or a partial round
  robin), 4 games (pools plus two crossovers), and 5 games (full round robin)
  all build conflict-free grids.
- **8 teams**: two pools of 4 give 3 games; one crossover makes the 4-game
  guarantee. With two sheets, semifinals run side by side and the final
  follows after the rest gap. The Massachusetts festival shape (8 teams,
  quarterfinals, two sheets, three days, 105-minute blocks) fits between
  8:00 AM and 8:00 PM.
- Odd team counts with an even game count (9 teams at 4 games, the 2025
  Jr. High shape) use a balanced partial round robin.

No default case fails to schedule. The automated tests in `test/planner/`
check every grid for double-booked sheets, teams in two places, back-to-back
games, and sessions outside the ice window.

## Comparing a real event with its actuals (Planner tab)

1. Setup tab: sync the event from hnib.app by its event id.
2. Planner tab, "Seed from a past event": pick the event and click
   **New "as run" scenario**. The scenario gets the real team names (they
   appear in the schedule grid), each team's roster count and coach, the
   total headcount (the fill rate is set so the model carries exactly that
   many players), games per team, days, sheets, block cadence, and playoff
   rounds. The price comes from the profile (festival or showcase); costs
   start at the profile defaults.
3. Open **Actuals (from the books)** in the inputs and type in what the
   event really did: registered players, gross revenue, processing fees, and
   each cost line. Blank lines stay out of the comparison.
4. The **Model vs actual** card shows every line side by side with the
   variance, and the unit rates the actuals imply (ice per booked hour,
   referee per game, coach per team, effective price per player, and so on).
5. **Apply actual rates to this scenario** rewrites the scenario's unit
   rates so the model reproduces the books. Then **Duplicate** it and change
   the price, the games, the format, or the sheets to see what the event
   would have made under a different plan, against both the as-run model
   and the actuals. "Copy actuals to sibling scenarios" pushes the same
   actual figures to every scenario built from that event.

The Tourno data carries no money, so the actuals are always yours to enter.
Syncing only works in the tournament site (a real browser talking to
hnib.app); the offline file and the shared web copy can still receive an
as-run scenario through the scenarios JSON.

## The shared web copy

The same planner is also published as a private web page for testing. There,
"Show schedule CSV" and "Show scenarios JSON" put the text in a box (and on
the clipboard) instead of saving a file, because the page viewer blocks
downloads, and your scenarios are remembered in your own browser between
visits. Use the page's comment feature to leave notes on anything you want
changed or added.

## Handing the file to a future staff member

1. Send `hnib-event-planner.html` and, if you want them to start from your
   numbers, a scenarios JSON saved from the tool. They open the file and use
   "Load scenarios (JSON)".
2. To change what the file opens with permanently, open the HTML in a text
   editor and paste the contents of a saved scenarios JSON file between the
   `<script id="hnib-planner-defaults">` tags near the top.
3. To change the built-in profile defaults or the logic, the source lives in
   the tournament tool's repository: defaults in
   `src/engine/planner/defaults.ts`, the format rules in
   `src/engine/planner/format.ts`, the schedule builder in
   `src/engine/planner/schedule.ts`, the money in
   `src/engine/planner/pnl.ts`, and the screen in
   `src/ui/planner/PlannerApp.tsx`. `npm run build` rebuilds both the site
   and `dist/hnib-event-planner.html`.
