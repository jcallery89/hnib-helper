// Slot grid: the fixed set of (day, sheet, start time) containers that Phase 2
// places matchups into. Slot length and stagger are per-DAY config (2025 ran
// 105-minute slots with a 15-minute stagger; some 2026 days run 100/10; playoff
// mini-games run shorter), so each day carries its own cadence.

export interface DayConfig {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM, base start for the first sheet
  end: string; // HH:MM, no slot may start at/after this
  slotMinutes: number;
  staggerMinutes: number; // each subsequent sheet starts this much later
}

export interface VenueConfig {
  sheets: string[]; // e.g. ["Gray", "Lamacchia"]
  days: DayConfig[];
}

export interface Slot {
  id: string;
  date: string;
  sheet: string;
  start: string; // ISO datetime
  startMinutes: number; // absolute minutes for rest-gap math
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayEpochMinutes(date: string): number {
  // Days are distinct calendar dates; use the date's UTC midnight in minutes.
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 60000);
}

/** Build the full slot grid from venue config. */
export function buildSlotGrid(venue: VenueConfig): Slot[] {
  const slots: Slot[] = [];
  for (const day of venue.days) {
    const base = toMinutes(day.start);
    const end = toMinutes(day.end);
    const dayBase = dayEpochMinutes(day.date);
    venue.sheets.forEach((sheet, k) => {
      const sheetStart = base + k * day.staggerMinutes;
      for (let t = sheetStart; t < end; t += day.slotMinutes) {
        slots.push({
          id: `${day.date}_${sheet}_${toHHMM(t)}`,
          date: day.date,
          sheet,
          start: `${day.date}T${toHHMM(t)}:00`,
          startMinutes: dayBase + t,
        });
      }
    });
  }
  return slots.sort((a, b) => a.startMinutes - b.startMinutes);
}
