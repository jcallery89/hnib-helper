import type { Player, PlayerSummary } from "../../engine/types.ts";
import { COLORS, FONTS } from "../bracket/theme.ts";
import { LOGO_ASPECT, type BrandAssets } from "../brand.ts";

// Structurally identical to io/dataset's PlayerGameLine; declared locally so
// the render layer stays free of io imports.
export interface CardGameLine {
  opponent: string;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  shots: number;
  saves: number;
}

interface Props {
  width: number;
  height: number;
  player: Player;
  summary: PlayerSummary;
  teamName: string;
  eventName: string;
  accentColor?: string;
  brand?: BrandAssets;
  /** Per-game lines; the card is sized for up to 12 (HNIB event maximum). */
  gameLog?: CardGameLine[];
  /** Scouting report paragraph rendered like a news panel, space permitting. */
  writeup?: string;
}

const MAX_GAMES = 12;

export function PlayerCard({
  width,
  height,
  player,
  summary,
  teamName,
  eventName,
  accentColor,
  brand,
  gameLog,
  writeup,
}: Props) {
  const pad = Math.round(width * 0.07);
  const accent = accentColor || COLORS.royal;
  const accentText = readableOn(accent);

  // Header/footer strips are authored at 1080x60; scale with export width.
  const stripH = brand?.cardHeader ? Math.round((width * 60) / 1080) : 0;
  const footerStripH = brand?.cardFooter ? Math.round((width * 60) / 1080) : 0;

  const log = (gameLog ?? []).slice(0, MAX_GAMES);
  const hasLog = log.length > 0;
  const isGoalie = summary.isGoalie;
  const gp = summary.gp > 0 ? summary.gp : log.length;

  // ---- type scale ------------------------------------------------------------
  const nameSize = Math.round(height * 0.052);
  const labelSize = Math.round(height * 0.0145);
  const valueSize = Math.round(height * 0.026);
  const jerseySize = Math.round(height * 0.082);

  // ---- hero ------------------------------------------------------------------
  const heroTop = stripH + Math.round(height * 0.028);
  // Headshot slot: photo when registration provides one, initials placeholder
  // otherwise. The name block shifts right to make room.
  const avatarR = Math.round(height * 0.046);
  const avatarCX = pad + avatarR;
  const avatarCY = heroTop + avatarR;
  const heroX = pad + avatarR * 2 + Math.round(width * 0.022);
  const nameY = heroTop + nameSize;
  const chipH = Math.round(height * 0.028);
  const chipY = nameY + Math.round(height * 0.016);
  const chipText = [teamName.toUpperCase(), player.jersey !== null ? `#${player.jersey}` : null]
    .filter(Boolean)
    .join("  ");
  const chipW = Math.round(chipText.length * labelSize * 0.62 + 28);

  // ---- bio strip (label over value, columns with dividers) --------------------
  const bioEntries = buildBioEntries(player, gp);
  const bioTop = chipY + chipH + Math.round(height * 0.03);
  const bioH = Math.round(height * 0.062);
  const bioColW = (width - pad * 2) / Math.max(bioEntries.length, 1);

  // ---- game logs table ---------------------------------------------------------
  const innerW = width - pad * 2;
  const logLabelY = bioTop + bioH + Math.round(height * 0.034);
  const headerRowY = logLabelY + Math.round(height * 0.012);
  const headerRowH = Math.round(height * 0.028);
  const tableTop = headerRowY + headerRowH;
  const footerTop = height - (footerStripH || Math.round(height * 0.04));
  const bodyRows = (hasLog ? log.length : 0) + 1; // games + TOTALS
  // Leave room for the scouting report when one is supplied.
  const reportReserve = writeup ? Math.round(height * 0.17) : 0;
  const tableBottomMax = footerTop - Math.round(height * 0.02) - reportReserve;
  const rowH = Math.min(
    Math.round(height * 0.032),
    Math.max(Math.round(height * 0.02), Math.floor((tableBottomMax - tableTop) / bodyRows)),
  );
  const rowFont = Math.round(rowH * 0.56);
  const tableBottom = tableTop + bodyRows * rowH;

  const numericCols = isGoalie ? ["SHOTS", "SV", "GA"] : ["G", "A", "PTS", "PIM"];
  const oppColW = innerW * (isGoalie ? 0.55 : 0.48);
  const numColW = (innerW - oppColW) / numericCols.length;
  const numColX = (i: number) => pad + oppColW + numColW * (i + 0.5);
  const totals = computeTotals(log, summary, isGoalie);

  // ---- scouting report ---------------------------------------------------------
  const reportLabelY = tableBottom + Math.round(height * 0.032);
  const reportFont = Math.round(height * 0.0185);
  const reportLineH = Math.round(height * 0.025);
  const reportTextTop = reportLabelY + Math.round(height * 0.012);
  const reportMaxLines = Math.floor((footerTop - Math.round(height * 0.018) - reportTextTop) / reportLineH);
  const reportLines = writeup
    ? wrapSentences(writeup, Math.floor((innerW - 28) / (reportFont * 0.45)), reportMaxLines)
    : [];
  const showReport = reportLines.length >= 2;

  // Subtle navy watermark anchored bottom-right, above the footer strip.
  const wmW = Math.round(width * 0.55);
  const wmH = Math.round(wmW / LOGO_ASPECT);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={height} fill={COLORS.card} />
      {brand?.watermarkNavy && (
        <image
          href={brand.watermarkNavy}
          x={width - wmW + Math.round(width * 0.08)}
          y={footerTop - wmH + Math.round(height * 0.04)}
          width={wmW}
          height={wmH}
          preserveAspectRatio="xMaxYMax meet"
        />
      )}
      <defs>
        <linearGradient id="sigbar-pc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2856" />
          <stop offset="30%" stopColor="#2e4a8a" />
          <stop offset="70%" stopColor="#a8cce0" />
          <stop offset="100%" stopColor="#dae8f3" />
        </linearGradient>
      </defs>
      {brand?.cardHeader ? (
        <>
          <image href={brand.cardHeader} x={0} y={0} width={width} height={stripH} preserveAspectRatio="none" />
          <rect x={0} y={stripH} width={width} height={3} fill="url(#sigbar-pc)" />
        </>
      ) : (
        <rect x={0} y={0} width={width} height={4} fill="url(#sigbar-pc)" />
      )}
      {brand?.cardFooter && (
        <image href={brand.cardFooter} x={0} y={height - footerStripH} width={width} height={footerStripH} preserveAspectRatio="none" />
      )}

      {/* Hero: headshot slot, name, team chip, jersey number */}
      <defs>
        <clipPath id="avatar-clip">
          <circle cx={avatarCX} cy={avatarCY} r={avatarR} />
        </clipPath>
      </defs>
      <circle cx={avatarCX} cy={avatarCY} r={avatarR} fill={COLORS.zebra} stroke={accent} stroke-width={2} />
      {player.photoUrl ? (
        <image
          href={player.photoUrl}
          x={avatarCX - avatarR}
          y={avatarCY - avatarR}
          width={avatarR * 2}
          height={avatarR * 2}
          preserveAspectRatio="xMidYMid slice"
          clip-path="url(#avatar-clip)"
        />
      ) : (
        <text x={avatarCX} y={avatarCY + avatarR * 0.32} fill={COLORS.navy} font-family={FONTS.head} font-size={avatarR * 0.95} font-weight={600} text-anchor="middle">
          {initials(player)}
        </text>
      )}
      <text x={heroX} y={nameY} fill={COLORS.navy} font-family={FONTS.head} font-size={nameSize} font-weight={600} letter-spacing="0.02em">
        {`${player.firstName} ${player.lastName}`.toUpperCase()}
      </text>
      <rect x={heroX} y={chipY} width={chipW} height={chipH} rx={4} fill={accent} />
      <text x={heroX + 14} y={chipY + chipH * 0.7} fill={accentText} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em">
        {chipText}
      </text>
      <text x={heroX + chipW + 16} y={chipY + chipH * 0.7} fill={COLORS.royal} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.08em">
        {eventName.toUpperCase()}
      </text>
      <text x={width - pad} y={heroTop + jerseySize * 0.78} fill={COLORS.navy} font-family={FONTS.head} font-size={jerseySize} font-weight={700} text-anchor="end">
        {player.jersey !== null ? player.jersey : ""}
      </text>

      {/* Bio strip: LABEL over VALUE, divided columns */}
      {bioEntries.map((entry, i) => {
        const x = pad + i * bioColW;
        const valueFont = entry.value.length > 11 ? Math.round(valueSize * 0.78) : valueSize;
        return (
          <g key={entry.label}>
            <text x={x} y={bioTop + labelSize} fill={COLORS.textDim} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.12em">
              {entry.label}
            </text>
            <text x={x} y={bioTop + labelSize + valueSize + Math.round(height * 0.008)} fill={COLORS.navy} font-family={FONTS.body} font-size={valueFont} font-weight={700}>
              {entry.value}
            </text>
            {i > 0 && <line x1={x - bioColW * 0.12} y1={bioTop} x2={x - bioColW * 0.12} y2={bioTop + bioH * 0.85} stroke={COLORS.line} stroke-width={1} />}
          </g>
        );
      })}

      {/* Game logs */}
      <text x={pad} y={logLabelY} fill={COLORS.royal} font-family={FONTS.body} font-size={labelSize * 1.1} font-weight={700} letter-spacing="0.14em">
        GAME LOGS
      </text>
      <rect x={pad} y={headerRowY} width={innerW} height={headerRowH} fill={accent} />
      <text x={pad + 14} y={headerRowY + headerRowH * 0.7} fill={accentText} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em">
        OPPONENT
      </text>
      {numericCols.map((c, i) => (
        <text key={c} x={numColX(i)} y={headerRowY + headerRowH * 0.7} fill={accentText} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em" text-anchor="middle">
          {c}
        </text>
      ))}
      {hasLog &&
        log.map((line, i) => {
          const y = tableTop + i * rowH;
          const vals = isGoalie
            ? [line.shots, line.saves, Math.max(0, line.shots - line.saves)]
            : [line.goals, line.assists, line.points, line.pim];
          return (
            <g key={`${line.opponent}-${i}`}>
              <rect x={pad} y={y} width={innerW} height={rowH} fill={i % 2 === 0 ? COLORS.card : COLORS.zebra} stroke={COLORS.line} stroke-width={0.5} />
              <text x={pad + 14} y={y + rowH * 0.68} fill={COLORS.navy} font-family={FONTS.body} font-size={rowFont} font-weight={500}>
                {(line.opponent || "-").toUpperCase()}
              </text>
              {vals.map((v, j) => (
                <text key={j} x={numColX(j)} y={y + rowH * 0.68} fill={COLORS.navy} font-family={FONTS.body} font-size={rowFont} font-weight={600} text-anchor="middle">
                  {v}
                </text>
              ))}
            </g>
          );
        })}
      <g>
        <rect x={pad} y={tableTop + (hasLog ? log.length : 0) * rowH} width={innerW} height={rowH} fill={COLORS.navy} />
        <text x={pad + 14} y={tableTop + (hasLog ? log.length : 0) * rowH + rowH * 0.68} fill={COLORS.gold} font-family={FONTS.body} font-size={rowFont} font-weight={700} letter-spacing="0.08em">
          TOTALS{gp > 0 ? ` - ${gp} GP` : ""}
        </text>
        {totals.map((v, j) => (
          <text key={j} x={numColX(j)} y={tableTop + (hasLog ? log.length : 0) * rowH + rowH * 0.68} fill={COLORS.white} font-family={FONTS.body} font-size={rowFont} font-weight={700} text-anchor="middle">
            {v}
          </text>
        ))}
      </g>

      {/* Scouting report (the "latest news" panel) */}
      {showReport && (
        <g>
          <text x={pad} y={reportLabelY} fill={COLORS.royal} font-family={FONTS.body} font-size={labelSize * 1.1} font-weight={700} letter-spacing="0.14em">
            SCOUTING REPORT
          </text>
          {reportLines.map((ln, i) => (
            <text key={i} x={pad} y={reportTextTop + (i + 1) * reportLineH} fill={COLORS.navy} font-family={FONTS.body} font-size={reportFont} font-weight={400}>
              {ln}
            </text>
          ))}
        </g>
      )}

      {/* Footer - sits on the navy brand strip when present */}
      <text
        x={pad}
        y={footerStripH ? height - footerStripH * 0.38 : height - Math.round(height * 0.02)}
        fill={footerStripH ? COLORS.gold : COLORS.royal}
        font-family={FONTS.body}
        font-size={labelSize * 1.1}
        font-weight={700}
        letter-spacing="0.08em"
      >
        GET SEEN. GET RECRUITED.
      </text>
      <text
        x={width - pad}
        y={footerStripH ? height - footerStripH * 0.38 : height - Math.round(height * 0.02)}
        fill={footerStripH ? COLORS.white : COLORS.textDim}
        font-family={FONTS.body}
        font-size={labelSize}
        letter-spacing="0.08em"
        text-anchor="end"
      >
        @hockey.night - PlayHNIB.com
      </text>
    </svg>
  );
}

