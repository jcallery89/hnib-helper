import { useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { SeedingRule } from "../../engine/types.ts";
import { loadSampleDataset } from "../../io/sampleData.ts";
import { clearSession, downloadFile } from "../../io/session.ts";
import { applyResultsCsv, gamesToCsv } from "../../io/csv.ts";

interface Props {
  dataset: Dataset;
  replace: (next: Dataset) => void;
}

export function SetupView({ dataset, replace }: Props) {
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState("");

  function edit(mutate: (d: Dataset) => void) {
    const next = structuredClone(dataset);
    mutate(next);
    replace(next);
  }

  function importCsv() {
    const next = structuredClone(dataset);
    const { updated, errors } = applyResultsCsv(next, csv);
    replace(next);
    setMsg(`Updated ${updated} games. ${errors.length ? errors.join(" ") : ""}`.trim());
  }

  return (
    <section>
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
        <p class="section-title">Teams ({dataset.teams.length})</p>
        {dataset.divisions.map((div) => (
          <p key={div.id}>
            <strong>{div.name}:</strong>{" "}
            {div.teamIds.map((id) => dataset.teams.find((t) => t.id === id)?.name ?? id).join(", ")}
          </p>
        ))}
      </div>

      <div class="card">
        <p class="section-title">Data</p>
        <div class="toolbar">
          <button class="btn" onClick={() => replace(loadSampleDataset())}>
            Reload sample event
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
          Paste a results CSV (columns id, homeScore, awayScore, decidedBy). Scores are matched to
          existing games by id, so a stray name can never create a phantom game.
        </p>
        <textarea
          style={{ width: "100%", height: 120 }}
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
