// Parse the master festival schedule (one tab-separated row per game) into a
// flat list, and shape a single day's rows for the combined schedule poster.
// Source columns: Day, Time, Rink, GameNo, Home, Away, Event.

export interface DayScheduleRow {
  num: number;
  date: string | null; // "2026-06-29"
  time: string; // "8:00 AM"
  rink: string | null; // short ("Lamacchia")
  home: string;
  away: string;
  event: string; // raw Event column
}

export interface PosterRow {
  time: string;
  matchup: string;
  phase: string;
  rink: string | null;
  eventKey: "soph" | "jr" | "other";
}

export function parseDaySchedule(text: string, year: number): DayScheduleRow[] {
  const rows: DayScheduleRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = raw.split("\t").map((x) => x.trim());
    if (c.length < 5) continue;
    const num = Number(c[3]);
    if (!Number.isFinite(num)) continue;
    rows.push({
      num,
      date: dateOf(c[0], year),
      time: c[1] ?? "",
      rink: shortRink(c[2]),
      home: c[4] ?? "",
      away: c[5] ?? "",
      event: c[6] ?? "",
    });
  }
  return rows;
}

/** The distinct days present, as { date, label } sorted chronologically. */
export function scheduleDays(rows: DayScheduleRow[]): Array<{ date: string; label: string }> {
  const seen = new Map<string, string>();
  for (const r of rows) if (r.date && !seen.has(r.date)) seen.set(r.date, dayLabel(r.date));
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, label]) => ({ date, label }));
}

/** Shape one day's rows for the poster: clean matchups, infer the phase. */
export function posterRowsFor(rows: DayScheduleRow[], date: string): PosterRow[] {
  return rows
    .filter((r) => r.date === date)
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time) || a.num - b.num)
    .map((r) => ({
      time: r.time,
      matchup: cleanMatchup(r.home, r.away),
      phase: phaseOf(r.home, r.away, r.event),
      rink: r.rink,
      eventKey: eventKeyOf(r.event, r.home, r.away),
    }));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function dayLabel(date: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const dow = WEEKDAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  return `${dow}, ${MONTHS[+mo - 1]} ${+d}`;
}

function dateOf(dayCol: string, year: number): string | null {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(dayCol);
  if (!m) return null;
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function minutesOf(time: string): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(time);
  if (!m) return 0;
  let h = Number(m[1]);
  const ampm = (m[3] ?? "").toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

function shortRink(loc: string): string | null {
  const v = (loc ?? "").trim();
  if (!v) return null;
  return v.includes(" - ") ? v.split(" - ").pop()!.trim() : v;
}

function eventKeyOf(event: string, home: string, away: string): "soph" | "jr" | "other" {
  const hay = `${event} ${home} ${away}`.toLowerCase();
  if (/jr|junior/.test(hay)) return "jr";
  if (/soph/.test(hay)) return "soph";
  return "other";
}

function isAllStar(s: string): boolean {
  return /all[-\s]?star/i.test(s);
}

function phaseOf(home: string, away: string, event: string): string {
  if (isAllStar(home) || isAllStar(away)) return "All-Star Game";
  if (/champ/i.test(home) || /champ/i.test(away)) return "Championship";
  const hasWinner = /\bW\s*\d+\b/i.test(home) || /\bW\s*\d+\b/i.test(away);
  if (hasWinner) return "Semifinal";
  const bothSeeds = /\d+\s*(st|nd|rd|th)\b/i.test(home) && /\d+\s*(st|nd|rd|th)\b/i.test(away);
  if (bothSeeds) return /jr|junior/i.test(event) ? "Play-In" : "Quarterfinal";
  return "";
}

// Strip the redundant event prefix and spell out the winner/championship refs.
function cleanMatchup(home: string, away: string): string {
  if (isAllStar(home) || isAllStar(away)) {
    const sides = [side(home), side(away)].filter(Boolean);
    return sides.length === 2 ? `All-Stars: ${sides[0]} vs ${sides[1]}` : "All-Star Game";
  }
  if (/champ/i.test(home) || /champ/i.test(away)) return "Championship Game";
  const hw = /\bW\s*(\d+)\b/i.exec(home);
  const aw = /\bW\s*(\d+)\b/i.exec(away);
  if (hw && aw) return `Winners of Games ${hw[1]} & ${aw[1]}`;
  const h = label(home);
  const a = label(away);
  return a ? `${h} vs ${a}` : h;
}

function label(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  const w = /\bW\s*(\d+)\b/i.exec(t);
  if (w) return `Winner of Game ${w[1]}`;
  return t.replace(/^(soph(omore)?|jr\.?\s*high|junior\s*high)\s+/i, "").trim();
}

// "Soph All-Stars (East)" -> "East".
function side(s: string): string {
  const m = /\(([^)]+)\)/.exec(s);
  return m ? m[1].trim() : "";
}
