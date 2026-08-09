import { useMemo, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Analysis } from "../state/store.ts";
import { scheduleCountWarnings } from "../../engine/standings.ts";
import { buildPlayoffField, fieldSizeFor } from "../../engine/playoff/field.ts";
import {
  forecastScenarios,
  applyHypotheticals,
  playoffPicture,
  type Outcome,
  type ScenarioTrigger,
} from "../../engine/playoff/scenarios.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
}

const SEEDING_RULE_LABELS: Record<string, string> = {
  jrhigh_winners_next_two: "Jr. High (division winners + next two per division, pooled)",
  jrhigh_top2_per_division: "Sophomore / Girls Major (winners + runners-up + wildcards)",
  soph_division_winners: "Legacy (division winners + wildcards)",
};

export function ScenariosView({ dataset, analysis }: Props) {
  const name = analysis.nameById;
  const [overrides, setOverrides] = useState<Record<string, Outcome>>({});

  const remaining = useMemo(
    () => dataset.games.filter((g) => g.round === "rr" && g.status !== "final"),
    [dataset.games],
  );

  const forecast = useMemo(
    () => forecastScenarios(dataset.event, dataset.divisions, dataset.teams, dataset.games),
    [dataset.event, dataset.divisions, dataset.teams, dataset.games],
  );

  // What-if: apply the picked results, then re-seed and re-run the picture.
  const whatIf = useMemo(() => {
    const games = applyHypotheticals(dataset.games, overrides);
    const field = buildPlayoffField(dataset.event, dataset.divisions, dataset.teams, games, {
      pointSystem: dataset.event.pointSystem,
      teams: dataset.teams,
    });
    const pic = playoffPicture(dataset.event, dataset.divisions, dataset.teams, games);
    return { seeds: field.seeds, pic };
  }, [dataset, overrides]);

  if (!dataset.event.hasPlayoffBracket) {
    return (
      <section>
        <div class="card">
          <p class="section-title">Playoff Scenarios</p>
          <p class="note">This event does not run a playoff bracket. Enable one in Setup to forecast scenarios.</p>
        </div>
      </section>
    );
  }

  const fieldSize = fieldSizeFor(dataset.event);
  const setCount = Object.keys(overrides).length;
  const ruleLabel = SEEDING_RULE_LABELS[dataset.event.seedingRule] ?? dataset.event.seedingRule;
  // When the field is as large as (or larger than) the team count, every team
  // qualifies no matter what, so the "all clinched" picture is expected and the
  // forecast has nothing to forecast. Surface that so it does not look like a bug.
  const fieldCoversAll = fieldSize >= dataset.teams.length;

  function resultPhrase(t: ScenarioTrigger): string {
    if (t.outcome === "home") return `${name(t.homeTeamId)} beats ${name(t.awayTeamId)}`;
    if (t.outcome === "away") return `${name(t.awayTeamId)} beats ${name(t.homeTeamId)}`;
    return `${name(t.homeTeamId)} and ${name(t.awayTeamId)} tie`;
  }
  function effectsPhrase(t: ScenarioTrigger): string {
    const parts = t.effects.map((e) => `${name(e.teamId)} ${e.effect === "clinched" ? "clinches" : "is eliminated"}`);
    return parts.length <= 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }

  const elimById = new Set(whatIf.pic.statuses.filter((s) => s.state === "eliminated").map((s) => s.teamId));

  // Data sanity: a scored-but-not-final game or a team missing a scheduled game
  // silently skews every call below, so surface schedule problems here loudly.
  const dataWarnings = [
    ...scheduleCountWarnings(dataset.teams, dataset.games),
    ...dataset.games
      .filter((g) => g.round === "rr" && g.status !== "final" && (g.homeScore !== null || g.awayScore !== null))
      .map((g) => `DATA WARNING: ${name(g.homeTeamId)} vs ${name(g.awayTeamId)} carries a score but is not marked final. Its score is ignored until it goes final.`),
  ];

  // Current picture from real results only (no hypotheticals): who is already
  // mathematically out, who is locked in, who is still alive.
  const outNow = forecast.statuses.filter((s) => s.state === "eliminated").map((s) => name(s.teamId));
  const clinchedNow = forecast.statuses.filter((s) => s.state === "clinched").map((s) => name(s.teamId));
  const aliveNow = forecast.statuses.filter((s) => s.state === "alive").map((s) => name(s.teamId));

  return (
    <section>
      {dataWarnings.length > 0 && (
        <div class="card">
          {dataWarnings.map((w) => (
            <p key={w} class="note" style={{ color: "var(--warn, #f0a500)", fontWeight: 600 }}>
              {w}
            </p>
          ))}
        </div>
      )}
      <div class="card">
        <p class="section-title">Out of the Race</p>
        {!forecast.decided ? (
          <p class="note">
            Too many games remain ({forecast.remainingGames}) to settle eliminations exactly.
            Check back once the field is closer to the final round.
          </p>
        ) : outNow.length === 0 ? (
          <p class="note">
            No team is mathematically eliminated yet. Every team can still reach the {fieldSize}-team
            field in at least one set of remaining results.
          </p>
        ) : (
          <>
            <p class="note">
              Checked against every possible set of remaining results: these teams cannot reach the{" "}
              {fieldSize}-team field no matter what happens.
            </p>
            <p style={{ fontSize: "1.05em" }}>
              {outNow.map((n, i) => (
                <span key={n}>
                  {i > 0 && ", "}
                  <strong style={{ color: "#d6453d" }}>{n}</strong>
                </span>
              ))}
            </p>
          </>
        )}
        {forecast.decided && (clinchedNow.length > 0 || aliveNow.length > 0) && (
          <p class="note" style={{ marginTop: 8 }}>
            {clinchedNow.length > 0 && (
              <>
                <strong style={{ color: "#1da95c" }}>Clinched:</strong> {clinchedNow.join(", ")}
                {aliveNow.length > 0 && " - "}
              </>
            )}
            {aliveNow.length > 0 && (
              <>
                <strong>Still fighting:</strong> {aliveNow.join(", ")}
              </>
            )}
          </p>
        )}
      </div>

      <div class="card premium">
        <p class="section-title">Key Scenarios</p>
        <p class="note">
          What each remaining game locks in, computed by running every possible set of results through
          the seeding and tiebreak rules. Each line is a result that, on its own, clinches a spot or
          eliminates a team no matter what else happens.
        </p>
        {!forecast.decided ? (
          <p class="note">
            {remaining.length === 0
              ? "All round-robin games are final - see the Bracket for the seeded field."
              : `Too many games remain (${forecast.remainingGames}) to compute exact scenarios yet. Check back closer to the final round.`}
          </p>
        ) : forecast.triggers.length === 0 ? (
          <p class="note">No single result clinches or eliminates a team yet - it still depends on combinations.</p>
        ) : (
          <ul class="scenario-list">
            {forecast.triggers.map((t, i) => (
              <li key={i}>
                <strong>If {resultPhrase(t)}:</strong> {effectsPhrase(t)}.
              </li>
            ))}
          </ul>
        )}
        <p class="note" style={{ marginTop: 8 }}>
          Edge cases settled by a coin flip or by an exact goal-differential tiebreak may vary.
        </p>
      </div>

      <div class="card">
        <p class="section-title">What If</p>
        <p class="note">
          Set hypothetical results for the remaining games and watch the seeding update. Leave a game
          blank to keep it undecided.
        </p>
        {remaining.length === 0 ? (
          <p class="note">No remaining round-robin games to play with.</p>
        ) : (
          <div class="toolbar" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            {remaining.map((g) => (
              <label key={g.id} class="row" style={{ gap: 6, minWidth: 260 }}>
                <span style={{ minWidth: 150 }}>
                  {name(g.homeTeamId)} vs {name(g.awayTeamId)}
                </span>
                <select
                  value={overrides[g.id] ?? ""}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value as Outcome | "";
                    setOverrides((prev) => {
                      const next = { ...prev };
                      if (v === "") delete next[g.id];
                      else next[g.id] = v;
                      return next;
                    });
                  }}
                >
                  <option value="">- undecided -</option>
                  <option value="home">{name(g.homeTeamId)} wins</option>
                  <option value="away">{name(g.awayTeamId)} wins</option>
                  <option value="tie">Tie</option>
                </select>
              </label>
            ))}
            {setCount > 0 && (
              <button class="btn" onClick={() => setOverrides({})}>
                Reset ({setCount})
              </button>
            )}
          </div>
        )}

        <p class="section-title" style={{ marginTop: 16 }}>
          Resulting seeds {setCount > 0 ? "(with your hypotheticals)" : "(as it stands)"}
        </p>
        <p class="note">
          Playoff format: <strong>{fieldSize}-team</strong> field, {ruleLabel}. Change this in Setup
          under Event if it is wrong.
        </p>
        {fieldCoversAll && (
          <p class="note" style={{ color: "var(--warn, #f0a500)" }}>
            This field holds {fieldSize} teams and the event has {dataset.teams.length}, so every team
            qualifies regardless of results - that is why all seeds show as clinched. Set the Jr. High
            rule and a 6-team field in Setup to forecast a real cut.
          </p>
        )}
        <table class="grid">
          <thead>
            <tr>
              <th class="num">Seed</th>
              <th>Team</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {whatIf.seeds.slice(0, fieldSize).map((s) => {
              const st = whatIf.pic.statuses.find((x) => x.teamId === s.teamId)?.state;
              return (
                <tr key={s.teamId}>
                  <td class="num">{s.seed}</td>
                  <td>{name(s.teamId)}</td>
                  <td class="note">{whatIf.pic.decided && st === "clinched" ? "Clinched" : "In on these results"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {elimById.size > 0 && (
          <p class="note" style={{ marginTop: 8 }}>
            <strong>Eliminated:</strong>{" "}
            {[...elimById].map((id) => name(id)).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}
