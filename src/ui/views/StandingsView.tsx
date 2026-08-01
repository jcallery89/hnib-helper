import { Fragment } from "preact";
import { useMemo } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Standing } from "../../engine/types.ts";
import type { Analysis } from "../state/store.ts";
import { playoffPicture, type PlayoffState } from "../../engine/playoff/scenarios.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
}

export function StandingsView({ dataset, analysis }: Props) {
  // Clinched/eliminated status for the playoff field, computed once and looked
  // up per team. Empty for events without a bracket.
  const statusById = useMemo(() => {
    const m = new Map<string, PlayoffState>();
    if (!dataset.event.hasPlayoffBracket) return m;
    const pic = playoffPicture(dataset.event, dataset.divisions, dataset.teams, dataset.games);
    if (pic.decided) for (const s of pic.statuses) m.set(s.teamId, s.state);
    return m;
  }, [dataset.event, dataset.divisions, dataset.teams, dataset.games]);

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
            <StandingsTable standings={standings} nameById={analysis.nameById} statusById={statusById} />
          </div>
        );
      })}
    </section>
  );
}

function StatusBadge({ state }: { state: PlayoffState | undefined }) {
  if (state !== "clinched" && state !== "eliminated") return null;
  const clinched = state === "clinched";
  return (
    <span
      title={clinched ? "Clinched a playoff spot" : "Eliminated from playoff contention"}
      style={{
        marginLeft: 8,
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "1px 6px",
        borderRadius: 4,
        background: clinched ? "var(--hnib-green, #1da95c)" : "var(--hnib-red, #d6453d)",
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {clinched ? "CLINCHED" : "OUT"}
    </span>
  );
}

function StandingsTable({
  standings,
  nameById,
  statusById,
}: {
  standings: Standing[];
  nameById: (id: string) => string;
  statusById: Map<string, PlayoffState>;
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
              <td>
                {nameById(s.teamId)}
                <StatusBadge state={statusById.get(s.teamId)} />
              </td>
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
