import { useMemo, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import { generateMatchups } from "../../engine/schedule/matchups.ts";
import { buildSlotGrid, type VenueConfig } from "../../engine/schedule/slotGrid.ts";
import { placeSchedule } from "../../engine/schedule/placement.ts";
import { reflow } from "../../engine/schedule/reflow.ts";
import { fairnessReport } from "../../engine/schedule/fairness.ts";
import { playoffSeedingRules } from "../../engine/playoff/rules.ts";
import type { TeamAvailability } from "../../engine/schedule/constraints.ts";
import type { Game } from "../../engine/types.ts";

const TARGET_GAMES = 4;

interface Props {
  dataset: Dataset;
}

function defaultVenue(year: number): VenueConfig {
  const base = year >= 2026 ? "2026-06-26" : "2025-06-27";
  const d = new Date(`${base}T00:00:00Z`);
  const days = [0, 1, 2].map((i) => {
    const dt = new Date(d.getTime() + i * 86400000);
    return {
      date: dt.toISOString().slice(0, 10),
      start: "08:00",
      end: "18:00",
      slotMinutes: 105,
      staggerMinutes: 15,
    };
  });
  return { sheets: ["Gray", "Lamacchia"], days };
}

export function ScheduleView({ dataset }: Props) {
  const nameById = (id: string) => dataset.teams.find((t) => t.id === id)?.name ?? id;
  const venue = useMemo(() => defaultVenue(dataset.event.year), [dataset.event.year]);
  const [minRest, setMinRest] = useState(120);
  const [availability, setAvailability] = useState<TeamAvailability[]>([]);

  // Form state for adding a constraint.
  const [formTeam, setFormTeam] = useState(dataset.teams[0]?.id ?? "");
  const [formDate, setFormDate] = useState(venue.days[0]?.date ?? "");
  const [formTime, setFormTime] = useState("14:00");

  const base = useMemo(() => {
    const { games, warnings } = generateMatchups(dataset.divisions, TARGET_GAMES);
    const slots = buildSlotGrid(venue);
    const placed = placeSchedule(games, slots, { minRestMinutes: minRest, availability: [], blackouts: [] });
    return { games, slots, placement: placed, matchupWarnings: warnings };
  }, [dataset.divisions, venue, minRest]);

  const current = useMemo(
    () =>
      reflow(
        base.games,
        base.slots,
        { minRestMinutes: minRest, availability, blackouts: [] },
        base.placement.assignment,
      ),
    [base, minRest, availability],
  );

  const byDay = groupByDay(current.placed);
  const fairness = fairnessReport(current.placed);

  function addConstraint() {
    if (!formTeam || !formDate) return;
    setAvailability((prev) => [
      ...prev.filter((a) => !(a.teamId === formTeam && a.date === formDate)),
      { teamId: formTeam, date: formDate, earliest: formTime },
    ]);
  }

  return (
    <section>
      <div class="card">
        <p class="section-title">Schedule Generator</p>
        <p class="note">
          Phase 1 builds a balanced round robin plus crossover games ({TARGET_GAMES} per team). Phase
          2 places them across {venue.sheets.join(" and ")} honoring the minimum rest window. Add a
          constraint and re-solve - only the games that must move will move.
        </p>
        <div class="toolbar">
          <label class="row">
            Minimum rest (min):
            <input
              type="number"
              min={0}
              style={{ width: 80 }}
              value={minRest}
              onInput={(e) => setMinRest(Math.max(0, Number((e.target as HTMLInputElement).value) || 0))}
            />
          </label>
        </div>
        {(base.matchupWarnings.length > 0 || current.warnings.length > 0) && (
          <div>
            {[...base.matchupWarnings, ...current.warnings].map((w, i) => (
              <p class="warn" key={i}>
                {w}
              </p>
            ))}
          </div>
        )}
      </div>

      <div class="card">
        <p class="section-title">Re-flow: Add a Constraint</p>
        <div class="toolbar">
          <select value={formTeam} onChange={(e) => setFormTeam((e.target as HTMLSelectElement).value)}>
            {dataset.teams.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <span class="muted">cannot play before</span>
          <input type="time" value={formTime} onInput={(e) => setFormTime((e.target as HTMLInputElement).value)} />
          <span class="muted">on</span>
          <select value={formDate} onChange={(e) => setFormDate((e.target as HTMLSelectElement).value)}>
            {venue.days.map((d) => (
              <option value={d.date} key={d.date}>
                {d.date}
              </option>
            ))}
          </select>
          <button class="btn secondary" onClick={addConstraint}>
            Add and re-solve
          </button>
          {availability.length > 0 && (
            <button class="btn" onClick={() => setAvailability([])}>
              Clear ({availability.length})
            </button>
          )}
        </div>
        {current.diff.length > 0 && (
          <table class="grid">
            <thead>
              <tr>
                <th>Moved Game</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {current.diff.map((d) => (
                <tr key={d.gameId}>
                  <td>
                    {nameById(d.homeTeamId)} vs {nameById(d.awayTeamId)}
                  </td>
                  <td class="muted">{d.from ? `${d.from.sheet} ${fmt(d.from.start)}` : "unplaced"}</td>
                  <td>{d.to ? `${d.to.sheet} ${fmt(d.to.start)}` : "unplaced"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {byDay.map((day) => (
        <div class="card" key={day.date}>
          <p class="section-title">{day.date}</p>
          <table class="grid">
            <thead>
              <tr>
                <th>Time</th>
                <th>Sheet</th>
                <th>Matchup</th>
              </tr>
            </thead>
            <tbody>
              {day.games.map((g) => (
                <tr key={g.id}>
                  <td>{fmt(g.slotStart as string)}</td>
                  <td>{g.rink}</td>
                  <td>
                    {nameById(g.homeTeamId)} vs {nameById(g.awayTeamId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div class="card">
        <p class="section-title">Fairness Report</p>
        <table class="grid">
          <thead>
            <tr>
              <th>Team</th>
              <th class="num">Games</th>
              <th class="num">Early</th>
              <th class="num">Late</th>
              <th class="num">Min Rest</th>
              <th class="num">Avg Rest</th>
            </tr>
          </thead>
          <tbody>
            {fairness.teams.map((t) => (
              <tr key={t.teamId}>
                <td>{nameById(t.teamId)}</td>
                <td class="num">{t.games}</td>
                <td class="num">{t.early}</td>
                <td class="num">{t.late}</td>
                <td class="num">{t.minRestMinutes ?? "-"}</td>
                <td class="num">{t.avgRestMinutes ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="note">
          Sheet usage: {fairness.sheets.map((s) => `${s.sheet} ${s.games}`).join(", ")}
        </p>
      </div>

      <PlayoffRulesCard dataset={dataset} />
    </section>
  );
}

function PlayoffRulesCard({ dataset }: { dataset: Dataset }) {
  const rules = playoffSeedingRules(dataset.event, dataset.divisions.length);
  return (
    <div class="card">
      <p class="section-title">{rules.heading}</p>
      {rules.seedingLines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <p class="section-title" style={{ marginTop: 16 }}>
        Tie-Breaking Rules
      </p>
      <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        {rules.tiebreakRules.map((rule, i) => (
          <li key={i}>{rule}</li>
        ))}
      </ol>
      <p class="note" style={{ marginTop: 12 }}>
        The same tie-breaking rules decide division placing and playoff seeding. Head-to-head applies
        only when exactly two teams are tied. The tool resolves coin flips automatically and logs
        them; director discretion is a manual override.
      </p>
    </div>
  );
}

function groupByDay(games: Game[]): Array<{ date: string; games: Game[] }> {
  const map = new Map<string, Game[]>();
  for (const g of games) {
    if (!g.slotStart) continue;
    const date = g.slotStart.slice(0, 10);
    const arr = map.get(date) ?? [];
    arr.push(g);
    map.set(date, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, gs]) => ({
      date,
      games: gs.sort((a, b) => (a.slotStart as string).localeCompare(b.slotStart as string)),
    }));
}

function fmt(iso: string): string {
  return iso.slice(11, 16);
}
