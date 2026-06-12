import type { Player, PlayerSummary } from "../../engine/types.ts";
import { ART_COLORS, COLORS, FONTS } from "../bracket/theme.ts";
import { bgForSize, type BrandAssets } from "../brand.ts";

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
}: Props) {
  const pad = Math.round(width * 0.07);
  const bg = bgForSize(brand, width, height);
  const onArt = Boolean(bg);
  // Over the brand artwork (brighter royal blue) the site's dim grays and dark
  // navy panels clash; switch to the artwork-matched palette there.
  const C = {
    label: onArt ? ART_COLORS.ice : COLORS.textDim,
    body: onArt ? ART_COLORS.bright : COLORS.textPrimary,
    panelFill: onArt ? ART_COLORS.panel : COLORS.surface,
    panelStroke: onArt ? ART_COLORS.panelBorder : COLORS.border,
    line: onArt ? ART_COLORS.line : COLORS.border,
  };
  const accent = accentColor || "#3b5998"; // brand royal fallback for the header bar

  // Header/footer strips are authored at 1080x60; scale with export width.
  const stripH = brand?.cardHeader ? Math.round((width * 60) / 1080) : 0;
  const footerStripH = brand?.cardFooter ? Math.round((width * 60) / 1080) : 0;

  const log = (gameLog ?? []).slice(0, MAX_GAMES);
  const hasLog = log.length > 0;
  const isGoalie = summary.isGoalie;

  // GP: prefer the box total; the live API often reports 0, in which case the
  // game log itself is the truth.
  const gp = summary.gp > 0 ? summary.gp : log.length;

  // ---- type scale -----------------------------------------------------------
  const nameSize = Math.round(height * 0.055);
  const subSize = Math.round(height * 0.019);
  const labelSize = Math.round(height * 0.015);
  const jerseySize = Math.round(height * 0.085);

  // ---- vertical layout ------------------------------------------------------
  const topPad = stripH + Math.round(height * 0.03);
  const nameY = topPad + nameSize;
  const subY = nameY + Math.round(height * 0.032);

  // Bio table: two columns of label/value rows.
  const bioPairs = buildBioPairs(player, gp);
  const bioRows = Math.ceil(bioPairs.length / 2);
  const bioRowH = Math.round(height * 0.036);
  const bioY = subY + Math.round(height * 0.028);
  const bioH = bioRows * bioRowH;

  // Statistics table: title bar, header row, game rows, totals row.
  const titleBarY = bioY + bioH + Math.round(height * 0.035);
  const titleBarH = Math.round(height * 0.034);
  const headerRowH = Math.round(height * 0.03);
  const tableTop = titleBarY + titleBarH + headerRowH;
  const footerTop = height - (footerStripH || Math.round(height * 0.04));
  const tableBottomMax = footerTop - Math.round(height * 0.02);
  const bodyRows = hasLog ? log.length + 1 : 1; // games + TOTALS (or totals only)
  const rowH = Math.min(
    Math.round(height * 0.034),
    Math.max(Math.round(height * 0.022), Math.floor((tableBottomMax - tableTop) / bodyRows)),
  );
  const rowFont = Math.round(rowH * 0.55);

  // ---- columns ---------------------------------------------------------------
  const innerW = width - pad * 2;
  const numericCols = isGoalie ? ["SHOTS", "SV", "GA"] : ["G", "A", "PTS", "PIM"];
  const oppColW = innerW * (isGoalie ? 0.55 : 0.48);
  const numColW = (innerW - oppColW) / numericCols.length;
  const numColX = (i: number) => pad + oppColW + numColW * (i + 0.5);

  const totals = computeTotals(log, summary, isGoalie);
  const accentText = readableOn(accent);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={height} fill={COLORS.navyDeep} />
      {bg && <image href={bg} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" />}
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

      {/* Name block */}
      <text x={pad} y={nameY} fill={COLORS.white} font-family={FONTS.head} font-size={nameSize} font-weight={600} letter-spacing="0.02em">
        {`${player.firstName} ${player.lastName}`.toUpperCase()}
      </text>
      {accentColor && (
        <rect x={pad} y={subY - subSize * 0.85} width={subSize * 0.9} height={subSize * 0.9} rx={2} fill={accentColor} stroke="rgba(255,255,255,0.55)" stroke-width={1} />
      )}
      <text
        x={accentColor ? pad + subSize * 1.4 : pad}
        y={subY}
        fill={C.label}
        font-family={FONTS.body}
        font-size={subSize}
        font-weight={700}
        letter-spacing="0.08em"
      >
        {[player.jersey !== null ? `#${player.jersey}` : null, teamName.toUpperCase(), eventName.toUpperCase()]
          .filter(Boolean)
          .join("  -  ")}
      </text>
      <text x={width - pad} y={topPad + jerseySize * 0.78} fill={COLORS.gold} font-family={FONTS.head} font-size={jerseySize} font-weight={700} text-anchor="end">
        {player.jersey !== null ? player.jersey : ""}
      </text>

      {/* Bio table */}
      <rect x={pad} y={bioY} width={innerW} height={bioH} rx={6} fill={C.panelFill} stroke={C.panelStroke} stroke-width={1} />
      {bioPairs.map((pair, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cellX = pad + col * (innerW / 2);
        const cellY = bioY + row * bioRowH;
        const baseline = cellY + bioRowH * 0.66;
        return (
          <g key={pair[0]}>
            <text x={cellX + 14} y={baseline} fill={C.label} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em">
              {pair[0]}
            </text>
            <text x={cellX + innerW / 2 - 14} y={baseline} fill={COLORS.white} font-family={FONTS.body} font-size={labelSize * 1.15} font-weight={600} text-anchor="end">
              {pair[1]}
            </text>
          </g>
        );
      })}
      {Array.from({ length: bioRows - 1 }, (_, r) => (
        <line key={`bd-${r}`} x1={pad} y1={bioY + (r + 1) * bioRowH} x2={pad + innerW} y2={bioY + (r + 1) * bioRowH} stroke={C.line} stroke-width={1} />
      ))}
      <line x1={pad + innerW / 2} y1={bioY + 6} x2={pad + innerW / 2} y2={bioY + bioH - 6} stroke={C.line} stroke-width={1} />

      {/* Statistics: title bar */}
      <rect x={pad} y={titleBarY} width={innerW} height={titleBarH} fill={COLORS.navyDeep} stroke={C.panelStroke} stroke-width={1} />
      <text x={pad + 14} y={titleBarY + titleBarH * 0.7} fill={COLORS.white} font-family={FONTS.body} font-size={labelSize * 1.1} font-weight={700} letter-spacing="0.12em">
        {`${player.firstName} ${player.lastName} STATISTICS`.toUpperCase()}
      </text>

      {/* Header row in the team color */}
      <rect x={pad} y={titleBarY + titleBarH} width={innerW} height={headerRowH} fill={accent} />
      <text x={pad + 14} y={titleBarY + titleBarH + headerRowH * 0.7} fill={accentText} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em">
        OPPONENT
      </text>
      {numericCols.map((c, i) => (
        <text key={c} x={numColX(i)} y={titleBarY + titleBarH + headerRowH * 0.7} fill={accentText} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em" text-anchor="middle">
          {c}
        </text>
      ))}

      {/* Game rows with zebra striping */}
      {hasLog &&
        log.map((line, i) => {
          const y = tableTop + i * rowH;
          const vals = isGoalie
            ? [line.shots, line.saves, Math.max(0, line.shots - line.saves)]
            : [line.goals, line.assists, line.points, line.pim];
          return (
            <g key={`${line.opponent}-${i}`}>
              <rect x={pad} y={y} width={innerW} height={rowH} fill={i % 2 === 0 ? C.panelFill : "rgba(13,22,58,0.62)"} />
              <text x={pad + 14} y={y + rowH * 0.68} fill={C.body} font-family={FONTS.body} font-size={rowFont} font-weight={500}>
                {(line.opponent || "-").toUpperCase()}
              </text>
              {vals.map((v, j) => (
                <text key={j} x={numColX(j)} y={y + rowH * 0.68} fill={C.body} font-family={FONTS.body} font-size={rowFont} font-weight={600} text-anchor="middle">
                  {v}
                </text>
              ))}
            </g>
          );
        })}

      {/* Totals row */}
      <g>
        <rect x={pad} y={tableTop + (hasLog ? log.length : 0) * rowH} width={innerW} height={rowH} fill="rgba(8,14,40,0.78)" stroke={C.panelStroke} stroke-width={1} />
        <text x={pad + 14} y={tableTop + (hasLog ? log.length : 0) * rowH + rowH * 0.68} fill={COLORS.gold} font-family={FONTS.body} font-size={rowFont} font-weight={700} letter-spacing="0.08em">
          TOTALS{gp > 0 ? ` - ${gp} GP` : ""}
        </text>
        {totals.map((v, j) => (
          <text key={j} x={numColX(j)} y={tableTop + (hasLog ? log.length : 0) * rowH + rowH * 0.68} fill={COLORS.white} font-family={FONTS.body} font-size={rowFont} font-weight={700} text-anchor="middle">
            {v}
          </text>
        ))}
      </g>

      {/* Footer - sits on the brand strip when present, baseline-padded otherwise */}
      <text
        x={pad}
        y={footerStripH ? height - footerStripH * 0.38 : height - Math.round(height * 0.02)}
        fill={footerStripH ? COLORS.white : COLORS.gold}
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
        fill={footerStripH ? COLORS.icePale : COLORS.textDim}
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

function buildBioPairs(player: Player, gp: number): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  if (player.position) pairs.push(["POSITION", positionLabel(player.position)]);
  if (player.classYear) pairs.push(["CLASS", String(player.classYear)]);
  if (player.heightInches) pairs.push(["HEIGHT", formatHeight(player.heightInches)]);
  if (player.shoots) pairs.push(["SHOOTS", player.shoots]);
  if (player.hometown) pairs.push(["HOMETOWN", player.hometown.toUpperCase()]);
  if (gp > 0) pairs.push(["GAMES PLAYED", String(gp)]);
  return pairs.slice(0, 6);
}

function computeTotals(log: CardGameLine[], summary: PlayerSummary, isGoalie: boolean): number[] {
  if (log.length > 0) {
    // The log is internally consistent; sum it.
    const sum = (f: (l: CardGameLine) => number) => log.reduce((a, l) => a + f(l), 0);
    return isGoalie
      ? [sum((l) => l.shots), sum((l) => l.saves), sum((l) => Math.max(0, l.shots - l.saves))]
      : [sum((l) => l.goals), sum((l) => l.assists), sum((l) => l.points), sum((l) => l.pim)];
  }
  return isGoalie
    ? [summary.saves !== undefined && summary.goalsAgainst !== undefined ? summary.saves + summary.goalsAgainst : 0, summary.saves ?? 0, summary.goalsAgainst ?? 0]
    : [summary.goals, summary.assists, summary.points, summary.pim];
}

// Choose navy or white text for legibility on the team-color header bar, so a
// white or pale jersey color cannot produce white-on-white.
function readableOn(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return COLORS.white;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 150 ? COLORS.navyDeep : COLORS.white;
}

function positionLabel(p: Player["position"]): string {
  return p === "G" ? "GOALTENDER" : p === "D" ? "DEFENSE" : "FORWARD";
}

function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
