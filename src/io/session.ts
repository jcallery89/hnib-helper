import type { Dataset } from "./dataset.ts";

const KEY = "hnib-tournament-expert/dataset";

// Browser-session persistence. localStorage is best-effort: it is wrapped so a
// non-browser context (or a Claude artifact, where storage is unavailable)
// degrades gracefully to in-memory-only state.
export function saveSession(data: Dataset): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable - keep state in memory only */
  }
}

export function loadSession(): Dataset | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Dataset) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
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
