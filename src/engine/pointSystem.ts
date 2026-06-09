import type { PointSystem } from "./types.ts";

// HNIB default confirmed by JC: Win 2 / Tie 1 / Loss 0.
// Configurable per event; round-robin allows ties (no overtime).
export const DEFAULT_POINT_SYSTEM: PointSystem = { win: 2, tie: 1, loss: 0 };
