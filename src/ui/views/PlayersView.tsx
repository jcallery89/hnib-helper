import { useMemo, useRef, useState } from "preact/hooks";
import type { Dataset, EventLeaders, PlayerGameLine } from "../../io/dataset.ts";
import { fetchPlayerGameLog } from "../../io/sync.ts";
import type { Player, PlayerSummary } from "../../engine/types.ts";
import { summarizePlayers, sortByScoring } from "../../engine/players/summary.ts";
import { generateWriteup } from "../../engine/players/writeup.ts";
import { importPlayerStatsCsv, importRosterCsv } from "../../io/importPlayers.ts";
import { listRegistrationEvents, mergeRegistration, type RegistrationReport } from "../../io/importRegistration.ts";
import { PlayerCard } from "../../render/player/PlayerCard.tsx";
import { EXPORT_SIZES } from "../../render/bracket/theme.ts";
import { exportNodePng } from "../../render/exportImage.ts";
import { useBrandAssets } from "../state/useBrand.ts";

interface Props {
  dataset: Dataset;
  update: (mutate: (draft: Dataset) => void) => void;
}

export function PlayersView({ dataset, update }: Props) {
  const brand = useBrandAssets();
  const teams = dataset.teams;
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [rosterText, setRosterText] = useState("");
  const [statsText, setStatsText] = useState("");
  const [msg, setMsg] = useState("");
  const [regEvent, setRegEvent] = useState("");
  const [regReport, setRegReport] = useState<RegistrationReport | null>(null);
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

  const selectedSummary = selected ? summaries.get(selected.id) : undefined;
  const generatedWriteup =
    selected && selectedSummary
      ? generateWriteup({
          player: selected,
          summary: selectedSummary,
          teamName: team?.name ?? "",
          eventName: dataset.event.name,
          gameLog: dataset.playerGameLogs?.[selected.id],
        })
      : "";
  const writeup = (selected ? dataset.playerWriteups?.[selected.id] : undefined) ?? generatedWriteup;

  const regEvents = useMemo(() => listRegistrationEvents(rosterText), [rosterText]);
  const isRegistration = regEvents.length > 0;

  function doImportRoster() {
    if (isRegistration) {
      const eventValue = regEvent || regEvents[0];
      const { players: merged, report } = mergeRegistration(dataset, rosterText, eventValue);
      update((d) => (d.players = merged));
      setRegReport(report);
      setMsg(
        `Registration ("${eventValue}"): enriched ${report.matched} synced players, added ${report.created} new.` +
          (report.warnings.length ? ` ${report.warnings.join(" ")}` : ""),
      );
    } else {
      const result = importRosterCsv(dataset, rosterText);
      update((d) => (d.players = result.players));
      setRegReport(null);
      setMsg(`Roster: ${result.players.length} players. ${result.warnings.slice(0, 3).join(" ")}`.trim());
    }
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
      {dataset.leaders && <LeadersBoard leaders={dataset.leaders} />}

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
            <p class="note">Roster / registration export</p>
            <textarea style={{ width: "100%", height: 110 }} value={rosterText} onInput={(e) => setRosterText((e.target as HTMLTextAreaElement).value)} />
            {isRegistration && (
              <div class="row" style={{ marginTop: 6 }}>
                <span class="note">Import event:</span>
                <select value={regEvent || regEvents[0]} onChange={(e) => setRegEvent((e.target as HTMLSelectElement).value)}>
                  {regEvents.map((ev) => (
                    <option value={ev} key={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button class="btn primary" style={{ marginTop: 6 }} disabled={!rosterText.trim()} onClick={doImportRoster}>
              {isRegistration ? "Match and merge registration" : "Import roster"}
            </button>
            <p class="note" style={{ marginTop: 6 }}>
              Registration files are matched to synced rosters by team and jersey number, with the
              last name as a safety check. Only hockey fields are read - contact, address, and
              payment columns are never imported.
            </p>
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

      {regReport && (
        <div class="card premium">
          <p class="section-title">Registration Match Report</p>
          <p>
            Enriched <strong>{regReport.matched}</strong> synced players, created{" "}
            <strong>{regReport.created}</strong> new.
          </p>
          {regReport.nameMismatches.length > 0 && (
            <div>
              <p class="warn">Name mismatches (left untouched, review these):</p>
              {regReport.nameMismatches.map((m, i) => (
                <p class="warn" key={i}>{m}</p>
              ))}
            </div>
          )}
          {regReport.unassigned.length > 0 && (
            <p class="note">No team or jersey in registration: {regReport.unassigned.join(", ")}</p>
          )}
          {regReport.unknownTeams.length > 0 && (
            <p class="warn">Registration teams not in this event: {regReport.unknownTeams.join(", ")}</p>
          )}
          {regReport.unmatchedAppPlayers.length > 0 && (
            <p class="note">
              App roster spots with no registration row: {regReport.unmatchedAppPlayers.join(", ")}
            </p>
          )}
        </div>
      )}

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
              brand={brand}
              gameLog={dataset.playerGameLogs?.[selected.id]}
              writeup={writeup}
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
                brand={brand}
                gameLog={dataset.playerGameLogs?.[selected.id]}
                writeup={writeup}
              />
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div class="card">
          <p class="section-title">
            Game Log - {selected.firstName} {selected.lastName}
          </p>
          <GameLog
            player={selected}
            log={dataset.playerGameLogs?.[selected.id]}
            update={update}
          />
        </div>
      )}

      {selected && (
        <div class="card">
          <p class="section-title">Scouting Report</p>
          <p class="note">
            Generated from registration info, totals, and the game log. Edit freely - your version
            is kept and appears on the card export. Reset returns to the generated text.
          </p>
          <textarea
            style={{ width: "100%", height: 90 }}
            value={writeup}
            onInput={(e) => {
              const v = (e.target as HTMLTextAreaElement).value;
              update((d) => {
                d.playerWriteups = { ...(d.playerWriteups ?? {}), [selected.id]: v };
              });
            }}
          />
          {dataset.playerWriteups?.[selected.id] !== undefined && (
            <div class="toolbar" style={{ marginTop: 8 }}>
              <button
                class="btn"
                onClick={() =>
                  update((d) => {
                    if (d.playerWriteups) delete d.playerWriteups[selected.id];
                  })
                }
              >
                Reset to generated
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function GameLog({
  player,
  log,
  update,
}: {
  player: Player;
  log: PlayerGameLine[] | undefined;
  update: (mutate: (draft: Dataset) => void) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const isGoalie = player.position === "G";

  async function load() {
    setBusy(true);
    setMsg("");
    try {
      const lines = await fetchPlayerGameLog(player.id);
      update((d) => {
        d.playerGameLogs = { ...(d.playerGameLogs ?? {}), [player.id]: lines };
      });
      if (lines.length === 0) setMsg("No game lines published for this player yet.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not fetch the game log.");
    } finally {
      setBusy(false);
    }
  }

  if (!log) {
    return (
      <div>
        <p class="note">
          Pull this player's game-by-game lines from hnib.app. Once loaded, the lines appear on the
          player card export as well.
        </p>
        <button class="btn secondary" disabled={busy} onClick={load}>
          {busy ? "Fetching..." : "Load game log"}
        </button>
        {msg && <p class="note">{msg}</p>}
      </div>
    );
  }

  return (
    <div>
      <table class="grid">
        <thead>
          <tr>
            <th>Opponent</th>
            {isGoalie ? (
              <>
                <th class="num">Shots</th>
                <th class="num">Saves</th>
                <th class="num">GA</th>
              </>
            ) : (
              <>
                <th class="num">G</th>
                <th class="num">A</th>
                <th class="num">PTS</th>
                <th class="num">PIM</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {log.map((l, i) => (
            <tr key={`${l.opponent}-${i}`}>
              <td>{l.opponent || "-"}</td>
              {isGoalie ? (
                <>
                  <td class="num">{l.shots}</td>
                  <td class="num">{l.saves}</td>
                  <td class="num">{Math.max(0, l.shots - l.saves)}</td>
                </>
              ) : (
                <>
                  <td class="num">{l.goals}</td>
                  <td class="num">{l.assists}</td>
                  <td class="num">{l.points}</td>
                  <td class="num">{l.pim}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div class="toolbar" style={{ marginTop: 8 }}>
        <span class="note">{log.length} games</span>
        <button class="btn" disabled={busy} onClick={load}>
          {busy ? "Fetching..." : "Refresh"}
        </button>
        {msg && <span class="note">{msg}</span>}
      </div>
    </div>
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

const LEADER_CATEGORIES: Array<{
  key: keyof EventLeaders;
  label: string;
  format: (v: number) => string;
}> = [
  { key: "points", label: "Points", format: (v) => String(v) },
  { key: "goals", label: "Goals", format: (v) => String(v) },
  { key: "assists", label: "Assists", format: (v) => String(v) },
  { key: "gaa", label: "GAA", format: (v) => v.toFixed(2) },
  { key: "savePct", label: "SV%", format: (v) => v.toFixed(3).replace(/^0/, "") },
  { key: "pim", label: "PIM", format: (v) => String(v) },
];

function LeadersBoard({ leaders }: { leaders: EventLeaders }) {
  const categories = LEADER_CATEGORIES.filter((c) => (leaders[c.key] ?? []).length > 0);
  if (categories.length === 0) return null;
  return (
    <div class="card premium">
      <p class="section-title">Event Leaders</p>
      <div class="row" style={{ alignItems: "flex-start", gap: 24 }}>
        {categories.map((cat) => (
          <div key={cat.key} style={{ minWidth: 220, flex: 1 }}>
            <p class="note" style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {cat.label}
            </p>
            <table class="grid">
              <tbody>
                {(leaders[cat.key] ?? []).slice(0, 5).map((p, i) => (
                  <tr key={`${cat.key}-${p.playerId || i}`}>
                    <td class="num">{i + 1}</td>
                    <td>
                      #{p.number} {p.firstName} {p.lastName}
                      <span class="muted"> - {p.team}</span>
                    </td>
                    <td class="num">{cat.format(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