function buildBioEntries(player: Player, gp: number): Array<{ label: string; value: string }> {
  const entries: Array<{ label: string; value: string }> = [];
  // HNIB events are age-based, so birth year is the differentiator; fall back to
  // class year only if no birth year is known.
  if (player.birthYear) entries.push({ label: "BORN", value: String(player.birthYear) });
  else if (player.classYear) entries.push({ label: "CLASS", value: String(player.classYear) });
  if (player.position) entries.push({ label: "POS", value: player.position });
  if (player.heightInches && player.weightLbs) {
    entries.push({ label: "HT / WT", value: `${formatHeight(player.heightInches)} ${player.weightLbs}` });
  } else if (player.heightInches) {
    entries.push({ label: "HEIGHT", value: formatHeight(player.heightInches) });
  } else if (player.weightLbs) {
    entries.push({ label: "WEIGHT", value: `${player.weightLbs} LBS` });
  }
  if (player.shoots) entries.push({ label: "SHOOTS", value: player.shoots });
  if (player.hometown) entries.push({ label: "HOMETOWN", value: player.hometown.toUpperCase() });
  if (gp > 0) entries.push({ label: "GP", value: String(gp) });
  return entries.slice(0, 5);
}

function initials(player: Player): string {
  return `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`.toUpperCase();
}

