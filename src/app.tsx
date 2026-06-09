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

  const analysis = useMemo(() => analyze(dataset), [dataset]);

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
