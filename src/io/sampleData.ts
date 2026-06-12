import jrhigh2025 from "../fixtures/jrhigh-2025.json";
import demoSeed from "../fixtures/hnib-2025-seed.json";
import type { Dataset } from "./dataset.ts";

function clone(seed: unknown): Dataset {
  return structuredClone(seed) as Dataset;
}

/** The real 2025 Jr. High Festival (round-robin results), used as the default. */
export function loadSampleDataset(): Dataset {
  return clone(jrhigh2025);
}

/** A small synthetic event kept for demonstrations and tests. */
export function loadDemoDataset(): Dataset {
  return clone(demoSeed);
}
