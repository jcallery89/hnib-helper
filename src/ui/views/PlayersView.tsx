import { useMemo, useRef, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Player, PlayerSummary } from "../../engine/types.ts";
import { summarizePlayers, sortByScoring } from "../../engine/players/summary.ts";
import { importPlayerStatsCsv, importRosterCsv } from "../../io/importPlayers.ts";
import { PlayerCard } from "../../render/player/PlayerCard.tsx";
import { EXPORT_SIZES } from "../../render/bracket/theme.ts";
import { exportNodePng } from "../../render/exportImage.ts";

interface Props {
  dataset: Dataset;
  update: (mutate: (draft: Dataset) => void) => void;
}

export function PlayersView({ dataset, update }: Props) {
  const teams = dataset.teams;
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [rosterText, setRosterText] = useState("");
  const [statsText, setStatsText] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [sizeKey, setSizeKey] = useState(EXPORT_SIZES[2].key); // square default
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const players = dataset.players ?? [];
  const summaries = useMemo(
    () => new Map(summarizePlayers(players, dataset.playerStats ?? []).map((s) => [s.playerId, s])),
    [players, dataset.playerStats],
  );

  const teamPlayers = players.filter((p) => p.teamId === teamId);
  const withSummary = teamPlayers.map((p) => ({ player: p, summary: summaries.get(p.id)! }));
  const skaters = sortByScoring(withSummary.filter((x) => !x.summary.isGoalie).map((x) => x.summary))
    .map((s) => withSummary.find((x) => x.summary.playerId === s.playerId)!)
    .filter(Boolean);
  const goalies = withSummary.filter((x) => x.summary.isGoalie);

  const size = EXPORT_SIZES.find((s) => s.key === sizeKey) ?? EXPORT_SIZES[2];
  const selected =
    teamPlayers.find((p) => p.id === selectedPlayerId) ?? skaters[0]?.player ?? teamPlayers[0] ?? null;
  const team = teams.find((t) => t.id === teamId);

  function doImportRoster() {
    const result = importRosterCsv(dataset, rosterText);
    update((d) => (d.players = result.players));
    setMsg(`Roster: ${result.players.length} players. ${result.warnings.slice(0, 3).join(" ")}`.trim());
    setRosterText("");
  }

  function doImportStats() {
    const result = importPlayerStatsCsv(dataset, statsText);
    update((d) => (d.playerStats = result.lines));
    setMsg(`Stats: matched ${result.matched}, unmatched ${result.unmatched}. ${result.warnings.slice(0, 3).join(" ")}`.trim());
    setStatsText("");
  }

  async function doExport() {
    if (!exportRef.current || !selected) return;
    setBusy(true);
    try {
      await exportNodePng(
        exportRef.current,
        size.width,
        size.height,
        `${slug(team?.name ?? "team")}-${selected.jersey ?? ""}-${slug(`${selected.firstName}-${selected.lastName}`)}.png`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div class="card premium">
        <p class="section-title">Import Players</p>
        <p class="note">
          Paste a registration export (roster) and, when you have them, a stats export. Columns are
          matched flexibly by header name; players tie to the schedule by team and jersey number.
          Common columns: name (or first/last), team, jersey, position, class, height, hometown - and
          for stats: team, jersey, goals, assists, pim (or goalie saves, ga, shots).
        </p>
        <div class="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p class="note">Roster (registration)</p>
            <textarea style={{ width: "100%", height: 110 }} value={rosterText} onInput={(e) => setRosterText((e.target as HTMLTextAreaElement).value)} />
            <button class="btn primary" style={{ marginTop: 6 }} disabled={!rosterText.trim()} onClick={doImportRoster}>
              Import roster
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p class="note">Player stats</p>
            <textarea style={{ width: "100%", height: 110 }} value={statsText} onInput={(e) => setStatsText((e.target as HTMLTextAreaElement).value)} />
            <button class="btn secondary" style={{ marginTop: 6 }} disabled={!statsText.trim()} onClick={doImportStats}>
              Import stats
            </button>
          </div>
        </div>
        {msg && <p class="note">{msg}</p>}
      </div>

      <div class="card">
        <div class="toolbar">
          <label class="row">
            Team:
            <select value={teamId} onChange={(e) => { setTeamId((e.target as HTMLSelectElement).value); setSelectedPlayerId(null); }}>
              {teams.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {teamPlayers.length === 0 ? (
          <p class="note">No roster for this team yet. Import a registration export above.</p>
        ) : (
          <>
            <p class="section-title">Skaters</p>
            <table class="grid">
              <thead>
                <tr>
                  <th class="num">#</th>
                  <th>Name</th>
                  <th>Pos</th>
                  <th class="num">Class</th>
                  <th class="num">GP</th>
                  <th class="num">G</th>
                  <th class="num">A</th>
                  <th class="num">PTS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {skaters.map(({ player, summary }) => (
                  <PlayerRow key={player.id} player={player} summary={summary} selected={selected?.id === player.id} onSelect={() => setSelectedPlayerId(player.id)} />
                ))}
              </tbody>
            </table>

            {goalies.length > 0 && (
              <>
                <p class="section-title" style={{ marginTop: 16 }}>Goaltenders</p>
                <table class="grid">
                  <thead>
                    <tr>
                      <th class="num">#</th>
                      <th>Name</th>
                      <th class="num">Class</th>
                      <th class="num">GP</th>
                      <th class="num">GAA</th>
                      <th class="num">SV%</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {goalies.map(({ player, summary }) => (
                      <tr key={player.id} style={selected?.id === player.id ? { background: "rgba(168,204,224,.08)" } : undefined}>
                        <td class="num">{player.jersey ?? ""}</td>
                        <td>{player.firstName} {player.lastName}</td>
                        <td class="num">{player.classYear ?? ""}</td>
                        <td class="num">{summary.gp}</td>
                        <td class="num">{summary.gaa !== undefined ? summary.gaa.toFixed(2) : "-"}</td>
                        <td class="num">{summary.savePct !== undefined ? summary.savePct.toFixed(3).replace(/^0/, "") : "-"}</td>
                        <td><button class="btn" onClick={() => setSelectedPlayerId(player.id)}>Card</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>

      {selected && summaries.get(selected.id) && (
        <div class="card">
          <p class="section-title">Player Card</p>
          <div class="toolbar">
            <select value={sizeKey} onChange={(e) => setSizeKey((e.target as HTMLSelectElement).value)}>
              {EXPORT_SIZES.map((s) => (
                <option value={s.key} key={s.key}>{s.label}</option>
              ))}
            </select>
            <button class="btn primary" disabled={busy} onClick={doExport}>
              {busy ? "Rendering..." : "Export PNG"}
            </button>
          </div>
          <div class="bracket-preview" style={{ maxWidth: 520, margin: "0 auto" }}>
            <PlayerCard
              width={size.width}
              height={size.height}
              player={selected}
              summary={summaries.get(selected.id)!}
              teamName={team?.name ?? ""}
              eventName={dataset.event.name}
              accentColor={team?.colorPrimary}
            />
          </div>
          <div style={{ position: "absolute", left: -99999, top: 0 }} aria-hidden="true">
            <div ref={exportRef} style={{ width: size.width, height: size.height }}>
              <PlayerCard
                width={size.width}
                height={size.height}
                player={selected}
                summary={summaries.get(selected.id)!}
                teamName={team?.name ?? ""}
                eventName={dataset.event.name}
                accentColor={team?.colorPrimary}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlayerRow({ player, summary, selected, onSelect }: { player: Player; summary: PlayerSummary; selected: boolean; onSelect: () => void }) {
  return (
    <tr style={selected ? { background: "rgba(168,204,224,.08)" } : undefined}>
      <td class="num">{player.jersey ?? ""}</td>
      <td>{player.firstName} {player.lastName}</td>
      <td>{player.position ?? ""}</td>
      <td class="num">{player.classYear ?? ""}</td>
      <td class="num">{summary.gp}</td>
      <td class="num">{summary.goals}</td>
      <td class="num">{summary.assists}</td>
      <td class="num">{summary.points}</td>
      <td><button class="btn" onClick={onSelect}>Card</button></td>
    </tr>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
