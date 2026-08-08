import { useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { SeedingRule, TiebreakRule } from "../../engine/types.ts";
import { loadSampleDataset, loadDemoDataset } from "../../io/sampleData.ts";
import { clearAllSessions, downloadFile, loadEvent, loadBallotConfig, saveBallotConfig } from "../../io/session.ts";
import { applyResultsCsv, gamesToCsv } from "../../io/csv.ts";
import { parseSchedule } from "../../io/importSchedule.ts";
import { importApiData } from "../../io/importApi.ts";
import { fullSync } from "../../io/sync.ts";
import { pushBallotRoster, type BallotSyncConfig } from "../../io/ballotSync.ts";
import { playerSummaries } from "../state/store.ts";
import { defaultBallotTable } from "../../io/ballotExport.ts";

interface Props {
  dataset: Dataset;
  replace: (next: Dataset) => void;
  removeCurrent: () => void;
  eventCount: number;
}

// 2025 Jr. High Festival, confirmed by JC. Prefilled as a convenient default.
const DEFAULT_EVENT_ID = "63655fc1-1db9-46a5-a948-44f63d297810";

export function SetupView({ dataset, replace, removeCurrent, eventCount }: Props) {
  const [csv, setCsv] = useState("");
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState("");
  const [newDiv, setNewDiv] = useState("");
  const [apiSchedule, setApiSchedule] = useState("");
  const [apiTeams, setApiTeams] = useState("");
  const [apiName, setApiName] = useState("");
  const [syncId, setSyncId] = useState(DEFAULT_EVENT_ID);
  const [syncing, setSyncing] = useState(false);
  const [ballot, setBallot] = useState<BallotSyncConfig>(() => loadBallotConfig());
  const [ballotMsg, setBallotMsg] = useState("");
  const [pushing, setPushing] = useState(false);

  function editBallot(patch: Partial<BallotSyncConfig>) {
    setBallot((prev) => {
      const next = { ...prev, ...patch };
      saveBallotConfig(next);
      return next;
    });
  }

  async function testBallotPush() {
    setPushing(true);
    setBallotMsg("");
    try {
      const pr = await pushBallotRoster(dataset, playerSummaries(dataset), ballot);
      setBallotMsg(`Pushed ${pr.written} players to ${pr.table}.`);
    } catch (e) {
      setBallotMsg(e instanceof Error ? e.message : "Push failed.");
    } finally {
      setPushing(false);
    }
  }

  function applyApiJson(scheduleJson: string, teamsJson: string | null, eventId?: string) {
    const { dataset: next, summary } = importApiData(scheduleJson, teamsJson, {
      eventId,
      eventName: apiName.trim() || dataset.event.name,
    });
    replace(next);
    setMsg(
      `Synced ${summary.teamCount} teams, ${summary.roundRobinGames} round-robin and ${summary.playoffGames} playoff games` +
        (summary.skipped ? `, skipped ${summary.skipped}` : "") +
        (summary.divisionsAssigned ? ", divisions assigned from the API." : ". Now split teams into divisions below.") +
        (summary.warnings.length ? ` (${summary.warnings.slice(0, 2).join(" ")})` : ""),
    );
  }

  async function doSync() {
    setSyncing(true);
    setMsg("");
    try {
      // Re-sync against the SAVED copy of this event id (not whatever is on
      // screen), so syncing a second festival never clobbers the first and a
      // re-sync preserves that event's own playoff entries.
      const prior = loadEvent(syncId.trim());
      const r = await fullSync(syncId, prior, { eventName: apiName.trim() || undefined });
      replace(r.dataset);
      setMsg(
        `Synced ${r.teamCount} teams, ${r.roundRobinGames} round-robin and ${r.playoffGames} playoff games, ` +
          `${r.rosterTeams} rosters (${r.playerCount} players), leaders board ${r.leadersSynced ? "included" : "unavailable"}` +
          (r.divisionsAssigned ? ", divisions assigned." : ". Assign divisions below.") +
          (r.source === "proxy" ? " (fetched via the site helper)" : "") +
          (r.warnings.length ? ` Notes: ${r.warnings.slice(0, 3).join(" ")}` : ""),
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  function importApi() {
    applyApiJson(apiSchedule, apiTeams.trim() || null);
    setApiSchedule("");
    setApiTeams("");
  }

  function edit(mutate: (d: Dataset) => void) {
    const next = structuredClone(dataset);
    mutate(next);
    replace(next);
  }

  function importSchedule() {
    const { dataset: next, summary } = parseSchedule(importText);
    replace(next);
    setMsg(
      `Imported "${summary.eventName}": ${summary.teamCount} teams, ${summary.roundRobinGames} round-robin games, ` +
        `${summary.playoffGames} playoff games` +
        (summary.skippedAllStar ? `, skipped ${summary.skippedAllStar} all-star game(s)` : "") +
        ". Now split the teams into divisions below.",
    );
    setImportText("");
  }

  function moveTeam(teamId: string, toDivId: string) {
    edit((d) => {
      for (const div of d.divisions) div.teamIds = div.teamIds.filter((id) => id !== teamId);
      d.divisions.find((x) => x.id === toDivId)?.teamIds.push(teamId);
      const t = d.teams.find((x) => x.id === teamId);
      if (t) t.divisionId = toDivId;
    });
  }

  function addDivision() {
    const name = newDiv.trim();
    if (!name) return;
    edit((d) => {
      const id = uniqueDivId(d, name);
      d.divisions.push({ id, eventId: d.event.id, name, teamIds: [] });
    });
    setNewDiv("");
  }

  function importCsv() {
    const next = structuredClone(dataset);
    const { updated, errors } = applyResultsCsv(next, csv);
    replace(next);
    setMsg(`Updated ${updated} games. ${errors.length ? errors.join(" ") : ""}`.trim());
  }

  return (
    <section>
      <div class="card premium">
        <p class="section-title">Sync from hnib.app</p>
        <p class="note">
          Enter the event ID and sync. This pulls the schedule, scores, real team colors, exact
          playoff rounds, divisions, every team roster with player stats, and the leaders board
          straight from the live API. Re-sync any time for fresh results; playoff scores you
          entered by hand are kept.
        </p>
        <input
          type="text"
          style={{ width: "100%", marginBottom: 8 }}
          placeholder="Event name (optional)"
          value={apiName}
          onInput={(e) => setApiName((e.target as HTMLInputElement).value)}
        />
        <div class="row" style={{ marginBottom: 12 }}>
          <input
            type="text"
            style={{ flex: 1, minWidth: 280 }}
            placeholder="Event ID (e.g. 63655fc1-1db9-...)"
            value={syncId}
            onInput={(e) => setSyncId((e.target as HTMLInputElement).value)}
          />
          <button class="btn primary" disabled={syncing || !syncId.trim()} onClick={doSync}>
            {syncing ? "Syncing..." : "Sync event"}
          </button>
        </div>
        <p class="note">
          Or paste the JSON yourself - Schedule: hnib.app/api/schedule/EVENT-ID, Divisions:
          hnib.app/api/teams/EVENT-ID
        </p>
        <div class="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p class="note">Schedule JSON (/api/schedule/...)</p>
            <textarea style={{ width: "100%", height: 120 }} value={apiSchedule} onInput={(e) => setApiSchedule((e.target as HTMLTextAreaElement).value)} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p class="note">Divisions JSON (/api/teams/...) - optional</p>
            <textarea style={{ width: "100%", height: 120 }} value={apiTeams} onInput={(e) => setApiTeams((e.target as HTMLTextAreaElement).value)} />
          </div>
        </div>
        <div class="toolbar" style={{ marginTop: 8 }}>
          <button class="btn primary" disabled={!apiSchedule.trim()} onClick={importApi}>
            Sync from JSON
          </button>
        </div>
      </div>

      <div class="card">
        <p class="section-title">All-Star ballot auto-sync</p>
        <p class="note">
          Keep the Gravity Forms All-Star ballot current automatically. When enabled, every sync
          (Sync now and Auto-sync) also pushes this event's roster - team, jersey, position, and
          live stats - to a small endpoint on your site that refreshes the ballot's table.
          hnib-ballot-sync.php ships with the site; set its token, then match it below. See
          docs/ALL-STAR-BALLOT.md for the one-time setup.
        </p>
        <label class="row" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={ballot.enabled}
            onChange={(e) => editBallot({ enabled: (e.target as HTMLInputElement).checked })}
          />
          Push roster to the ballot on every sync
        </label>
        <div class="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <label style={{ flex: 1, minWidth: 260 }}>
            <span class="note">Endpoint URL</span>
            <input
              type="text"
              style={{ width: "100%" }}
              placeholder="./hnib-ballot-sync.php"
              value={ballot.url}
              onInput={(e) => editBallot({ url: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label style={{ flex: 1, minWidth: 260 }}>
            <span class="note">Shared token (matches the PHP file)</span>
            <input
              type="password"
              style={{ width: "100%" }}
              placeholder="long random string"
              value={ballot.token}
              onInput={(e) => editBallot({ token: (e.target as HTMLInputElement).value })}
            />
          </label>
        </div>
        <div class="toolbar" style={{ marginTop: 8 }}>
          <button class="btn secondary" disabled={pushing || !ballot.url.trim()} onClick={testBallotPush}>
            {pushing ? "Pushing..." : "Test push now"}
          </button>
          <span class="note">Target table: {defaultBallotTable(dataset.event)}</span>
        </div>
        {ballotMsg && <p class="note">{ballotMsg}</p>}
      </div>

      <div class="card">
        <p class="section-title">Import a Schedule from hnib.app (text paste)</p>
        <p class="note">
          Open the event's schedule page, select the whole list of games (teams, dates, times, and
          scores), and paste it here. The importer separates round-robin from playoff games and skips
          All-Star exhibitions. Then assign the teams to divisions below.
        </p>
        <textarea
          style={{ width: "100%", height: 140 }}
          placeholder="Paste the schedule text here..."
          value={importText}
          onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="toolbar" style={{ marginTop: 8 }}>
          <button class="btn primary" disabled={!importText.trim()} onClick={importSchedule}>
            Import schedule
          </button>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Divisions</p>
        <p class="note">
          Seeds 1-4 come from the top teams in each division, so the split matters. Move each team to
          its division.
        </p>
        {dataset.divisions.map((div) => (
          <p key={div.id}>
            <strong>{div.name}</strong> ({div.teamIds.length}):{" "}
            {div.teamIds.map((id) => dataset.teams.find((t) => t.id === id)?.name ?? id).join(", ") || <span class="muted">empty</span>}
          </p>
        ))}
        <table class="grid">
          <thead>
            <tr>
              <th>Team</th>
              <th>Division</th>
            </tr>
          </thead>
          <tbody>
            {dataset.teams.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  <select value={t.divisionId} onChange={(e) => moveTeam(t.id, (e.target as HTMLSelectElement).value)}>
                    {dataset.divisions.map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="toolbar" style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="New division name (e.g. EAST)"
            value={newDiv}
            onInput={(e) => setNewDiv((e.target as HTMLInputElement).value)}
          />
          <button class="btn secondary" onClick={addDivision}>
            Add division
          </button>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Team Colors</p>
        <p class="note">
          Colors for the Share graphics. Each team's color is pulled from its record in the API on
          sync; override any here if it is wrong. Your overrides are kept through re-syncs.
        </p>
        <div class="row" style={{ flexWrap: "wrap", gap: 12 }}>
          {dataset.teams.map((t) => (
            <label key={t.id} class="row" style={{ gap: 8, minWidth: 180 }}>
              <input
                type="color"
                value={t.colorPrimary && /^#[0-9a-fA-F]{6}$/.test(t.colorPrimary) ? t.colorPrimary : "#1c2660"}
                onChange={(e) =>
                  edit((d) => {
                    const hex = (e.target as HTMLInputElement).value;
                    const tt = d.teams.find((x) => x.id === t.id);
                    if (tt) tt.colorPrimary = hex;
                    d.teamColors = { ...(d.teamColors ?? {}), [t.id]: hex };
                  })
                }
              />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      <div class="card">
        <p class="section-title">Event</p>
        <div class="row" style={{ gap: 24 }}>
          <label class="row">
            <input
              type="checkbox"
              checked={dataset.event.hasPlayoffBracket}
              onChange={(e) => edit((d) => (d.event.hasPlayoffBracket = (e.target as HTMLInputElement).checked))}
            />
            Runs a playoff bracket
          </label>
          <label class="row">
            Seeding rule:
            <select
              value={dataset.event.seedingRule}
              onChange={(e) => edit((d) => (d.event.seedingRule = (e.target as HTMLSelectElement).value as SeedingRule))}
            >
              <option value="jrhigh_winners_next_two">Jr. High: winners + next two per division, pooled (6 teams)</option>
              <option value="jrhigh_top2_per_division">Sophomore / Girls Major: winners + runners-up + wildcards (8 or 12 teams)</option>
              <option value="soph_division_winners">Legacy: division winners only, then wildcards (not standard)</option>
            </select>
          </label>
          <label class="row">
            Playoff teams:
            <input
              type="number"
              style={{ width: 64 }}
              min={2}
              value={dataset.event.fieldSize ?? 8}
              onInput={(e) => edit((d) => (d.event.fieldSize = Math.max(2, Number((e.target as HTMLInputElement).value) || 8)))}
            />
          </label>
          <label class="row">
            Tiebreak order:
            <select
              value={dataset.event.tiebreakRule ?? "standard"}
              onChange={(e) =>
                edit((d) => (d.event.tiebreakRule = (e.target as HTMLSelectElement).value as TiebreakRule))
              }
            >
              <option value="standard">Standard: wins, then head-to-head</option>
              <option value="girls_major">Girls Major: head-to-head first</option>
            </select>
          </label>
        </div>
        <div class="row" style={{ gap: 16, marginTop: 12 }}>
          <span class="muted">Point system:</span>
          {(["win", "tie", "loss"] as const).map((k) => (
            <label class="row" key={k}>
              {k}
              <input
                type="number"
                style={{ width: 64 }}
                value={dataset.event.pointSystem[k]}
                onInput={(e) =>
                  edit((d) => (d.event.pointSystem[k] = Number((e.target as HTMLInputElement).value) || 0))
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div class="card">
        <p class="section-title">Data &amp; Events</p>
        <p class="note">
          {eventCount} event{eventCount === 1 ? "" : "s"} saved in this browser. Each synced or
          imported event is stored separately - use the event switcher in the header to move between
          festivals, and pin a browser tab to one event by adding <code>?event=ID</code> to the
          address, so two tabs can run two festivals at once, each refreshing on its own.
        </p>
        <div class="toolbar">
          <button class="btn" onClick={() => replace(loadSampleDataset())}>
            Load 2025 Jr. High sample
          </button>
          <button class="btn" onClick={() => replace(loadDemoDataset())}>
            Load synthetic demo
          </button>
          <button
            class="btn"
            onClick={() => {
              if (confirm(`Remove "${dataset.event.name}" from this browser? Other events are kept.`)) {
                removeCurrent();
                setMsg("Event removed.");
              }
            }}
          >
            Remove this event
          </button>
          <button
            class="btn"
            onClick={() => {
              if (confirm("Remove ALL saved events from this browser and reload the sample?")) {
                clearAllSessions();
                replace(loadSampleDataset());
                setMsg("All events cleared and sample reloaded.");
              }
            }}
          >
            Reset everything
          </button>
          <button
            class="btn secondary"
            onClick={() => downloadFile(`${dataset.event.year}-results.csv`, gamesToCsv(dataset), "text/csv")}
          >
            Export results CSV
          </button>
          <button
            class="btn secondary"
            onClick={() =>
              downloadFile(`${dataset.event.year}-dataset.json`, JSON.stringify(dataset, null, 2), "application/json")
            }
          >
            Export dataset JSON
          </button>
        </div>
        <p class="section-title" style={{ marginTop: 16 }}>
          Import Results CSV
        </p>
        <p class="note">
          Paste a results CSV (columns id, homeScore, awayScore, decidedBy). Scores match existing
          games by id.
        </p>
        <textarea
          style={{ width: "100%", height: 100 }}
          value={csv}
          onInput={(e) => setCsv((e.target as HTMLTextAreaElement).value)}
        />
        <div class="toolbar" style={{ marginTop: 8 }}>
          <button class="btn primary" onClick={importCsv}>
            Apply CSV
          </button>
        </div>
        {msg && <p class="note">{msg}</p>}
      </div>
    </section>
  );
}

function uniqueDivId(d: Dataset, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "div";
  const used = new Set(d.divisions.map((x) => x.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
