import { useMemo, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Player, PlayerSummary } from "../../engine/types.ts";
import {
  type BallotPoolMode,
  type BallotPosition,
  type BallotSelection,
  type BallotState,
  aggregateBallots,
  ballotPosition,
  choiceLabel,
  compareBallotLines,
  compareProduction,
  emptyBallot,
  findDuplicateRanks,
  positionLabel,
} from "../../engine/ballot/ballot.ts";
import { playerSummaries } from "../state/store.ts";
import { downloadFile } from "../../io/session.ts";

interface Props {
  dataset: Dataset;
  update: (mutate: (draft: Dataset) => void) => void;
}

const POSITIONS: BallotPosition[] = ["F", "D", "G"];

type OrderBy = "production" | "consensus";

export function BallotView({ dataset, update }: Props) {
  const [newCoachName, setNewCoachName] = useState("");
  const [newCoachTeam, setNewCoachTeam] = useState("");
  const [orderBy, setOrderBy] = useState<OrderBy>("production");

  const ballot = dataset.ballot ?? emptyBallot();
  const teamName = useMemo(() => new Map(dataset.teams.map((t) => [t.id, t.name])), [dataset.teams]);
  const summaries = useMemo(
    () => playerSummaries(dataset),
    [dataset.players, dataset.playerStats, dataset.games],
  );

  // Default pool is the whole event: for the Boys Major Showcase every
  // rostered player is ballot-eligible, straight from the synced API rosters.
  // "flagged" narrows to the All-Star flags from the Stats tab instead.
  const poolMode: BallotPoolMode = ballot.poolMode ?? "event";
  const pool = useMemo(() => {
    const players = dataset.players ?? [];
    if (poolMode === "event") return players;
    const flagged = new Set(dataset.allStarIds ?? []);
    return players.filter((p) => flagged.has(p.id));
  }, [dataset.players, dataset.allStarIds, poolMode]);

  const groups = useMemo(() => {
    const g: Record<BallotPosition, Player[]> = { F: [], D: [], G: [] };
    for (const p of pool) g[ballotPosition(p, summaries.get(p.id))].push(p);
    for (const pos of POSITIONS) {
      g[pos].sort(
        (a, b) =>
          compareProduction(summaries.get(a.id), summaries.get(b.id), pos) ||
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
      );
    }
    return g;
  }, [pool, summaries]);

  const lines = useMemo(
    () => aggregateBallots(ballot.coaches, pool.map((p) => p.id)),
    [ballot.coaches, pool],
  );

  const duplicates = useMemo(
    () =>
      findDuplicateRanks(ballot.coaches, {
        F: groups.F.map((p) => p.id),
        D: groups.D.map((p) => p.id),
        G: groups.G.map((p) => p.id),
      }),
    [ballot.coaches, groups],
  );

  function edit(mutate: (b: BallotState) => void) {
    update((d) => {
      if (!d.ballot) d.ballot = emptyBallot();
      mutate(d.ballot);
    });
  }

  function addCoach() {
    const name = newCoachName.trim();
    if (!name) return;
    const team = newCoachTeam.trim();
    edit((b) => {
      const next = 1 + b.coaches.reduce((m, c) => Math.max(m, Number(c.id.replace(/^c/, "")) || 0), 0);
      b.coaches.push({ id: `c${next}`, coachName: name, ...(team ? { team } : {}), ranks: {} });
    });
    setNewCoachName("");
    setNewCoachTeam("");
  }

  function removeCoach(id: string) {
    edit((b) => {
      b.coaches = b.coaches.filter((c) => c.id !== id);
    });
  }

  function setCoachComments(id: string, value: string) {
    edit((b) => {
      const coach = b.coaches.find((c) => c.id === id);
      if (!coach) return;
      if (value.trim()) coach.comments = value;
      else delete coach.comments;
    });
  }

  function setRank(coachId: string, playerId: string, raw: string) {
    const n = Number.parseInt(raw, 10);
    edit((b) => {
      const coach = b.coaches.find((c) => c.id === coachId);
      if (!coach) return;
      if (Number.isFinite(n) && n > 0) coach.ranks[playerId] = n;
      else delete coach.ranks[playerId];
    });
  }

  function setFinalRank(playerId: string, raw: string) {
    const n = Number.parseInt(raw, 10);
    edit((b) => {
      if (Number.isFinite(n) && n > 0) b.finalRanks[playerId] = n;
      else delete b.finalRanks[playerId];
    });
  }

  function setSelection(playerId: string, value: string) {
    edit((b) => {
      if (value === "roster" || value === "alternate") b.selections[playerId] = value;
      else delete b.selections[playerId];
    });
  }

  function setTarget(pos: BallotPosition, raw: string) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    edit((b) => {
      b.targets[pos] = n;
    });
  }

  function setPoolMode(value: string) {
    edit((b) => {
      b.poolMode = value === "flagged" ? "flagged" : "event";
    });
  }

  function orderedGroup(pos: BallotPosition): Player[] {
    if (orderBy === "production") return groups[pos];
    return [...groups[pos]].sort((a, b) => {
      const la = lines.get(a.id);
      const lb = lines.get(b.id);
      if (la && lb) {
        const c = compareBallotLines(la, lb);
        if (c !== 0) return c;
      }
      return compareProduction(summaries.get(a.id), summaries.get(b.id), pos);
    });
  }

  function exportChoices(pos: BallotPosition) {
    const linesOut = groups[pos].map((p) =>
      choiceLabel(p, teamName.get(p.teamId) ?? p.teamId, summaries.get(p.id), pos),
    );
    downloadFile(
      `${dataset.event.year}-${positionLabel(pos).toLowerCase()}-choices.txt`,
      linesOut.join("\n"),
      "text/plain",
    );
  }

  function exportBlankBallot() {
    const header = ["position", "team", "jersey", "last", "first", "birthYear", "gp", "g", "a", "pts", "gaa", "svpct", "rank"];
    const rows: string[] = [];
    for (const pos of POSITIONS) {
      for (const p of groups[pos]) {
        const s = summaries.get(p.id);
        rows.push(statCells(p, pos, teamName.get(p.teamId) ?? p.teamId, s).concat("").map(csvCell).join(","));
      }
    }
    downloadFile(`${dataset.event.year}-all-star-ballot-blank.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
  }

  function exportResults() {
    const header = [
      "position", "team", "jersey", "last", "first", "birthYear", "gp", "g", "a", "pts", "gaa", "svpct",
      ...ballot.coaches.map((c) => `rank_${c.coachName}`),
      "avgRank", "votes", "finalRank", "selection",
    ];
    const rows: string[] = [];
    for (const pos of POSITIONS) {
      for (const p of orderedGroup(pos)) {
        const s = summaries.get(p.id);
        const line = lines.get(p.id);
        rows.push(
          statCells(p, pos, teamName.get(p.teamId) ?? p.teamId, s)
            .concat(
              ballot.coaches.map((c) => c.ranks[p.id] ?? ""),
              line?.avgRank ?? "",
              line?.votes ?? 0,
              ballot.finalRanks[p.id] ?? "",
              ballot.selections[p.id] ?? "",
            )
            .map(csvCell)
            .join(","),
        );
      }
    }
    downloadFile(`${dataset.event.year}-all-star-ballot-results.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
  }

  if ((dataset.players ?? []).length === 0) {
    return (
      <section>
        <div class="card">
          <p class="section-title">Coaches Ballot</p>
          <p class="note">
            No players yet. Sync the event on Setup with its hnib.app id and every rostered player appears
            here with their stats, ready to rank.
          </p>
        </div>
      </section>
    );
  }

  const selected = pool.filter((p) => ballot.selections[p.id]);

  return (
    <section>
      <div class="card premium">
        <p class="section-title">Coaches Ballot - {dataset.event.name} ({pool.length} eligible)</p>
        <p class="note">
          Every rostered player in this event is ballot-eligible. Rank 1 = best. Coaches rank only players
          they have an opinion on; blanks are fine. Avg Rank is the average across the coaches who ranked the
          player (lower = stronger consensus) and Votes is how many coaches ranked them. Directors set the
          Final column and the roster calls.
        </p>
        <div class="toolbar" style={{ marginTop: 8 }}>
          <label class="row" style={{ gap: 4 }}>
            Pool:
            <select value={poolMode} onChange={(e) => setPoolMode((e.target as HTMLSelectElement).value)}>
              <option value="event">Every player in this event</option>
              <option value="flagged">All-Star flagged only (Stats tab)</option>
            </select>
          </label>
          <span>Targets:</span>
          {POSITIONS.map((pos) => (
            <label class="row" key={pos} style={{ gap: 4 }}>
              {positionLabel(pos)}
              <input
                type="number"
                min={1}
                style={{ width: 56 }}
                value={ballot.targets[pos]}
                onInput={(e) => setTarget(pos, (e.target as HTMLInputElement).value)}
              />
            </label>
          ))}
          <label class="row" style={{ gap: 4 }}>
            Order by:
            <select value={orderBy} onChange={(e) => setOrderBy((e.target as HTMLSelectElement).value as OrderBy)}>
              <option value="production">Production</option>
              <option value="consensus">Consensus (Avg Rank)</option>
            </select>
          </label>
          <button class="btn secondary" onClick={exportBlankBallot}>Blank ballot (CSV)</button>
          <button class="btn secondary" onClick={exportResults}>Results (CSV)</button>
        </div>
      </div>

      {pool.length === 0 && (
        <div class="card">
          <p class="note">
            The ballot pool is empty because it is set to All-Star flagged players and none are flagged.
            Star players on the Stats tab, or switch the pool to every player in this event.
          </p>
        </div>
      )}

      <div class="card">
        <p class="section-title">Coaches ({ballot.coaches.length})</p>
        <div class="toolbar">
          <input
            placeholder="Coach name"
            value={newCoachName}
            onInput={(e) => setNewCoachName((e.target as HTMLInputElement).value)}
          />
          <input
            placeholder="Team coached (optional)"
            value={newCoachTeam}
            onInput={(e) => setNewCoachTeam((e.target as HTMLInputElement).value)}
          />
          <button class="btn primary" onClick={addCoach}>Add coach</button>
        </div>
        {ballot.coaches.length === 0 ? (
          <p class="note">
            Add a column per coach, then enter each ballot as it comes in. Handwritten ballots are valid
            input; transcribe them here and the consensus updates live.
          </p>
        ) : (
          <table class="grid">
            <thead>
              <tr>
                <th>Coach</th>
                <th>Team</th>
                <th>Ranked</th>
                <th>Comments</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ballot.coaches.map((c) => (
                <tr key={c.id}>
                  <td>{c.coachName}</td>
                  <td>{c.team ?? ""}</td>
                  <td class="num">{Object.keys(c.ranks).length}</td>
                  <td>
                    <input
                      style={{ width: "100%" }}
                      placeholder="Injuries, position changes, asterisk players"
                      value={c.comments ?? ""}
                      onInput={(e) => setCoachComments(c.id, (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td>
                    <button class="btn" onClick={() => removeCoach(c.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {duplicates.length > 0 && (
        <div class="card">
          <p class="section-title">Duplicate ranks to resolve</p>
          {duplicates.map((d) => {
            const coach = ballot.coaches.find((c) => c.id === d.coachId);
            const names = d.playerIds
              .map((id) => pool.find((p) => p.id === id))
              .filter((p): p is Player => p !== undefined)
              .map((p) => `${p.firstName} ${p.lastName}`)
              .join(" and ");
            return (
              <p class="warn" key={`${d.coachId}-${d.position}-${d.rank}`}>
                {coach?.coachName ?? d.coachId} gave {positionLabel(d.position)} rank {d.rank} to {names}.
              </p>
            );
          })}
        </div>
      )}

      {POSITIONS.map((pos) => {
        const group = orderedGroup(pos);
        if (group.length === 0) return null;
        return (
          <div class="card" key={pos}>
            <div class="row" style={{ justifyContent: "space-between" }}>
              <p class="section-title">
                {positionLabel(pos)} ({group.length}) - rank about {ballot.targets[pos]}
              </p>
              <button class="btn secondary" onClick={() => exportChoices(pos)}>
                Gravity Forms choices (.txt)
              </button>
            </div>
            <table class="grid">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th class="num">GP</th>
                  {pos === "G" ? (
                    <>
                      <th class="num">GAA</th>
                      <th class="num">SV%</th>
                    </>
                  ) : (
                    <>
                      <th class="num">G</th>
                      <th class="num">A</th>
                      <th class="num">PTS</th>
                    </>
                  )}
                  {ballot.coaches.map((c) => (
                    <th class="num" key={c.id} title={c.team ? `${c.coachName} (${c.team})` : c.coachName}>
                      {shortName(c.coachName)}
                    </th>
                  ))}
                  <th class="num">Avg</th>
                  <th class="num">Votes</th>
                  <th class="num">Final</th>
                  <th>Roster</th>
                </tr>
              </thead>
              <tbody>
                {group.map((p) => {
                  const s = summaries.get(p.id);
                  const line = lines.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>#{p.jersey ?? "?"} {p.firstName} {p.lastName}</td>
                      <td>{teamName.get(p.teamId) ?? p.teamId}</td>
                      <td class="num">{s?.gp ?? 0}</td>
                      {pos === "G" ? (
                        <>
                          <td class="num">{s?.gaa !== undefined ? s.gaa.toFixed(2) : "-"}</td>
                          <td class="num">{s?.savePct !== undefined ? s.savePct.toFixed(3).replace(/^0/, "") : "-"}</td>
                        </>
                      ) : (
                        <>
                          <td class="num">{s?.goals ?? 0}</td>
                          <td class="num">{s?.assists ?? 0}</td>
                          <td class="num">{s?.points ?? 0}</td>
                        </>
                      )}
                      {ballot.coaches.map((c) => (
                        <td class="num" key={c.id}>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 48 }}
                            value={c.ranks[p.id] ?? ""}
                            onInput={(e) => setRank(c.id, p.id, (e.target as HTMLInputElement).value)}
                          />
                        </td>
                      ))}
                      <td class="num">{line?.avgRank ?? "-"}</td>
                      <td class="num">{line?.votes ?? 0}</td>
                      <td class="num">
                        <input
                          type="number"
                          min={1}
                          style={{ width: 48 }}
                          value={ballot.finalRanks[p.id] ?? ""}
                          onInput={(e) => setFinalRank(p.id, (e.target as HTMLInputElement).value)}
                        />
                      </td>
                      <td>
                        <select
                          value={ballot.selections[p.id] ?? ""}
                          onChange={(e) => setSelection(p.id, (e.target as HTMLSelectElement).value)}
                        >
                          <option value="">-</option>
                          <option value="roster">Roster</option>
                          <option value="alternate">Alternate</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {selected.length > 0 && (
        <div class="card premium">
          <p class="section-title">Final at-large roster</p>
          {POSITIONS.map((pos) => {
            const picks = groups[pos]
              .filter((p) => ballot.selections[p.id])
              .sort((a, b) => (ballot.finalRanks[a.id] ?? 999) - (ballot.finalRanks[b.id] ?? 999));
            if (picks.length === 0) return null;
            const roster = picks.filter((p) => ballot.selections[p.id] === "roster");
            const alternates = picks.filter((p) => ballot.selections[p.id] === "alternate");
            return (
              <p key={pos}>
                <strong>
                  {positionLabel(pos)} ({roster.length}
                  {alternates.length > 0 ? ` + ${alternates.length} alt` : ""}):
                </strong>{" "}
                {picks
                  .map((p) => {
                    const sel: BallotSelection | undefined = ballot.selections[p.id];
                    const alt = sel === "alternate" ? " (alt)" : "";
                    return `${p.firstName} ${p.lastName} (${teamName.get(p.teamId) ?? p.teamId} #${p.jersey ?? "?"})${alt}`;
                  })
                  .join(", ")}
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}

function statCells(p: Player, pos: BallotPosition, team: string, s: PlayerSummary | undefined): Array<string | number> {
  return [
    pos, team, p.jersey ?? "", p.lastName, p.firstName, p.birthYear ?? "",
    s?.gp ?? 0, s?.goals ?? 0, s?.assists ?? 0, s?.points ?? 0,
    s?.gaa !== undefined ? s.gaa.toFixed(2) : "",
    s?.savePct !== undefined ? s.savePct.toFixed(3) : "",
  ];
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
