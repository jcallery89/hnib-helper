import { describeGuarantee } from "./format.ts";
import { fmtTime } from "./schedule.ts";
import type { PlanResult } from "./types.ts";

// Plain-text and CSV exports. Kept in the engine so the app tab and the
// standalone file produce byte-identical output.

const usd = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export interface ComparisonRow {
  label: string;
  values: string[];
}

/** The side-by-side comparison table, one column per scenario. */
export function comparisonRows(results: PlanResult[]): ComparisonRow[] {
  const col = (f: (r: PlanResult) => string) => results.map(f);
  return [
    { label: "Profile", values: col((r) => r.scenario.profile) },
    { label: "Teams", values: col((r) => String(r.scenario.structure.teams)) },
    { label: "Roster (F / D / G)", values: col((r) => `${r.scenario.structure.forwards} / ${r.scenario.structure.defense} / ${r.scenario.structure.goalies}`) },
    { label: "Format", values: col((r) => r.format.plan.title) },
    { label: "Guaranteed games", values: col((r) => describeGuarantee(r.format.plan)) },
    { label: "Playoffs", values: col((r) => (r.schedule.playoffGames > 0 ? `${r.scenario.structure.playoffs} (${r.schedule.playoffGames} games)` : "none")) },
    { label: "Practice", values: col((r) => (r.scenario.structure.practice ? `${r.scenario.structure.practiceMinutes} min` : "no")) },
    { label: "All-Star game", values: col((r) => (r.schedule.allStarGames > 0 ? "yes" : "no")) },
    { label: "Total games", values: col((r) => String(r.schedule.totalGames)) },
    { label: "Ice hours booked", values: col((r) => String(r.schedule.bookedHours)) },
    { label: "Fits the ice window", values: col((r) => (r.schedule.fits ? "yes" : `no, ${r.schedule.hoursShort} h short`)) },
    { label: "Price per player", values: col((r) => usd(r.scenario.pricing.pricePerPlayer)) },
    { label: "Registered players", values: col((r) => String(r.pnl.players)) },
    { label: "Net revenue", values: col((r) => usd(r.pnl.netRevenue)) },
    { label: "Total cost", values: col((r) => usd(r.pnl.totalCost)) },
    { label: "Net profit", values: col((r) => usd(r.pnl.netProfit)) },
    { label: "Margin", values: col((r) => `${r.pnl.marginPct}%`) },
    { label: "Profit per player", values: col((r) => usd(r.pnl.profitPerPlayer)) },
    { label: "Cost per player", values: col((r) => usd(r.pnl.costPerPlayer)) },
    { label: "Break-even price", values: col((r) => usd(r.pnl.breakEvenPrice)) },
    { label: "Break-even players", values: col((r) => (r.pnl.breakEvenPlayers === null ? "n/a" : `${r.pnl.breakEvenPlayers} (${r.pnl.breakEvenTeams} teams)`)) },
    { label: "Price per game", values: col((r) => usd(r.family.pricePerGame)) },
    { label: "Skater ice minutes", values: col((r) => `${r.family.skaterIceMinutesTotal} game + ${r.family.practiceMinutes} practice`) },
    ...(results.some((r) => r.actuals)
      ? [
          {
            label: "Actual net profit",
            values: col((r) => {
              const line = r.actuals?.lines.find((l) => l.key === "netProfit");
              return line && line.actual !== null ? usd(line.actual) : "";
            }),
          },
          {
            label: "Actual minus model",
            values: col((r) => {
              const line = r.actuals?.lines.find((l) => l.key === "netProfit");
              return line && line.variance !== null ? usd(line.variance) : "";
            }),
          },
        ]
      : []),
  ];
}

/** Email-ready plain text of the scenario comparison. */
export function summaryText(results: PlanResult[]): string {
  const lines: string[] = [];
  lines.push("HNIB Event Planner - scenario comparison");
  lines.push("");
  for (const r of results) {
    const s = r.scenario;
    lines.push(`${s.name}`);
    lines.push(`  ${s.structure.teams} teams, ${r.pnl.rosterPerTeam} per team (${s.structure.forwards} F / ${s.structure.defense} D / ${s.structure.goalies} G), ${r.pnl.players} players at ${usd(s.pricing.pricePerPlayer)}`);
    lines.push(`  Format: ${r.format.plan.title}, ${describeGuarantee(r.format.plan)}` + (r.schedule.playoffGames ? `, playoffs: ${s.structure.playoffs}` : "") + (s.structure.practice ? `, ${s.structure.practiceMinutes} min practice` : "") + (r.schedule.allStarGames ? ", All-Star game" : ""));
    lines.push(`  Ice: ${r.schedule.bookedHours} h booked over ${s.structure.days} day(s) on ${s.structure.sheets} sheet(s)` + (r.schedule.fits ? "" : ` - DOES NOT FIT, ${r.schedule.hoursShort} h short`));
    lines.push(`  Net revenue ${usd(r.pnl.netRevenue)}, total cost ${usd(r.pnl.totalCost)}, net profit ${usd(r.pnl.netProfit)} (${r.pnl.marginPct}% margin)`);
    lines.push(`  Profit per player ${usd(r.pnl.profitPerPlayer)}, break-even price ${usd(r.pnl.breakEvenPrice)}, break-even ${r.pnl.breakEvenPlayers ?? "n/a"} players`);
    lines.push(`  Family value: ${r.family.guaranteedGames} games (${usd(r.family.pricePerGame)} per game), about ${r.family.skaterIceMinutesTotal} skater ice minutes` + (r.family.practiceMinutes ? ` plus ${r.family.practiceMinutes} practice minutes` : ""));
    lines.push("");
  }
  lines.push("Comparison");
  const rows = comparisonRows(results);
  const width = Math.max(...rows.map((r) => r.label.length));
  const header = " ".repeat(width) + "  " + results.map((r) => r.scenario.name).join(" | ");
  lines.push(header);
  for (const row of rows) lines.push(row.label.padEnd(width) + "  " + row.values.join(" | "));
  return lines.join("\n");
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The schedule grid as CSV: day, start, end, sheet, type, stage, session. */
export function scheduleCsv(result: PlanResult): string {
  const rows: string[] = ["Day,Start,End,Sheet,Type,Stage,Session"];
  const labels = result.schedule.days.map((d) => d.label);
  for (const s of result.schedule.sessions) {
    rows.push(
      [labels[s.day] ?? `Day ${s.day + 1}`, fmtTime(s.start), fmtTime(s.end), `Sheet ${s.sheet + 1}`, kindLabel(s.kind), s.stage, s.label]
        .map(csvCell)
        .join(","),
    );
  }
  for (const u of result.schedule.unscheduled) rows.push(["Unscheduled", "", "", "", "", "", u.label].map(csvCell).join(","));
  return rows.join("\n");
}

export function kindLabel(kind: PlanResult["schedule"]["sessions"][number]["kind"]): string {
  switch (kind) {
    case "game":
      return "Game";
    case "placement":
      return "Placement";
    case "playoff":
      return "Playoff";
    case "practice":
      return "Practice";
    case "allstar":
      return "All-Star";
    case "idle":
      return "Open ice";
  }
}
