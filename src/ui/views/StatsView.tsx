import { useMemo, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Player, PlayerSummary } from "../../engine/types.ts";
import { playerSummaries } from "../state/store.ts";
import { downloadFile } from "../../io/session.ts";

interface Props {
  dataset: Dataset;
  update: (mutate: (draft: Dataset) => void) => void;
}

interface Row {
  player: Player;
  summary: PlayerSummary;
  teamName: string;
  isAllStar: boolean;
}

type Dir = "asc" | "desc";

export function StatsView({ dataset, update }: Props) {
  const [teamFilter, setTeamFilter] = useState("all");
  const [skaterSort, setSkaterSort] = useState<{ key: string; dir: Dir }>({ key: "points", dir: "desc" });
  const [goalieSort, setGoalieSort] = useState<{ key: string; dir: Dir }>({ key: "gaa", dir: "asc" });

  const teamName = useMemo(() => new Map(dataset.teams.map((t) => [t.id, t.name])), [dataset.teams]);
  const summaries = useMemo(() => playerSummaries(dataset), [dataset.players, dataset.playerStats, dataset.games]);
  const allStars = useMemo(() => new Set(dataset.allStarIds ?? []), [dataset.allStarIds]);

  const rows: Row[] = (dataset.players ?? [])
    .filter((p) => teamFilter === "all" || p.teamId === teamFilter)
    .map((p) => ({
      player: p,
      summary: summaries.get(p.id) ?? emptySummary(p.id),
      teamName: teamName.get(p.teamId) ?? p.teamId,
      isAllStar: allStars.has(p.id),
    }));

  const skaters = sortRows(rows.filter((r) => !r.summary.isGoalie), skaterSort, skaterValue);
  const goalies = sortRows(rows.filter((r) => r.summary.isGoalie), goalieSort, goalieValue);

  function toggleAllStar(id: string) {
    update((d) => {
      const set = new Set(d.allStarIds ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      d.allStarIds = [...set];
    });
  }

  function exportPool() {
    const flagged = (dataset.players ?? []).filter((p) => allStars.has(p.id));
    const header = ["team", "jersey", "first", "last", "position", "birthYear", "gp", "g", "a", "pts", "gaa", "svpct"];
    const lines = flagged.map((p) => {
      const s = summaries.get(p.id) ?? emptySummary(p.id);
      return [
        teamName.get(p.teamId) ?? p.teamId, p.jersey ?? "", p.firstName, p.lastName, p.position ?? "",
        p.birthYear ?? "", s.gp, s.goals, s.assists, s.points,
        s.gaa !== undefined ? s.gaa.toFixed(2) : "", s.savePct !== undefined ? s.savePct.toFixed(3) : "",
      ].map(csvCell).join(",");
    });
    downloadFile(`${dataset.event.year}-all-star-pool.csv`, [header.join(","), ...lines].join("\n"), "text/csv");
  }

  if ((dataset.players ?? []).length === 0) {
    return (
      <section>
        <div class="card">
          <p class="section-title">All Players</p>
          <p class="note">No players yet. Sync the event and import a roster on the Players tab.</p>
        </div>
      </section>
    );
  }

  const flaggedRows = rows.filter((r) => r.isAllStar);

  return (
    <section>
      <div class="card premium">
        <p class="section-title">All-Star Pool ({allStars.size})</p>
        <p class="note">
          Use the star in the tables below to flag players for All-Star consideration. Flagged
          players collect here so you can build rosters; export the pool to a spreadsheet any time.
        </p>
        {flaggedRows.length === 0 ? (
          <p class="note">No players flagged yet.</p>
        ) : (
          <>
            {(["F", "D", "G"] as const).map((pos) => {
              const group = flaggedRows.filter((r) => (r.player.position ?? "") === pos);
              if (group.length === 0) return null;
              return (
                <p key={pos}>
                  <strong>{positionLabel(pos)} ({group.length}):</strong>{" "}
                  {group
                    .map((r) => `${r.player.firstName} ${r.player.lastName} (${r.teamName} #${r.player.jersey ?? "?"})`)
                    .join(", ")}
                </p>
              );
            })}
            <div class="toolbar" style={{ marginTop: 8 }}>
              <button class="btn secondary" onClick={exportPool}>Export pool (CSV)</button>
            </div>
          </>
        )}
      </div>

      <div class="card">
        <div class="toolbar">
          <label class="row">
            Team:
            <select value={teamFilter} onChange={(e) => setTeamFilter((e.target as HTMLSelectElement).value)}>
              <option value="all">All teams</option>
              {dataset.teams.map((t) => (
                <option value={t.id} key={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <span class="note">{skaters.length} skaters, {goalies.length} goaltenders. Click a column to sort.</span>
        </div>

        <p class="section-title">Skaters</p>
        <table class="grid">
          <thead>
            <tr>
              <th />
              <SortTH label="Name" col="name" sort={skaterSort} set={setSkaterSort} defDir="asc" />
              <SortTH label="Team" col="team" sort={skaterSort} set={setSkaterSort} defDir="asc" />
              <SortTH label="Pos" col="pos" sort={skaterSort} set={setSkaterSort} defDir="asc" />
              <SortTH label="Birth Yr" col="birthYear" sort={skaterSort} set={setSkaterSort} num />
              <SortTH label="GP" col="gp" sort={skaterSort} set={setSkaterSort} num />
              <SortTH label="G" col="goals" sort={skaterSort} set={setSkaterSort} num />
              <SortTH label="A" col="assists" sort={skaterSort} set={setSkaterSort} num />
              <SortTH label="PTS" col="points" sort={skaterSort} set={setSkaterSort} num />
            </tr>
          </thead>
          <tbody>
            {skaters.map((r) => (
              <tr key={r.player.id}>
                <td><StarToggle on={r.isAllStar} onClick={() => toggleAllStar(r.player.id)} /></td>
                <td>#{r.player.jersey ?? "?"} {r.player.firstName} {r.player.lastName}</td>
                <td>{r.teamName}</td>
                <td>{r.player.position ?? ""}</td>
                <td class="num">{r.player.birthYear ?? ""}</td>
                <td class="num">{r.summary.gp}</td>
                <td class="num">{r.summary.goals}</td>
                <td class="num">{r.summary.assists}</td>
                <td class="num">{r.summary.points}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {goalies.length > 0 && (
          <>
            <p class="section-title" style={{ marginTop: 16 }}>Goaltenders</p>
            <table class="grid">
              <thead>
                <tr>
                  <th />
                  <SortTH label="Name" col="name" sort={goalieSort} set={setGoalieSort} defDir="asc" />
                  <SortTH label="Team" col="team" sort={goalieSort} set={setGoalieSort} defDir="asc" />
                  <SortTH label="Birth Yr" col="birthYear" sort={goalieSort} set={setGoalieSort} num />
                  <SortTH label="GP" col="gp" sort={goalieSort} set={setGoalieSort} num />
                  <SortTH label="GAA" col="gaa" sort={goalieSort} set={setGoalieSort} num />
                  <SortTH label="SV%" col="savePct" sort={goalieSort} set={setGoalieSort} num />
                </tr>
              </thead>
              <tbody>
                {goalies.map((r) => (
                  <tr key={r.player.id}>
                    <td><StarToggle on={r.isAllStar} onClick={() => toggleAllStar(r.player.id)} /></td>
                    <td>#{r.player.jersey ?? "?"} {r.player.firstName} {r.player.lastName}</td>
                    <td>{r.teamName}</td>
                    <td class="num">{r.player.birthYear ?? ""}</td>
                    <td class="num">{r.summary.gp}</td>
                    <td class="num">{r.summary.gaa !== undefined ? r.summary.gaa.toFixed(2) : "-"}</td>
                    <td class="num">{r.summary.savePct !== undefined ? r.summary.savePct.toFixed(3).replace(/^0/, "") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}

function SortTH({
  label, col, sort, set, num, defDir,
}: {
  label: string;
  col: string;
  sort: { key: string; dir: Dir };
  set: (s: { key: string; dir: Dir }) => void;
  num?: boolean;
  defDir?: Dir;
}) {
  const active = sort.key === col;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  function click() {
    if (active) set({ key: col, dir: sort.dir === "asc" ? "desc" : "asc" });
    else set({ key: col, dir: defDir ?? (num ? "desc" : "asc") });
  }
  return (
    <th class={num ? "num" : undefined} style={{ cursor: "pointer", color: active ? "var(--hnib-navy)" : undefined }} onClick={click}>
      {label}{arrow}
    </th>
  );
}

function StarToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={on ? "Remove from All-Star pool" : "Flag for All-Star consideration"}
      style={{
        background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1,
        color: on ? "var(--hnib-gold)" : "var(--hnib-text-dim)",
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function sortRows(rows: Row[], sort: { key: string; dir: Dir }, value: (r: Row, key: string) => string | number): Row[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a, sort.key);
    const vb = value(b, sort.key);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
    return String(va).localeCompare(String(vb)) * factor;
  });
}

function skaterValue(r: Row, key: string): string | number {
  switch (key) {
    case "name": return `${r.player.lastName} ${r.player.firstName}`.toLowerCase();
    case "team": return r.teamName.toLowerCase();
    case "pos": return r.player.position ?? "";
    case "birthYear": return r.player.birthYear ?? 0;
    case "gp": return r.summary.gp;
    case "goals": return r.summary.goals;
    case "assists": return r.summary.assists;
    case "points": return r.summary.points;
    default: return 0;
  }
}

function goalieValue(r: Row, key: string): string | number {
  switch (key) {
    case "name": return `${r.player.lastName} ${r.player.firstName}`.toLowerCase();
    case "team": return r.teamName.toLowerCase();
    case "birthYear": return r.player.birthYear ?? 0;
    case "gp": return r.summary.gp;
    // Goalies with no data sort to the bottom regardless of direction.
    case "gaa": return r.summary.gaa ?? Number.MAX_SAFE_INTEGER;
    case "savePct": return r.summary.savePct ?? -1;
    default: return 0;
  }
}

function emptySummary(playerId: string): PlayerSummary {
  return { playerId, isGoalie: false, gp: 0, goals: 0, assists: 0, points: 0, pim: 0 };
}

function positionLabel(p: "F" | "D" | "G"): string {
  return p === "G" ? "Goaltenders" : p === "D" ? "Defense" : "Forwards";
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
