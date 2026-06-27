import { buildBallotRoster, defaultBallotTable, type BallotRow } from "./ballotExport.ts";
import type { Dataset } from "./dataset.ts";
import type { PlayerSummary } from "../engine/types.ts";

/**
 * Push the All-Star ballot roster to a same-origin endpoint so the Gravity
 * Forms ballot tracks live stats with no manual phpMyAdmin paste. Pairs with
 * docs/hnib-ballot-sync.php, which receives this payload and writes the
 * Populate Anything source table.
 */
export interface BallotSyncConfig {
  enabled: boolean;
  url: string; // endpoint, e.g. "./hnib-ballot-sync.php" (same-origin) or a full URL
  token: string; // shared secret, sent as the X-Ballot-Token header
}

export const defaultBallotSyncConfig: BallotSyncConfig = {
  enabled: false,
  url: "./hnib-ballot-sync.php",
  token: "",
};

export interface BallotSyncPayload {
  table: string;
  rows: BallotRow[];
}

/** Build the JSON body the endpoint expects: the target table plus every row. Pure. */
export function ballotSyncPayload(data: Dataset, summaries: Map<string, PlayerSummary>): BallotSyncPayload {
  return { table: defaultBallotTable(data.event), rows: buildBallotRoster(data, summaries) };
}

export interface BallotPushResult {
  written: number;
  table: string;
}

/**
 * POST the roster to the configured endpoint. Resolves with how many rows the
 * server wrote; rejects with a readable message on any failure so callers can
 * surface it without breaking the surrounding sync.
 */
export async function pushBallotRoster(
  data: Dataset,
  summaries: Map<string, PlayerSummary>,
  cfg: BallotSyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BallotPushResult> {
  const url = cfg.url.trim();
  if (!url) throw new Error("No ballot sync URL is set.");
  const payload = ballotSyncPayload(data, summaries);
  if (payload.rows.length === 0) throw new Error("No players to push yet; sync the event first.");

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ballot-Token": cfg.token },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the ballot sync endpoint.");
  }

  const text = await res.text();
  let body: { ok?: boolean; error?: string; written?: number; table?: string } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    /* non-JSON response handled below */
  }
  if (!res.ok || body.ok !== true) {
    throw new Error(body.error || `Ballot sync failed (HTTP ${res.status}).`);
  }
  return { written: body.written ?? payload.rows.length, table: body.table ?? payload.table };
}
