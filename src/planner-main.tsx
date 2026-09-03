import { render } from "preact";
import { defaultScenarios } from "./engine/planner/index.ts";
import type { Scenario } from "./engine/planner/types.ts";
import { parseScenarioFile } from "./io/plannerStore.ts";
import logoUrl from "./assets/brand/logo_white_transparent.png";
import { PlannerApp } from "./ui/planner/PlannerApp.tsx";

// Entry point for the standalone hnib-event-planner.html. No storage, no
// network: scenarios live in memory and travel via the JSON buttons.
//
// A future staff member can change what the file opens with by editing the
// <script id="hnib-planner-defaults"> JSON block near the top of the built
// HTML file (a saved scenario file pasted there is enough); the source
// defaults live in src/engine/planner/defaults.ts.

function seededScenarios(): Scenario[] {
  try {
    const el = document.getElementById("hnib-planner-defaults");
    const text = el?.textContent?.trim();
    if (text) return parseScenarioFile(text);
  } catch {
    /* fall back to the built-in defaults */
  }
  return defaultScenarios();
}

const root = document.getElementById("planner");
if (root) render(<PlannerApp initial={seededScenarios()} masthead logoUrl={logoUrl} />, root);
