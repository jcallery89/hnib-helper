import type { Dataset } from "../../io/dataset.ts";
import type { Game } from "../../engine/types.ts";
import type { Analysis } from "../state/store.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
  update: (mutate: (draft: Dataset) => void) => void;
}

export function ResultsView({ dataset, analysis, update }: Props) {
  const rrGames = dataset.games.filter((g) => g.round === "rr");
  const groups = groupGames(dataset, rrGames);

  function setScore(gameId: string, side: "home" | "away", raw: string) {
    update((draft) => {
      const g = draft.games.find((x) => x.id === gameId);
      if (!g) return;
      const value = raw.trim() === "" ? null : Math.max(0, Number(raw));
      if (side === "home") g.homeScore = Number.isFinite(value as number) ? value : null;
      else g.awayScore = Number.isFinite(value as number) ? value : null;
      const both = g.homeScore !== null && g.awayScore !== null;
      g.status = both ? "final" : "scheduled";
      if (both && !g.decidedBy) g.decidedBy = "regulation";
    });
  }

  return (
    <section>
      <div class="card">
        <p class="section-title">Enter Round-Robin Results</p>
        <p class="note">
          {analysis.resultsEntered} of {analysis.totalRoundRobin} games final. Standings, tiebreaks,
          and the playoff field update as you type. Round-robin games can end in a tie.
        </p>
      </div>

      {groups.map((group) => (
        <div class="card" key={group.label}>
          <p class="section-title">{group.label}</p>
          <table class="grid">
            <thead>
              <tr>
                <th>Matchup</th>
                <th class="num">Home</th>
                <th class="num">Away</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {group.games.map((g) => (
                <tr key={g.id}>
                  <td>
                    {analysis.nameById(g.homeTeamId)} vs {analysis.nameById(g.awayTeamId)}
                  </td>
                  <td class="num">
                    <input
                      class="score-input"
                      type="number"
                      min={0}
                      value={g.homeScore ?? ""}
                      onInput={(e) => setScore(g.id, "home", (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td class="num">
                    <input
                      class="score-input"
                      type="number"
                      min={0}
                      value={g.awayScore ?? ""}
                      onInput={(e) => setScore(g.id, "away", (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td>{g.status === "final" ? <span class="badge advancing">FINAL</span> : <span class="note">scheduled</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function groupGames(dataset: Dataset, games: Game[]): Array<{ label: string; games: Game[] }> {
  const divName = new Map(dataset.divisions.map((d) => [d.id, d.name]));
  const out: Array<{ label: string; games: Game[] }> = [];
  for (const div of dataset.divisions) {
    const g = games.filter((x) => x.divisionId === div.id);
    if (g.length) out.push({ label: `${divName.get(div.id) ?? div.name} - Round Robin`, games: g });
  }
  const cross = games.filter((x) => x.divisionId === null);
  if (cross.length) out.push({ label: "Crossover Games", games: cross });
  return out;
}
