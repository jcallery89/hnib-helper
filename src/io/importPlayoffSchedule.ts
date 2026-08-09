import type { PlayoffSlot } from "./dataset.ts";
import { byePairings, qfPairings } from "../engine/playoff/bracket.ts";

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
 * Parse a playoff schedule and map each game onto its bracket slot. Two input
 * shapes are accepted:
 *
 * 1. The tab-separated master schedule, one row per game:
 *      Day  Time  Rink  GameNo  Home  Away  Event
 *      Mon 6/29  9:00 AM  Lamacchia  45  Soph 1st  Soph 8th  Sophomore
 *
 * 2. The published listing (a date header, then time / matchup / rink lines):
 *      Sunday, August 9 - Playoffs
 *      8:00 AM
 *      12th seed vs 5th seed
 *      Lamacchia
 *
 * The bracket structure is fixed, so matchup text pins each game to an exact
 * cell: first-round games by their seed pair ("12th seed vs 5th seed"), bye
 * games by the bye seed plus a winner reference ("5/12 winner vs 4th seed",
 * "Jr High 1st vs W 47"), "W 45 vs W 46" by the game those two feed, bare
 * "Semifinal" rows in listing order, and any championship row to the final.
 */
export function parsePlayoffSchedule(
  text: string,
  opts: { fieldSize: number; eventKeyword: string; year: number },
): PlayoffScheduleResult {
  const fieldSize: 6 | 8 | 12 = opts.fieldSize === 6 ? 6 : opts.fieldSize === 12 ? 12 : 8;
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

  // 2) Later rounds. "W 45 vs W 46" maps to the game those two feed; a bye seed
  //    plus a winner ref ("Jr High 1st vs W 47", or a Girls Major "1st vs W 63")
  //    maps to that seed's bye game. Two passes so a 12-team field resolves its
  //    quarterfinals before the semifinals that reference them, whatever the row
  //    order.
  const byes = byePairings(fieldSize);
  const feedsByCell = new Map<string, string>();
  for (const p of pairs) feedsByCell.set(p.id, p.feeds);
  for (const b of byes) feedsByCell.set(b.id, b.feeds);

  for (let pass = 0; pass < 2; pass++) {
    for (const r of rows) {
      if (isChampionship(r)) continue;
      const hWin = winnerRef(r.home);
      const aWin = winnerRef(r.away);
      const hSeed = seedRef(r.home);
      const aSeed = seedRef(r.away);
      // "5/12 winner" counts as a winner reference too (published listings).
      const hAnyWin = hWin != null || pairWinnerRef(r.home) != null;
      const aAnyWin = aWin != null || pairWinnerRef(r.away) != null;
      let cellId: string | undefined;
      if (hWin != null && aWin != null) {
        const f1 = feedsByCell.get(numToCell.get(hWin) ?? "");
        const f2 = feedsByCell.get(numToCell.get(aWin) ?? "");
        cellId = f1 && f1 === f2 ? f1 : undefined;
      } else if ((hSeed != null && aAnyWin) || (aSeed != null && hAnyWin)) {
        const bye = hSeed ?? aSeed;
        cellId = byes.find((b) => b.bye === bye)?.id;
      }
      if (cellId && !byCell[cellId]) {
        byCell[cellId] = slotOf(r);
        numToCell.set(r.num, cellId);
      }
    }
  }

  // 2.5) Bare "Semifinal" rows carry no matchup info; assign them in listing
  //      order to whichever semifinal cells are still open.
  for (const r of rows) {
    if (!/^\s*semi/i.test(r.home) || r.away.trim()) continue;
    const free = ["sf1", "sf2"].find((id) => !byCell[id]);
    if (free) byCell[free] = slotOf(r);
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
  // Not the tab-separated master format; try the published listing shape.
  return rows.length > 0 ? rows : parseListing(text, year);
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const TIME_LINE = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

function monthDayIn(line: string): { mon: string; day: string } | null {
  const m = /([A-Za-z]+)\s+(\d{1,2})/.exec(line);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  return mon ? { mon, day: m[2].padStart(2, "0") } : null;
}

/**
 * Parse the published listing: a date header ("Sunday, August 9 - Playoffs"),
 * then repeating time / matchup / rink lines. Listings carry no game numbers,
 * so rows get synthetic ones, and no event column - a listing is taken from a
 * single event's page, so it always matches.
 */
function parseListing(text: string, year: number): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Row[] = [];
  let date: { mon: string; day: string } | null = null;
  let num = 1001; // synthetic; high so they never collide with real game numbers

  for (let i = 0; i < lines.length; i++) {
    const header = monthDayIn(lines[i]);
    if (header && !TIME_LINE.test(lines[i])) {
      date = header;
      continue;
    }
    const tm = TIME_LINE.exec(lines[i]);
    if (!tm) continue;
    const matchup = lines[i + 1] ?? "";
    const maybeRink = lines[i + 2] ?? "";
    const rinkIsRink = maybeRink && !TIME_LINE.test(maybeRink) && !monthDayIn(maybeRink) && !/\svs\.?\s/i.test(maybeRink);
    const [home, away = ""] = matchup.split(/\s+vs\.?\s+/i);

    let hour = Number(tm[1]);
    const ampm = tm[3].toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    rows.push({
      num: num++,
      slotStart: date ? `${year}-${date.mon}-${date.day}T${String(hour).padStart(2, "0")}:${tm[2]}:00` : null,
      rink: rinkIsRink ? maybeRink : null,
      home: (home ?? "").trim(),
      away: away.trim(),
      event: "__listing__",
    });
    i += rinkIsRink ? 2 : 1;
  }
  return rows;
}

function matchesEvent(r: Row, kw: string): boolean {
  if (!kw || r.event === "__listing__") return true;
  const hay = `${r.event} ${r.home} ${r.away}`.toLowerCase();
  return hay.includes(kw);
}

// "5/12 winner" -> the seeds of the first-round game the winner comes from.
function pairWinnerRef(s: string): [number, number] | null {
  const m = /(\d+)\s*\/\s*(\d+)\s*win/i.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : null;
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
