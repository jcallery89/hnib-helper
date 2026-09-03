import { describe, expect, it } from "vitest";
import { structureFromEvent } from "../../src/io/plannerFromEvent.ts";
import { parseScenarioFile, serializeScenarios } from "../../src/io/plannerStore.ts";
import { defaultScenarios } from "../../src/engine/planner/index.ts";
import type { Dataset } from "../../src/io/dataset.ts";
import fixture from "../../src/fixtures/jrhigh-2025.json";

describe("planner structure from a synced event", () => {
  it("reads teams, games per team, days, sheets, block cadence, and playoffs from the 2025 Jr. High event", () => {
    const { structure, notes } = structureFromEvent(fixture as unknown as Dataset);
    expect(structure.teams).toBe(9);
    expect(structure.gamesPerTeam).toBe(4);
    expect(structure.sheets).toBe(2);
    expect(structure.days).toBeGreaterThanOrEqual(2);
    expect(structure.dayLabels?.[0]).toBe("Friday");
    expect(structure.blockMinutes).toBeGreaterThan(60);
    expect(structure.firstIce).toMatch(/^\d\d:\d\d$/);
    // The fixture holds only the round robin.
    expect(structure.playoffs).toBe("none");
    expect(notes.length).toBeGreaterThan(3);
  });

  it("maps synced playoff rounds to the planner's playoff format", () => {
    const base = fixture as unknown as Dataset;
    const withQf: Dataset = {
      ...base,
      games: [...base.games, { ...base.games[0], id: "qf1", round: "qf", slotStart: "2025-07-01T08:00:00" }],
    };
    expect(structureFromEvent(withQf).structure.playoffs).toBe("quarters");
    const withFinal: Dataset = {
      ...base,
      games: [...base.games, { ...base.games[0], id: "f", round: "final", slotStart: null }],
    };
    expect(structureFromEvent(withFinal).structure.playoffs).toBe("final");
  });
});

describe("scenario files", () => {
  it("round-trips scenarios through JSON", () => {
    const scenarios = defaultScenarios();
    const parsed = parseScenarioFile(serializeScenarios(scenarios));
    expect(parsed).toEqual(scenarios);
    expect(() => parseScenarioFile('{"nope":1}')).toThrow();
  });
});
