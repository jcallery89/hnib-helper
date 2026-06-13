import type { Dataset } from "./dataset.ts";

// Multi-event browser storage. Each event is saved under its own key, with a
// lightweight index for the switcher and a pointer to the active event. All
// access is wrapped so a non-browser context degrades to in-memory-only.
const PREFIX = "hnib-tournament-expert";
const INDEX_KEY = `${PREFIX}/events`;
const ACTIVE_KEY = `${PREFIX}/active`;
const LEGACY_KEY = `${PREFIX}/dataset`; // single-event storage from before
const dataKey = (id: string) => `${PREFIX}/event/${id}`;

export interface EventIndexEntry {
  id: string;
  name: string;
  year: number;
}

function readIndex(): EventIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as EventIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: EventIndexEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** All saved events, sorted by name. Migrates a legacy single-event store. */
export function listSavedEvents(): EventIndexEntry[] {
  migrateLegacy();
  return readIndex();
}

export function loadEvent(id: string): Dataset | null {
  try {
    const raw = localStorage.getItem(dataKey(id));
    return raw ? (JSON.parse(raw) as Dataset) : null;
  } catch {
    return null;
  }
}

/** Persist an event and upsert it into the index (keyed by its event id). */
export function saveEvent(data: Dataset): void {
  try {
    localStorage.setItem(dataKey(data.event.id), JSON.stringify(data));
    const list = readIndex().filter((e) => e.id !== data.event.id);
    list.push({ id: data.event.id, name: data.event.name, year: data.event.year });
    list.sort((a, b) => a.name.localeCompare(b.name));
    writeIndex(list);
  } catch {
    /* storage unavailable */
  }
}

export function removeEvent(id: string): void {
  try {
    localStorage.removeItem(dataKey(id));
    writeIndex(readIndex().filter((e) => e.id !== id));
    if (getActiveEventId() === id) {
      try {
        localStorage.removeItem(ACTIVE_KEY);
      } catch {
        /* noop */
      }
    }
  } catch {
    /* noop */
  }
}

export function getActiveEventId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveEventId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* noop */
  }
}

/** Wipe every saved event (used by "reset everything"). */
export function clearAllSessions(): void {
  try {
    for (const e of readIndex()) localStorage.removeItem(dataKey(e.id));
    localStorage.removeItem(INDEX_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* noop */
  }
}

function migrateLegacy(): void {
  try {
    if (readIndex().length > 0) return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Dataset;
    saveEvent(data);
    setActiveEventId(data.event.id);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* noop */
  }
}

/** Trigger a client-side file download (CSV or JSON export). */
export function downloadFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
