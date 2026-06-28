import type { PlayoffSlot } from "./dataset.ts";
import { qfPairings } from "../engine/playoff/bracket.ts";

export interface PlayoffScheduleResult {
  /** Mapped slots keyed by bracket game id (qf1..final). */
  byCell: Record<string, PlayoffSlot>;
  matched: number;
  warnings: string[];
}

interface Row {
  num: number;
  slotStart: string | null;
  rink: string | null;
  home: string;
  away: string;
  event: string;
}

/**
 * Parse the master playoff schedule (one tab-separated row per game) and map
 * each game onto its bracket slot. The bracket structure is fixed, so a game's
 * seed placeholders ("Soph 2nd" / "Jr High 5th") and winner references ("W 43")
 * pin it to an exact cell:
 *
 *   Day  Time  Rink  GameNo  Home  Away  Event
 *   Mon 6/29  9:00 AM  Lamacchia  45  Soph 1st  Soph 8th  Sophomore
 *
 * Quarterfinals/play-ins map by their seed pair, semifinals by the games they
 * draw winners from (or, for a 6-team field, by the bye seed), and the
 * championship row maps to the final.
 */
export function parsePlayoffSchedule(
  text: string,
  opts: { fieldSize: number; eventKeyword: string; year: number },
): PlayoffScheduleResult {
  const fieldSize: 6 | 8 = opts.fieldSize === 6 ? 6 : 8;
  const warnings: string[] = [];
  const kw = opts.eventKeyword.toLowerCase();
  const rows = parseRows(text, opts.year).filter(
    (r) => !isAllStar(r.home) && !isAllStar(r.away) && matchesEvent(r, kw),
  );

  const byCell: Record<string, PlayoffSlot> = {};
  const numToCell = new Map<number, string>();
  const pairs = qfPairings(fieldSize);

  // 1) Quarterfinals / play-ins: both sides are seed references.
  for (const r of rows) {
    if (isChampionship(r)) continue;
    const hs = seedRef(r.home);
    const as = seedRef(r.away);
    if (hs == null || as == null) continue;
    const cell = pairs.find((p) => (p.high === hs && p.low === as) || (p.high === as && p.low === hs));
    if (!cell) {
      warnings.push(`No bracket slot for seeds ${hs} vs ${as} (game ${r.num}).`);
      continue;
    }
    byCell[cell.id] = slotOf(r);
    numToCell.set(r.num, cell.id);
  }

  // 2) Semifinals: 8-team "W 45 vs W 46" (the semi those two QFs feed), or
  //    6-team "Jr High 1st vs W 47" (the bye seed picks the semi).
  for (const r of rows) {
    if (isChampionship(r)) continue;
    const hWin = winnerRef(r.home);
    const aWin = winnerRef(r.away);
    const hSeed = seedRef(r.home);
    const aSeed = seedRef(r.away);
    let cellId: string | undefined;
    if (hWin != null && aWin != null) {
      const f1 = pairs.find((p) => p.id === numToCell.get(hWin))?.feeds;
      const f2 = pairs.find((p) => p.id === numToCell.get(aWin))?.feeds;
      cellId = f1 && f1 === f2 ? f1 : undefined;
    } else if ((hSeed != null && aWin != null) || (aSeed != null && hWin != null)) {
      const bye = hSeed ?? aSeed;
      cellId = bye === 1 ? "sf1" : bye === 2 ? "sf2" : undefined;
    }
    if (cellId && !byCell[cellId]) {
      byCell[cellId] = slotOf(r);
      numToCell.set(r.num, cellId);
    }
  }

  // 3) Championship -> the final.
  for (const r of rows) {
    if (isChampionship(r) && !byCell.final) byCell.final = slotOf(r);
  }

  return { byCell, matched: Object.keys(byCell).length, warnings };
}

function parseRows(text: string, year: number): Row[] {
  const rows: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const cols = line.split("\t").map((c) => c.trim());
    if (cols.length < 5) continue;
    const num = Number(cols[3]);
    if (!Number.isFinite(num)) continue;
    rows.push({
      num,
      slotStart: toIso(cols[0], cols[1], year),
      rink: cols[2] || null,
      home: cols[4] ?? "",
      away: cols[5] ?? "",
      event: cols[6] ?? "",
    });
  }
  return rows;
}

function matchesEvent(r: Row, kw: string): boolean {
  if (!kw) return true;
  const hay = `${r.event} ${r.home} ${r.away}`.toLowerCase();
  return hay.includes(kw);
}

// "Soph 2nd" / "Jr High 5th" -> 2 / 5. Ignores "W 43" (no ordinal).
function seedRef(s: string): number | null {
  const m = /(\d+)\s*(st|nd|rd|th)\b/i.exec(s);
  return m ? Number(m[1]) : null;
}

// "W 43" -> 43.
function winnerRef(s: string): number | null {
  const m = /\bW\s*(\d+)\b/i.exec(s);
  return m ? Number(m[1]) : null;
}

function isChampionship(r: Row): boolean {
  return /champ/i.test(r.home) || /champ/i.test(r.away);
}

function isAllStar(s: string): boolean {
  return /all[-\s]?star/i.test(s);
}

function slotOf(r: Row): PlayoffSlot {
  return { slotStart: r.slotStart, rink: r.rink, gameNumber: r.num };
}

// "Mon 6/29" + "8:00 AM" + year -> "2026-06-29T08:00:00" (local-naive).
function toIso(dayCol: string, timeCol: string, year: number): string | null {
  const dm = /(\d{1,2})\/(\d{1,2})/.exec(dayCol);
  const tm = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(timeCol);
  if (!dm || !tm) return null;
  const mon = dm[1].padStart(2, "0");
  const day = dm[2].padStart(2, "0");
  let hour = Number(tm[1]);
  const min = tm[2];
  const ampm = (tm[3] ?? "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${year}-${mon}-${day}T${String(hour).padStart(2, "0")}:${min}:00`;
}
