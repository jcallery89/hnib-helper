import type { Player, PlayerSummary } from "../types.ts";

// Structural game line (matches io's PlayerGameLine without importing io).
export interface WriteupGameLine {
  opponent: string;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  shots: number;
  saves: number;
}

export interface WriteupFacts {
  player: Player;
  summary: PlayerSummary;
  teamName: string;
  eventName: string;
  gameLog?: WriteupGameLine[];
}

/**
 * Generate a short, factual scouting writeup from registration bio, event
 * totals, and game-log highlights. Deterministic template prose in HNIB voice:
 * short lines, hockey-literate, no exclamation points, no em dashes. Returns
 * an empty string when there is nothing meaningful to say.
 */
export function generateWriteup(facts: WriteupFacts): string {
  const { player, summary, teamName, eventName } = facts;
  const log = facts.gameLog ?? [];
  const gp = summary.gp > 0 ? summary.gp : log.length;
  const last = player.lastName || player.firstName;
  const sentences: string[] = [];

  // Who they are: "Jack Sullivan is a 5'6" Class of 2030 forward from Andover, MA."
  const descriptors = [
    player.heightInches ? formatHeight(player.heightInches) : null,
    positionNoun(player.position),
  ].filter(Boolean);
  const from = player.hometown ? ` from ${player.hometown}` : "";
  const born = player.birthYear ? `, born in ${player.birthYear},` : "";
  const fullName = `${player.firstName} ${player.lastName}`.trim();
  if (fullName) {
    sentences.push(`${fullName} is a ${descriptors.join(" ")}${born}${from} playing for ${teamName}.`);
  }

  if (summary.isGoalie) {
    sentences.push(...goalieSentences(last, summary, log, gp, eventName));
  } else {
    sentences.push(...skaterSentences(last, summary, log, gp, eventName));
  }

  if (player.school) {
    sentences.push(`${last} suits up for ${player.school} in the fall.`);
  }

  return sentences.join(" ");
}

function skaterSentences(
  last: string,
  summary: PlayerSummary,
  log: WriteupGameLine[],
  gp: number,
  eventName: string,
): string[] {
  const out: string[] = [];
  const games = gp > 0 ? ` in ${gp} ${plural(gp, "game")}` : "";
  out.push(
    `${last} put up ${count(summary.goals, "goal")} and ${count(summary.assists, "assist")} for ${summary.points} ${plural(summary.points, "point")}${games} at the ${eventName}.`,
  );

  if (log.length > 0) {
    const best = [...log].sort((a, b) => b.points - a.points || b.goals - a.goals)[0];
    if (best && best.points > 0) {
      out.push(`The best line came against ${best.opponent}: ${count(best.goals, "goal")} and ${count(best.assists, "assist")}.`);
    }
    const onSheet = log.filter((l) => l.points > 0).length;
    if (onSheet >= 2 && log.length >= 3) {
      out.push(`${last} hit the scoresheet in ${onSheet} of ${log.length} games.`);
    }
  }
  return out;
}

function goalieSentences(
  last: string,
  summary: PlayerSummary,
  log: WriteupGameLine[],
  gp: number,
  eventName: string,
): string[] {
  const out: string[] = [];
  const parts: string[] = [];
  if (summary.gaa !== undefined) parts.push(`a ${summary.gaa.toFixed(2)} goals against average`);
  if (summary.savePct !== undefined) parts.push(`a ${summary.savePct.toFixed(3).replace(/^0/, "")} save percentage`);
  if (parts.length > 0) {
    const games = gp > 0 ? ` across ${gp} ${plural(gp, "game")}` : "";
    out.push(`${last} posted ${parts.join(" and ")}${games} at the ${eventName}.`);
  }

  if (log.length > 0) {
    const shutouts = log.filter((l) => l.shots > 0 && l.shots - l.saves <= 0).length;
    if (shutouts > 0) {
      out.push(`${last} recorded ${count(shutouts, "shutout")}.`);
    } else {
      const busiest = [...log].sort((a, b) => b.shots - a.shots)[0];
      if (busiest && busiest.shots > 0) {
        out.push(`The busiest night came against ${busiest.opponent}: ${busiest.saves} saves on ${busiest.shots} shots.`);
      }
    }
  }
  return out;
}

function positionNoun(p: Player["position"]): string {
  return p === "G" ? "goaltender" : p === "D" ? "defenseman" : "forward";
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function count(n: number, word: string): string {
  if (n === 1 && word === "assist") return "an assist";
  return `${n} ${plural(n, word)}`;
}

function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
