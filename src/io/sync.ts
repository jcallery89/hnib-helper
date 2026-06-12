// One-click sync against the Tourno API (https://hnib.app/api).
//
// Browsers may or may not be allowed to call hnib.app cross-origin (CORS); we
// cannot know until tried. So sync attempts the direct call first and, if that
// fails, retries through a tiny same-origin PHP relay (public/hnib-proxy.php,
// shipped with the site for SiteGround). The schedule is required; divisions
// (/teams) are best-effort.

export interface SyncResult {
  scheduleJson: string;
  teamsJson: string | null;
  source: "direct" | "proxy";
  warnings: string[];
}

const API_BASE = "https://hnib.app/api";
const PROXY_URL = "./hnib-proxy.php";

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export async function syncEvent(eventId: string): Promise<SyncResult> {
  const id = eventId.trim();
  if (!ID_RE.test(id)) {
    throw new Error("That does not look like an event ID. Expected letters, digits, and dashes.");
  }

  const warnings: string[] = [];
  let source: SyncResult["source"] = "direct";

  let scheduleJson: string;
  try {
    scheduleJson = await fetchJsonText(`${API_BASE}/schedule/${id}`);
  } catch {
    // Direct call blocked (likely CORS) or network error - try the relay.
    try {
      scheduleJson = await fetchJsonText(`${PROXY_URL}?path=schedule/${id}`);
      source = "proxy";
    } catch {
      throw new Error(
        "Could not reach hnib.app directly or via the site helper. " +
          "If this keeps happening, make sure hnib-proxy.php is uploaded next to index.html.",
      );
    }
  }

  let teamsJson: string | null = null;
  try {
    teamsJson =
      source === "direct"
        ? await fetchJsonText(`${API_BASE}/teams/${id}`)
        : await fetchJsonText(`${PROXY_URL}?path=teams/${id}`);
  } catch {
    warnings.push("Divisions could not be fetched; assign teams to divisions manually in Setup.");
  }

  return { scheduleJson, teamsJson, source, warnings };
}

async function fetchJsonText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Guard against an HTML error page masquerading as a 200.
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) throw new Error("Response was not JSON");
  return t;
}
