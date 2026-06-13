import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "../src/io/dataset.ts";
import { DEFAULT_POINT_SYSTEM } from "../src/engine/pointSystem.ts";

// Minimal in-memory localStorage so the storage layer can be exercised in Node.
function installLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function makeEvent(id: string, name: string, year = 2025): Dataset {
  return {
    event: { id, name, year, venues: [], format: "festival", hasPlayoffBracket: true, seedingRule: "jrhigh_top2_per_division", pointSystem: { ...DEFAULT_POINT_SYSTEM } },
    divisions: [],
    teams: [],
    games: [],
  };
}

// Import fresh each test so the module's view of localStorage is the stub.
async function loadModule() {
  vi.resetModules();
  return import("../src/io/session.ts");
}

describe("multi-event session storage", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("saves, lists, loads, and removes independent events", async () => {
    const s = await loadModule();
    s.saveEvent(makeEvent("jrhigh-2025", "Jr. High Festival"));
    s.saveEvent(makeEvent("soph-2025", "Sophomore Tournament"));

    expect(s.listSavedEvents().map((e) => e.id).sort()).toEqual(["jrhigh-2025", "soph-2025"]);
    expect(s.loadEvent("soph-2025")?.event.name).toBe("Sophomore Tournament");

    s.removeEvent("jrhigh-2025");
    expect(s.listSavedEvents().map((e) => e.id)).toEqual(["soph-2025"]);
    expect(s.loadEvent("jrhigh-2025")).toBeNull();
  });

  it("tracks the active event and clears it when that event is removed", async () => {
    const s = await loadModule();
    s.saveEvent(makeEvent("a", "A"));
    s.setActiveEventId("a");
    expect(s.getActiveEventId()).toBe("a");
    s.removeEvent("a");
    expect(s.getActiveEventId()).toBeNull();
  });

  it("migrates a legacy single-event store into the registry", async () => {
    localStorage.setItem("hnib-tournament-expert/dataset", JSON.stringify(makeEvent("legacy-1", "Legacy Event")));
    const s = await loadModule();
    const events = s.listSavedEvents(); // triggers migration
    expect(events.map((e) => e.id)).toEqual(["legacy-1"]);
    expect(s.getActiveEventId()).toBe("legacy-1");
    expect(localStorage.getItem("hnib-tournament-expert/dataset")).toBeNull();
  });

  it("wipes everything on reset", async () => {
    const s = await loadModule();
    s.saveEvent(makeEvent("a", "A"));
    s.saveEvent(makeEvent("b", "B"));
    s.setActiveEventId("b");
    s.clearAllSessions();
    expect(s.listSavedEvents()).toEqual([]);
    expect(s.getActiveEventId()).toBeNull();
  });
});
