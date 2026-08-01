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
 */
export function extractPlayoffSlots(
  scheduleJson: string,
  fieldSize: number,
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

    if (/semi/.test(d)) {
      if (num) set(`sf${num}`, slot);
    } else if (/play-?in|prelim|quarter/.test(d)) {
      if (num) set(`qf${num}`, slot);
    } else if (/final|championship/.test(d)) {
      set("final", slot);
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
