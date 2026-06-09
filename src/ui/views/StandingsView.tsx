import { Fragment } from "preact";
import type { Dataset } from "../../io/dataset.ts";
import type { Standing } from "../../engine/types.ts";
import type { Analysis } from "../state/store.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
}

export function StandingsView({ dataset, analysis }: Props) {
  return (
    <section>
      {analysis.warnings.length > 0 && (
        <div class="card premium">
          <p class="section-title">Flags</p>
          {analysis.warnings.map((w, i) => (
            <p class="warn" key={i}>
              {w}
            </p>
          ))}
        </div>
      )}

      {dataset.divisions.map((div) => {
        const standings = analysis.divisionStandings.get(div.id) ?? [];
        return (
          <div class="card" key={div.id}>
            <p class="section-title">{div.name}</p>
            <StandingsTable standings={standings} nameById={analysis.nameById} />
          </div>
        );
      })}
    </section>
  );
}

function StandingsTable({
  standings,
  nameById,
}: {
  standings: Standing[];
  nameById: (id: string) => string;
}) {
  return (
    <table class="grid">
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Team</th>
          <th class="num">GP</th>
          <th class="num">W</th>
          <th class="num">L</th>
          <th class="num">T</th>
          <th class="num">PTS</th>
          <th class="num">GF</th>
          <th class="num">GA</th>
          <th class="num">+/-</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s) => (
          <Fragment key={s.teamId}>
            <tr>
              <td class="num">{s.rank}</td>
              <td>{nameById(s.teamId)}</td>
              <td class="num">{s.gp}</td>
              <td class="num">{s.w}</td>
              <td class="num">{s.l}</td>
              <td class="num">{s.t}</td>
              <td class="num">{s.points}</td>
              <td class="num">{s.gf}</td>
              <td class="num">{s.ga}</td>
              <td class="num">{s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}</td>
            </tr>
            {s.tieBreakNotes.length > 0 && (
              <tr>
                <td />
                <td colSpan={9} class="note">
                  {s.tieBreakNotes.map((n) => n.text).join(" - ")}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
