import { useMemo } from "preact/hooks";
import { defaultScenarios } from "../../engine/planner/index.ts";
import type { EventIndexEntry } from "../../io/session.ts";
import { loadEvent } from "../../io/session.ts";
import { loadScenarios, saveScenarios } from "../../io/plannerStore.ts";
import { structureFromEvent } from "../../io/plannerFromEvent.ts";
import { PlannerApp } from "../planner/PlannerApp.tsx";

interface Props {
  events: EventIndexEntry[];
}

/**
 * The Planner tab: the shared planner with scenarios persisted in the browser
 * and a "seed from a past event" control fed by the synced events.
 */
export function PlannerView({ events }: Props) {
  const initial = useMemo(() => loadScenarios() ?? defaultScenarios(), []);
  return (
    <PlannerApp
      initial={initial}
      onChange={saveScenarios}
      eventSources={events}
      deriveFromEvent={(id) => {
        const ds = loadEvent(id);
        return ds ? structureFromEvent(ds) : null;
      }}
    />
  );
}
