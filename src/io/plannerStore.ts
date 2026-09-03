import type { Scenario, ScenarioFile } from "../engine/planner/types.ts";

// Planner scenarios persist in the browser alongside the events. The
// standalone planner file never touches storage; it uses the JSON export.
const KEY = "hnib-tournament-expert/planner";

export function loadScenarios(): Scenario[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = parseScenarioFile(raw);
    return parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function saveScenarios(scenarios: Scenario[]): void {
  try {
    localStorage.setItem(KEY, serializeScenarios(scenarios));
  } catch {
    /* storage unavailable */
  }
}

export function serializeScenarios(scenarios: Scenario[]): string {
  const file: ScenarioFile = { version: 1, scenarios };
  return JSON.stringify(file, null, 2);
}

/** Parse a scenario file, tolerating a bare array. Throws on anything else. */
export function parseScenarioFile(text: string): Scenario[] {
  const data = JSON.parse(text) as ScenarioFile | Scenario[];
  const list = Array.isArray(data) ? data : data.scenarios;
  if (!Array.isArray(list)) throw new Error("Not a planner scenario file.");
  for (const s of list) {
    if (!s || typeof s !== "object" || !s.structure || !s.costs || !s.pricing) throw new Error("A scenario is missing its structure, costs, or pricing.");
  }
  return list;
}
