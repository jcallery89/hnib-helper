import seed from "../fixtures/hnib-2025-seed.json";
import type { Dataset } from "./dataset.ts";
import type { Division, Game, HnibEvent, Team } from "../engine/types.ts";

/** The bundled demo event, deep-cloned so edits never mutate the import. */
export function loadSampleDataset(): Dataset {
  return structuredClone({
    event: seed.event as HnibEvent,
    divisions: seed.divisions as Division[],
    teams: seed.teams as Team[],
    games: seed.games as Game[],
  });
}
