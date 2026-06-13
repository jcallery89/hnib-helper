import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Dataset } from "./io/dataset.ts";
import { loadSampleDataset } from "./io/sampleData.ts";
import {
  type EventIndexEntry,
  listSavedEvents,
  loadEvent,
  removeEvent,
  saveEvent,
  getActiveEventId,
  setActiveEventId,
} from "./io/session.ts";
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

// Resolve which event to open: a ?event= URL pin (so a tab can be locked to one
// festival) wins, then the last active event, then the first saved one, then a
// freshly seeded sample.
function bootstrap(): { dataset: Dataset; events: EventIndexEntry[]; activeId: string } {
  const events = listSavedEvents(); // also migrates any legacy single-event store
  const search = typeof window !== "undefined" ? window.location.search : "";
  const urlId = new URLSearchParams(search).get("event");
  const candidate = (urlId && loadEvent(urlId) && urlId) || getActiveEventId() || events[0]?.id || "";
  const existing = candidate ? loadEvent(candidate) : null;
  if (existing) return { dataset: existing, events, activeId: existing.event.id };

  const sample = loadSampleDataset();
  saveEvent(sample);
  setActiveEventId(sample.event.id);
  return { dataset: sample, events: listSavedEvents(), activeId: sample.event.id };
}

function pinUrl(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("event", id);
    window.history.replaceState(null, "", url);
  } catch {
    /* noop */
  }
}

export function App() {
  const boot = useMemo(bootstrap, []);
  const [dataset, setDataset] = useState<Dataset>(boot.dataset);
  const [events, setEvents] = useState<EventIndexEntry[]>(boot.events);
  const [tab, setTab] = useState<TabKey>("results");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  // Keep the URL pinned to the active event from first paint.
  useEffect(() => pinUrl(boot.activeId), [boot.activeId]);

  const analysis = useMemo(() => analyze(dataset, asOf), [dataset, asOf]);

  // Apply a mutation against a fresh clone, persist, and re-render.
  function update(mutate: (draft: Dataset) => void) {
    setDataset((prev) => {
      const next = structuredClone(prev);
      mutate(next);
      saveEvent(next);
      return next;
    });
  }

  // Replace the active event (used by sync/import). Saves, switches to it, and
  // refreshes the switcher list.
  function replace(next: Dataset) {
    saveEvent(next);
    setActiveEventId(next.event.id);
    pinUrl(next.event.id);
    setEvents(listSavedEvents());
    setDataset(next);
  }

  function switchEvent(id: string) {
    const ds = loadEvent(id);
    if (!ds) return;
    setActiveEventId(id);
    pinUrl(id);
    setAsOf(null);
    setAutoSync(false);
    setDataset(ds);
  }

  function removeCurrent() {
    const id = dataset.event.id;
    removeEvent(id);
    const remaining = listSavedEvents();
    setEvents(remaining);
    if (remaining[0]) {
      switchEvent(remaining[0].id);
    } else {
      const sample = loadSampleDataset();
      replace(sample);
    }
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
          <img class="masthead-logo" src={brandUrls.logoNavy} alt="HNIB" />
          <h1>{dataset.event.name}</h1>
        </div>
        <div class="row" style={{ gap: 10 }}>
          {events.length >= 1 && (
            <select
              aria-label="Active event"
              value={dataset.event.id}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v === "__add__") setTab("setup");
                else switchEvent(v);
              }}
            >
              {events.map((ev) => (
                <option value={ev.id} key={ev.id}>
                  {ev.name} ({ev.year})
                </option>
              ))}
              <option value="__add__">+ Add or sync an event...</option>
            </select>
          )}
          <span class="meta">HNIB Tournament Expert</span>
        </div>
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
      {tab === "setup" && (
        <SetupView dataset={dataset} replace={replace} removeCurrent={removeCurrent} eventCount={events.length} />
      )}

      <footer class="foot">
        Get Seen. Get Recruited. PlayHNIB.com. - @hockey.night
      </footer>
    </div>
  );
}
