import { useMemo, useState } from "preact/hooks";
import type { Dataset } from "./io/dataset.ts";
import { loadSampleDataset } from "./io/sampleData.ts";
import { loadSession, saveSession } from "./io/session.ts";
import { analyze } from "./ui/state/store.ts";
import { ResultsView } from "./ui/views/ResultsView.tsx";
import { StandingsView } from "./ui/views/StandingsView.tsx";
import { BracketView } from "./ui/views/BracketView.tsx";
import { ScheduleView } from "./ui/views/ScheduleView.tsx";
import { SetupView } from "./ui/views/SetupView.tsx";

type TabKey = "results" | "standings" | "bracket" | "schedule" | "setup";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "results", label: "Results" },
  { key: "standings", label: "Standings" },
  { key: "bracket", label: "Bracket" },
  { key: "schedule", label: "Schedule" },
  { key: "setup", label: "Setup" },
];

export function App() {
  const [dataset, setDataset] = useState<Dataset>(() => loadSession() ?? loadSampleDataset());
  const [tab, setTab] = useState<TabKey>("results");
  const [asOf, setAsOf] = useState<string | null>(null);

  const analysis = useMemo(() => analyze(dataset, asOf), [dataset, asOf]);

  // Apply a mutation against a fresh clone, persist, and re-render.
  function update(mutate: (draft: Dataset) => void) {
    setDataset((prev) => {
      const next = structuredClone(prev);
      mutate(next);
      saveSession(next);
      return next;
    });
  }

  function replace(next: Dataset) {
    saveSession(next);
    setDataset(next);
  }

  return (
    <div class="app">
      <div class="gradient-bar" />
      <header class="masthead">
        <h1>{dataset.event.name}</h1>
        <span class="meta">
          HNIB Tournament Expert - {dataset.event.year}
        </span>
      </header>

      <nav class="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            class={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div class="card">
        <div class="row" style={{ justifyContent: "space-between" }}>
          <div class="row">
            <span class="section-title" style={{ margin: 0 }}>Results as of</span>
            <input
              type="datetime-local"
              value={asOf ? asOf.slice(0, 16) : ""}
              onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setAsOf(v ? (v.length === 16 ? `${v}:00` : v) : null);
              }}
            />
            {asOf ? (
              <button class="btn" onClick={() => setAsOf(null)}>
                Show all results
              </button>
            ) : (
              <span class="note">showing all entered results</span>
            )}
          </div>
          <span class="note">
            {analysis.resultsEntered} of {analysis.totalRoundRobin} round-robin games counted
          </span>
        </div>
        {asOf && (
          <p class="note">
            Standings, tiebreakers, and the playoff field reflect only games played by {asOf.replace("T", " ").slice(0, 16)}.
          </p>
        )}
      </div>

      {tab === "results" && <ResultsView dataset={dataset} analysis={analysis} update={update} />}
      {tab === "standings" && <StandingsView dataset={dataset} analysis={analysis} />}
      {tab === "bracket" && <BracketView dataset={dataset} analysis={analysis} update={update} />}
      {tab === "schedule" && <ScheduleView dataset={dataset} />}
      {tab === "setup" && <SetupView dataset={dataset} replace={replace} />}

      <footer class="foot">
        Get Seen. Get Recruited. PlayHNIB.com. - @hockey.night
      </footer>
    </div>
  );
}
