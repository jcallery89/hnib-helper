import type { PlayoffSlot } from "./dataset.ts";

/**
 * Pull playoff game times straight from a Tourno /schedule feed and map them to
 * bracket cells, so a sync populates the bracket's times with no manual paste.
 *
 * The feed labels bracket games by Description rather than seed placeholders:
 *   "Play-in 1" / "Play-in 2"        -> the play-in (quarterfinal) cells
 *   "Quarterfinal 1".."Quarterfinal 4"
 *   "Semi-Final 1" / "Semi-Final 2"  -> the semifinal cells
 *   the championship is an unlabeled "Game N" with empty teams (no
 *   "Championship" text and no seeds), followed later by the All-Star game.
 *
 * Numbering matches the bracket structure (Play-in/Semi-Final 1 is the top
 * half), so cells map by the trailing number. The championship has no usable
 * label, so it is taken as the earliest still-to-play game with no real teams -
 * the All-Star exhibition is later, and round-robin games always have teams.
 *
 * Some events label the first round "Playoff 1..4" with the REAL seeded teams
 * filled in, and the numbering follows ice-time order, not bracket order
 * (observed: "Playoff 1" was the 3v6 game). Those map by TEAM PAIR against
 * the seeded field passed in opts.qfTeamPairs; the trailing number is only a
 * last resort when the teams are unknown.
 */
export function extractPlayoffSlots(
  scheduleJson: string,
  fieldSize: number,
  opts: { qfTeamPairs?: Array<{ cellId: string; teams: [string, string] }> } = {},
): { byCell: Record<string, PlayoffSlot>; warnings: string[] } {
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(scheduleJson);
  } catch {
    return { byCell: {}, warnings: ["Schedule JSON could not be parsed for playoff times."] };
  }
  const raw = Array.isArray(data) ? data : (data as { Games?: unknown[] })?.Games;
  if (!Array.isArray(raw)) return { byCell: {}, warnings };

  const byCell: Record<string, PlayoffSlot> = {};
  const finalCandidates: PlayoffSlot[] = [];

  const set = (cell: string, slot: PlayoffSlot) => {
    if (!byCell[cell]) byCell[cell] = slot;
  };

  // Seeded first-round pairs, keyed by their (order-free, normalized) teams.
  const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, "").trim();
  const pairKey = (a: unknown, b: unknown) => [norm(a), norm(b)].sort().join("|");
  const cellByTeams = new Map<string, string>();
  for (const p of opts.qfTeamPairs ?? []) {
    if (p.teams[0] && p.teams[1]) cellByTeams.set(pairKey(p.teams[0], p.teams[1]), p.cellId);
  }

  for (const g of raw as Array<Record<string, unknown>>) {
    const desc = String(g.Description ?? "");
    const d = desc.toLowerCase();
    if (/all[-\s]?star|exhibition/.test(d)) continue;

    const slot: PlayoffSlot = {
      slotStart: normIso(g.Date),
      rink: shortRink(g.Location, g.LocationCode),
      gameNumber: numIn(desc) ?? undefined,
    };
    const num = numIn(desc);

    // A first-round game with real teams maps by the seeded pairing no matter
    // how it is labeled (works for "Playoff N" ice-time numbering too).
    const teamCell =
      cellByTeams.get(pairKey(g.HomeTeamCode, g.AwayTeamCode)) ??
      cellByTeams.get(pairKey(g.HomeTeamName, g.AwayTeamName));

    if (/semi/.test(d)) {
      if (num) set(`sf${num}`, slot);
    } else if (/play-?in|prelim/.test(d)) {
      // In a 12-team field the play-ins are Round 1 (pr cells) below the bye
      // quarterfinals; in 6/8-team fields they ARE the first-round qf cells.
      if (num) set(fieldSize === 12 ? `pr${num}` : `qf${num}`, slot);
    } else if (/quarter/.test(d)) {
      if (num) set(`qf${num}`, slot);
    } else if (/final|championship/.test(d)) {
      set("final", slot);
    } else if (teamCell) {
      set(teamCell, slot);
    } else if (/playoff/.test(d)) {
      // Labeled playoff game whose teams are not known yet: the trailing
      // number is the only signal left.
      if (num) set(`qf${num}`, slot);
    } else {
      // Unlabeled "Game N": a bracket placeholder game has no resolved teams and
      // has not been played; round-robin games always carry real team codes.
      const hasTeams = String(g.HomeTeamCode ?? "").trim() && String(g.AwayTeamCode ?? "").trim();
      const played = String(g.Status ?? "").toUpperCase() === "FINAL";
      if (!hasTeams && !played) finalCandidates.push(slot);
    }
  }

  if (!byCell.final && finalCandidates.length) {
    finalCandidates.sort((a, b) => (a.slotStart ?? "").localeCompare(b.slotStart ?? ""));
    byCell.final = finalCandidates[0];
  }

  // Keep only the cells this field size actually has.
  const valid = fieldSize === 6
    ? new Set(["qf1", "qf2", "sf1", "sf2", "final"])
    : fieldSize === 12
      ? new Set(["pr1", "pr2", "pr3", "pr4", "qf1", "qf2", "qf3", "qf4", "sf1", "sf2", "final"])
      : new Set(["qf1", "qf2", "qf3", "qf4", "sf1", "sf2", "final"]);
  for (const k of Object.keys(byCell)) if (!valid.has(k)) delete byCell[k];

  return { byCell, warnings };
}

// Trailing number in a description ("Semi-Final 2" -> 2, "Play-in 1" -> 1).
function numIn(desc: string): number | null {
  const m = /(\d+)\s*$/.exec(desc.trim());
  return m ? Number(m[1]) : null;
}

// "2026-06-29T12:00:00Z" -> "2026-06-29T12:00:00" (wall-clock; the Z is cosmetic).
function normIso(date: unknown): string | null {
  const s = typeof date === "string" ? date : "";
  const m = s.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return m ? m[0] : null;
}

// "Worcester Ice Center - Lamacchia" -> "Lamacchia"; fall back to the code.
function shortRink(location: unknown, code: unknown): string | null {
  const loc = typeof location === "string" ? location.trim() : "";
  if (loc.includes(" - ")) return loc.split(" - ").pop()!.trim();
  if (loc) return loc;
  const c = typeof code === "string" ? code.trim() : "";
  return c || null;
}
