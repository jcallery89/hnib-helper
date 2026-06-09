import type { PlayoffSeed, Standing } from "../../engine/types.ts";
import { buildPlayoffField } from "../../engine/playoff/field.ts";
import { computeStandings } from "../../engine/standings.ts";
import type { Dataset } from "../../io/dataset.ts";

export interface Analysis {
  divisionStandings: Map<string, Standing[]>;
  seeds: PlayoffSeed[];
  warnings: string[];
  resultsEntered: number;
  totalRoundRobin: number;
  nameById: (id: string) => string;
}

/**
 * Derive everything the UI shows from the raw dataset: ranked division
 * standings, the seeded playoff field, and progress counters. Pure - safe to
 * call from a useMemo on every edit.
 */
export function analyze(data: Dataset): Analysis {
  const nameMap = new Map(data.teams.map((t) => [t.id, t.name]));
  const field = buildPlayoffField(data.event, data.divisions, data.teams, data.games, {
    pointSystem: data.event.pointSystem,
    teams: data.teams,
  });

  const rr = data.games.filter((g) => g.round === "rr");
  const resultsEntered = rr.filter((g) => g.status === "final").length;

  return {
    divisionStandings: field.divisionStandings,
    seeds: field.seeds,
    warnings: field.warnings,
    resultsEntered,
    totalRoundRobin: rr.length,
    nameById: (id) => nameMap.get(id) ?? id,
  };
}

/** Overall standings (unranked) for quick lookups. */
export function overallStandings(data: Dataset): Standing[] {
  return computeStandings(data.teams, data.games, data.event.pointSystem);
}
