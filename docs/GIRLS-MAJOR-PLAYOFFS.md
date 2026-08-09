# Girls Major Showcase - Playoff Format, Seeding, and Tiebreakers

The complete playoff reference for the Girls Major Showcase: how the 12-team
field is built, how the bracket runs, how ties are broken, and how the
tool's Scenarios tab calls clinches and eliminations. Formats confirmed by JC,
June 2026. Hand this file to staff, coaches, or another chat as the single
source of truth for this event.

---

## 1. The playoff field (12 teams)

Five divisions. Twelve teams qualify:

| Seeds | Who | How they are ranked |
| --- | --- | --- |
| 1-5 | The five division winners | Against each other by the tiebreakers below |
| 6-10 | The five division runners-up | Against each other by the tiebreakers below |
| 11-12 | Two wildcards, the best of the remaining teams across all divisions | By the tiebreakers below |

Every division is guaranteed its top two teams in. The two wildcard spots are
open to any third-place team or lower, whichever two rank best.

In the tool this is Setup -> Event: Seeding rule
"Sophomore / Girls Major: winners + runners-up + wildcards", Playoff teams
**12**, Tiebreak order **"Girls Major: head-to-head first"**. A fresh sync of a
five-division event picks all three automatically.

## 2. The bracket (single elimination)

Seeds 1-4 earn byes into the quarterfinals. Seeds 1 and 2 cannot meet before
the final.

**Round 1**

| Game | Matchup | Winner advances to |
| --- | --- | --- |
| R1-1 | 8 vs 9 | Quarterfinal vs seed 1 |
| R1-2 | 5 vs 12 | Quarterfinal vs seed 4 |
| R1-3 | 7 vs 10 | Quarterfinal vs seed 2 |
| R1-4 | 6 vs 11 | Quarterfinal vs seed 3 |

**Quarterfinals**

- QF1: seed 1 vs winner of 8/9
- QF2: seed 4 vs winner of 5/12
- QF3: seed 2 vs winner of 7/10
- QF4: seed 3 vs winner of 6/11

**Semifinals**: winner of QF1 vs winner of QF2, and winner of QF3 vs winner of
QF4. **Final**: the two semifinal winners.

Tie games in the playoffs: Round 1, quarterfinals, and semifinals go straight
to a shootout. The final plays 3-on-3 overtime first, then a shootout. The
deciding method is recorded with the result.

## 3. Tiebreakers (Girls Major order)

Applied to teams tied on points in the standings, and to every seeding step:
ranking the five winners, ranking the five runners-up, and filling the two
wildcards.

1. **Points** earned during round-robin games (this is what defines the tie).
2. **Head-to-Head** competition during round-robin games. Applies only when
   exactly two teams are tied. With three or more teams tied this step is
   skipped.
3. **Most Wins** during round-robin games.
4. **Fewest Goals Allowed** during the round-robin games.
5. **Most Goals For** during the round-robin games.
6. **Coin toss.**

Notes on how the procedure runs:

- This order is unique to the Girls Major. Jr. High and Sophomore use the
  shared HNIB order, which runs Most Wins before Head-to-Head.
- When a team separates from a tie of three or more, the procedure restarts
  from the top for the teams still tied. A three-way tie that narrows to two
  teams therefore gets the head-to-head step it skipped at the start.
- Goal differential is never used. Goals Allowed is compared before Goals For.
- Every decision is logged in plain language in the standings notes, and coin
  tosses carry a timestamp, so any seeding can be explained after the fact.

## 4. Playoff scenarios: clinched, alive, eliminated

The Scenarios tab answers "who is in, who is out, who is still fighting" with
math rather than judgment. The engine takes every remaining round-robin game,
plays out every possible combination of results (win, loss, tie for each), and
runs each complete outcome through the real seeding rules above, including the
Girls Major tiebreak order.

- **Clinched**: the team makes the 12-team field in every single outcome.
- **Out of the Race (eliminated)**: the team misses the field in every single
  outcome. There is no mathematical path, including tiebreak paths.
- **Still fighting (alive)**: the team is in for some outcomes and out for
  others.

Because seeding is division-based, this is not a simple points cutoff. A team
can be safe on fewer points than a team that is in danger, and the enumeration
handles that correctly.

What the tab shows:

- **Out of the Race**: the definitively eliminated teams, listed in red, plus a
  summary of who has clinched and who is still alive.
- **Key Scenarios**: single results that settle something on their own, in the
  form "If X beats Y: Z clinches" or "Z is eliminated", regardless of every
  other game.
- **What If**: set hypothetical results for any remaining games and watch the
  12 seeds recompute live under the real rules.

Two honest limits, both stated on screen when they apply:

- With eight or more round-robin games still unplayed there are too many
  combinations to enumerate exactly, so the tab waits rather than guesses.
  It comes into force on the final day, when it matters.
- A scenario that would come down to a coin toss is resolved one fixed way in
  the enumeration, so knife-edge cases can differ from a live toss. Standings
  tags and the eliminated list only use outcomes that are certain either way.

## 5. Quick answers

- **Can a third-place team make it?** Yes, as one of the two wildcards, if it
  ranks ahead of the other remaining teams by the tiebreakers.
- **Can a division send three teams?** Yes. Both wildcards can even come from
  the same division if its third and fourth place teams outrank everyone else
  remaining.
- **Who does a head-to-head result matter against?** Only a team you are tied
  with on points, and only when it is just the two of you. Three-way ties skip
  straight to Most Wins.
- **What should a team on the bubble do?** Win, first. Then hold goals against
  down: with head-to-head unavailable in multi-team ties, Fewest Goals Allowed
  is usually the live tiebreaker.
