import { useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { SeedingRule } from "../../engine/types.ts";
import { loadSampleDataset, loadDemoDataset } from "../../io/sampleData.ts";
import { clearSession, downloadFile } from "../../io/session.ts";
import { applyResultsCsv, gamesToCsv } from "../../io/csv.ts";
import { parseSchedule } from "../../io/importSchedule.ts";
import { importApiData } from "../../io/importApi.ts";

interface Props {
  dataset: Dataset;
  replace: (next: Dataset) => void;
}

export function SetupView({ dataset, replace }: Props) {
  const [csv, setCsv] = useState("");
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState("");
  const [newDiv, setNewDiv] = useState("");
  const [apiSchedule, setApiSchedule] = useState("");
  const [apiTeams, setApiTeams] = useState("");
  const [apiName, setApiName] = useState("");

  function importApi() {
    const { dataset: next, summary } = importApiData(apiSchedule, apiTeams.trim() || null, {
      eventName: apiName.trim() || dataset.event.name,
    });
    replace(next);
    setMsg(
      `Synced ${summary.teamCount} teams, ${summary.roundRobinGames} round-robin and ${summary.playoffGames} playoff games` +
        (summary.skipped ? `, skipped ${summary.skipped}` : "") +
        (summary.divisionsAssigned ? ", divisions assigned from the API." : ". Now split teams into divisions below.") +
        (summary.warnings.length ? ` (${summary.warnings.slice(0, 2).join(" ")})` : ""),
    );
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
        <p class="section-title">Sync from hnib.app (API data)</p>
        <p class="note">
          The cleanest path: open the event's API URLs in a browser and paste the JSON here. This
          brings in real team colors, identifies playoff rounds exactly, and (with the teams JSON)
          assigns divisions automatically.
          Schedule: hnib.app/api/schedule/EVENT-ID - Divisions: hnib.app/api/teams/EVENT-ID
        </p>
        <input
          type="text"
          style={{ width: "100%", marginBottom: 8 }}
          placeholder="Event name (optional)"
          value={apiName}
          onInput={(e) => setApiName((e.target as HTMLInputElement).value)}
        />
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
              <option value="jrhigh_top2_per_division">Jr. High - top two per division</option>
              <option value="soph_division_winners">Sophomore - division winners</option>
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
        <p class="section-title">Data</p>
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
              clearSession();
              replace(loadSampleDataset());
              setMsg("Session cleared and sample reloaded.");
            }}
          >
            Reset session
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