function computeTotals(log: CardGameLine[], summary: PlayerSummary, isGoalie: boolean): number[] {
  if (log.length > 0) {
    const sum = (f: (l: CardGameLine) => number) => log.reduce((a, l) => a + f(l), 0);
    return isGoalie
      ? [sum((l) => l.shots), sum((l) => l.saves), sum((l) => Math.max(0, l.shots - l.saves))]
      : [sum((l) => l.goals), sum((l) => l.assists), sum((l) => l.points), sum((l) => l.pim)];
  }
  return isGoalie
    ? [
        summary.saves !== undefined && summary.goalsAgainst !== undefined ? summary.saves + summary.goalsAgainst : 0,
        summary.saves ?? 0,
        summary.goalsAgainst ?? 0,
      ]
    : [summary.goals, summary.assists, summary.points, summary.pim];
}

/**
 * Wrap text into lines of at most maxChars, adding whole sentences while they
 * fit so a tight card truncates cleanly at a sentence boundary.
 */
function wrapSentences(text: string, maxChars: number, maxLines: number): string[] {
  if (maxLines < 1 || maxChars < 8) return [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let accepted = "";
  let lines: string[] = [];
  for (const sentence of sentences) {
    const attempt = (accepted ? `${accepted} ` : "") + sentence.trim();
    const wrapped = wrapWords(attempt, maxChars);
    if (wrapped.length > maxLines) break;
    accepted = attempt;
    lines = wrapped;
  }
  return lines;
}

function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Choose navy or white text for legibility on the team-color fills, so a white
// or pale jersey color cannot produce white-on-white.
function readableOn(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return COLORS.white;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 150 ? COLORS.navy : COLORS.white;
}

function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
