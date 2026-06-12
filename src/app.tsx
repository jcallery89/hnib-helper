import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Dataset } from "./io/dataset.ts";
import { loadSampleDataset } from "./io/sampleData.ts";
import { loadSession, saveSession } from "./io/session.ts";
import { fullSync } from "./io/sync.ts";
import { brandUrls } from "./render/brand.ts";
import { analyze } from "./ui/state/store.ts";
import { ResultsView } from "./ui/views/ResultsView.tsx";
import { StandingsView } from "./ui/views/StandingsView.tsx";
import { BracketView } from "./ui/views/BracketView.tsx";
import { ScheduleView } from "./ui/views/ScheduleView.tsx";
import { PlayersView } from "./ui/views/PlayersView.tsx";
import { SetupView } from "./ui/views/SetupView.tsx";

type TabKey = "results" | "standings" | "bracket" | "schedule" | "players" | "setup";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "results", label: "Results" },
  { key: "standings", label: "Standings" },
  { key: "bracket", label: "Bracket" },
  { key: "schedule", label: "Schedule" },
  { key: "players", label: "Players" },
  { key: "setup", label: "Setup" },
];

// Re-sync cadence for tournament days.
const AUTO_SYNC_MS = 3 * 60 * 1000;

export function App() {
  const [dataset, setDataset] = useState<Dataset>(() => loadSession() ?? loadSampleDataset());
  const [tab, setTab] = useState<TabKey>("results");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

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

  // Auto-sync: only offered once the loaded event came from an hnib.app sync
  // (its id is the API event UUID). Re-syncs in place, keeping local playoff
  // entries; a failed pass keeps the current data and reports quietly.
  const datasetRef = useRef(dataset);
  datasetRef.current = dataset;
  const canAutoSync = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(dataset.event.id);

  useEffect(() => {
    if (!autoSync || !canAutoSync) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fullSync(datasetRef.current.event.id, datasetRef.current);
        if (cancelled) return;
        replace(r.dataset);
        setSyncStatus(`Last synced ${new Date().toLocaleTimeString()}`);
      } catch {
        if (!cancelled) setSyncStatus(`Sync failed ${new Date().toLocaleTimeString()} - kept current data`);
      }
    };
    run();
    const timer = setInterval(run, AUTO_SYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [autoSync, canAutoSync, dataset.event.id]);

  return (
    <div class="app">
      <div class="gradient-bar" />
      <header class="masthead">
        <div class="row" style={{ gap: 14 }}>
          <img class="masthead-logo" src={brandUrls.logoWhite} alt="HNIB" />
          <h1>{dataset.event.name}</h1>
        </div>
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
          <div class="row">
            {canAutoSync && (
              <label class="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync((e.target as HTMLInputElement).checked)}
                />
                Auto-sync (3 min)
              </label>
            )}
            {syncStatus && <span class="note">{syncStatus}</span>}
            <span class="note">
              {analysis.resultsEntered} of {analysis.totalRoundRobin} round-robin games counted
            </span>
          </div>
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
      {tab === "players" && <PlayersView dataset={dataset} update={update} />}
      {tab === "setup" && <SetupView dataset={dataset} replace={replace} />}

      <footer class="foot">
        Get Seen. Get Recruited. PlayHNIB.com. - @hockey.night
      </footer>
    </div>
  );
}
