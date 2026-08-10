import type { BracketGame } from "../../engine/types.ts";
import type { PlayoffSlot } from "../../io/dataset.ts";
import { computeLayout, type CellBox } from "./layout.ts";
import { COLORS, FONTS } from "./theme.ts";
import { LOGO_ASPECT, type BrandAssets } from "../brand.ts";
import { FONT_FACE_CSS } from "../fontEmbed.ts";

interface Props {
  width: number;
  height: number;
  title: string;
  bracket: BracketGame[];
  nameById: (id: string) => string;
  colorById?: (id: string) => string | undefined;
  scheduleByCell?: (id: string) => PlayoffSlot | undefined;
  brand?: BrandAssets;
  fieldSize?: number;
  embedFonts?: boolean;
}

export function BracketSvg({ width, height, title, bracket, nameById, colorById, scheduleByCell, brand, fieldSize, embedFonts }: Props) {
  // Brand strips are authored at 1080x60; scale with export width (same
  // treatment as the player and share cards).
  const stripH = brand?.cardHeader ? Math.round((width * 60) / 1080) : 0;
  const footerStripH = brand?.cardFooter ? Math.round((width * 60) / 1080) : 0;
  const layout = computeLayout(width, height, fieldSize, {
    top: stripH ? stripH + 3 : 0,
    bottom: footerStripH,
  });
  const gameById = new Map(bracket.map((g) => [g.id, g]));
  const championId = gameById.get("final")?.winnerTeamId ?? null;

  const titleSize = Math.round(height * 0.038);
  // Round labels shrink with the column count so a 5-column (12-team) layout
  // never lets "QUARTERFINALS" spill into its neighbors.
  const labelSize = Math.min(Math.round(height * 0.014), Math.floor(width / (layout.columns.length * 10)));
  const seedSize = Math.round(layout.rowH * 0.4);
  const nameSize = Math.round(layout.rowH * 0.47);

  const margin = Math.round(width * 0.045);
  // Navy shield logo top-left; the title shifts right to sit beside it.
  const logoH = brand?.logoNavy ? Math.round(titleSize * 1.5) : 0;
  const logoW = Math.round(logoH * LOGO_ASPECT);
  const titleX = brand?.logoNavy ? margin + logoW + Math.round(width * 0.015) : margin;
  // Shrink the title so it never runs past the right margin. Teko caps run about
  // 0.62em wide; cap the shrink so a very long name stays readable, then hard-cap
  // the glyph run to the available width so it can never overflow regardless of
  // the font that ends up rendering.
  const titleMaxW = width - titleX - margin;
  const fittedTitleSize = Math.max(
    Math.round(height * 0.022),
    Math.min(titleSize, Math.floor(titleMaxW / Math.max(1, title.length * 0.62))),
  );
  const titleShrunk = fittedTitleSize < titleSize;

  // Subtle navy watermark anchored bottom-right.
  const wmW = Math.round(width * 0.5);
  const wmH = Math.round(wmW / LOGO_ASPECT);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {embedFonts && <style>{FONT_FACE_CSS}</style>}
      <rect x={0} y={0} width={width} height={height} fill={COLORS.card} />
      {brand?.watermarkNavy && (
        <image
          href={brand.watermarkNavy}
          x={width - wmW + Math.round(width * 0.06)}
          y={height - footerStripH - wmH - Math.round(height * 0.035)}
          width={wmW}
          height={wmH}
          preserveAspectRatio="xMaxYMax meet"
        />
      )}

      {/* Brand header strip with the signature gradient bar under it (the
          bare bar alone when the strip asset is unavailable). */}
      <defs>
        <linearGradient id="sigbar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2856" />
          <stop offset="30%" stopColor="#2e4a8a" />
          <stop offset="70%" stopColor="#a8cce0" />
          <stop offset="100%" stopColor="#dae8f3" />
        </linearGradient>
      </defs>
      {brand?.cardHeader ? (
        <>
          <image href={brand.cardHeader} x={0} y={0} width={width} height={stripH} preserveAspectRatio="none" />
          <rect x={0} y={stripH} width={width} height={3} fill="url(#sigbar)" />
        </>
      ) : (
        <rect x={0} y={0} width={width} height={3} fill="url(#sigbar)" />
      )}
      {brand?.cardFooter && (
        <image
          href={brand.cardFooter}
          x={0}
          y={height - footerStripH}
          width={width}
          height={footerStripH}
          preserveAspectRatio="none"
        />
      )}

      {brand?.logoNavy && (
        <image
          href={brand.logoNavy}
          x={margin}
          y={layout.headerY + titleSize - logoH + Math.round(titleSize * 0.18)}
          width={logoW}
          height={logoH}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <text
        x={titleX}
        y={layout.headerY + titleSize}
        fill={COLORS.navy}
        font-family={FONTS.head}
        font-size={fittedTitleSize}
        font-weight={600}
        letter-spacing="0.02em"
        textLength={titleShrunk ? titleMaxW : undefined}
        lengthAdjust={titleShrunk ? "spacingAndGlyphs" : undefined}
      >
        {title.toUpperCase()}
      </text>

      {/* Round labels */}
      {layout.columns.map((c) => (
        <text
          key={c.text}
          x={c.x}
          y={layout.labelY}
          fill={COLORS.royal}
          font-family={FONTS.body}
          font-size={labelSize}
          font-weight={700}
          letter-spacing="0.1em"
          text-anchor="middle"
        >
          {c.text}
        </text>
      ))}

      {/* Connectors */}
      {layout.connectors.map((cn, i) => {
        const midX = (cn.x1 + cn.x2) / 2;
        return (
          <path
            key={`cn-${i}`}
            d={`M ${cn.x1} ${cn.y1} H ${midX} V ${cn.y2} H ${cn.x2}`}
            fill="none"
            stroke={COLORS.line}
            stroke-width={2}
          />
        );
      })}

      {/* Match cells */}
      {layout.cells.map((cell) => {
        const game = gameById.get(cell.id);
        if (!game) return null;
        return renderCell(cell, game, {
          nameById,
          colorById,
          slot: scheduleByCell?.(cell.id),
          seedSize,
          nameSize,
          rowH: layout.rowH,
        });
      })}

      {/* Champion */}
      {renderChampion(layout.champion, championId, nameById, nameSize)}

      {/* Footer */}
      <text
        x={margin}
        y={layout.footerY}
        fill={COLORS.textDim}
        font-family={FONTS.body}
        font-size={labelSize}
        letter-spacing="0.08em"
      >
        @hockey.night
      </text>
      <text
        x={width - margin}
        y={layout.footerY}
        fill={COLORS.royal}
        font-family={FONTS.body}
        font-size={labelSize}
        letter-spacing="0.08em"
        text-anchor="end"
      >
        PlayHNIB.com
      </text>
    </svg>
  );
}

interface CellOpts {
  nameById: (id: string) => string;
  colorById?: (id: string) => string | undefined;
  slot?: PlayoffSlot;
  seedSize: number;
  nameSize: number;
  rowH: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-06-29T09:00:00" + rink -> "Mon 9:00 AM · Lamacchia" (TZ-safe parse).
function formatSlot(slot: PlayoffSlot): string {
  let when = "";
  const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(slot.slotStart ?? "");
  if (m) {
    const [, y, mo, d, hh, mm] = m;
    const dow = WEEKDAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
    let h = +hh;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    when = `${dow} ${h}:${mm} ${ampm}`;
  }
  return [when, slot.rink].filter(Boolean).join(" · ");
}

// Pick navy or white text for legibility on a given bubble fill.
function contrastInk(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return COLORS.white;
  const lum = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16);
  return lum > 150 ? COLORS.navy : COLORS.white;
}

function renderCell(cell: CellBox, game: BracketGame, opts: CellOpts) {
  const { rowH } = opts;
  const tag =
    game.decidedBy === "ot" ? "OT" : game.decidedBy === "shootout" ? "SO" : "";
  const caption = opts.slot ? formatSlot(opts.slot) : "";
  // Captions must stay inside their own column: a wide one would run under
  // the next round's caption or opaque cell. Shrink the font to fit first
  // (like team names), keeping glyph compression as the backstop.
  const capFull = Math.round(rowH * 0.28);
  const capSize = Math.max(
    Math.round(capFull * 0.7),
    Math.min(capFull, Math.floor((cell.w - 6) / Math.max(1, caption.length * 0.45))),
  );
  const capSqueezed = caption.length * capSize * 0.45 > cell.w - 6;
  return (
    <g key={cell.id}>
      {caption && (
        <text
          x={cell.x + 2}
          y={cell.y - Math.round(rowH * 0.2)}
          fill={COLORS.royal}
          font-family={FONTS.body}
          font-size={capSize}
          font-weight={600}
          letter-spacing="0.04em"
          textLength={capSqueezed ? cell.w - 6 : undefined}
          lengthAdjust={capSqueezed ? "spacingAndGlyphs" : undefined}
        >
          {caption}
        </text>
      )}
      <rect
        x={cell.x}
        y={cell.y}
        width={cell.w}
        height={cell.h}
        rx={6}
        fill={COLORS.card}
        stroke={COLORS.line}
        stroke-width={1.5}
      />
      {teamRow(cell, cell.y, game.highSeed, game.highTeamId, game.highScore, game.winnerTeamId, opts)}
      <line
        x1={cell.x}
        y1={cell.y + rowH}
        x2={cell.x + cell.w}
        y2={cell.y + rowH}
        stroke={COLORS.line}
        stroke-width={1}
      />
      {teamRow(cell, cell.y + rowH, game.lowSeed, game.lowTeamId, game.lowScore, game.winnerTeamId, opts)}
      {tag && (
        <text
          x={cell.x + cell.w - 5}
          y={cell.y + cell.h - 4}
          fill={COLORS.royal}
          font-family={FONTS.body}
          font-size={Math.max(10, Math.round(rowH * 0.28))}
          font-weight={700}
          text-anchor="end"
        >
          {tag}
        </text>
      )}
    </g>
  );
}

function teamRow(
  cell: CellBox,
  rowY: number,
  seed: number | null,
  teamId: string | null,
  score: number | null,
  winnerTeamId: string | null,
  opts: CellOpts,
) {
  const isWinner = teamId !== null && teamId === winnerTeamId;
  const name = teamId ? opts.nameById(teamId) : "-";
  const cy = rowY + opts.rowH / 2;
  const baseline = cy + opts.nameSize * 0.34;
  const r = Math.round(opts.rowH * 0.22);
  const pad = Math.max(5, Math.round(opts.rowH * 0.1));
  const bubbleX = cell.x + pad + r;
  const nameX = cell.x + pad + r * 2 + Math.max(4, Math.round(opts.rowH * 0.08));

  // Seed bubble: filled with the team's jersey color when the team is known,
  // a light outline when only the seed slot is (an undecided feeder).
  const rawColor = teamId ? opts.colorById?.(teamId) : undefined;
  const bubbleFill = rawColor && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : null;

  // Long names (Worcester County, NE Connecticut) first drop the font a step
  // to fit between the seed bubble and the score, and only then compress
  // glyph spacing - never both from full size, which crushed names into
  // unreadable slivers on tall exports. Barlow Condensed runs ~0.45em/glyph.
  // Score space is only reserved once there IS a score (a hockey score is a
  // digit or two), which matters most in the narrow 5-column 12-team layout.
  const scoreReserve = Math.round(opts.nameSize * (score !== null ? (score >= 10 ? 1.1 : 0.75) : 0.3));
  const maxNameW = cell.x + cell.w - 10 - scoreReserve - nameX;
  const fittedNameSize = Math.max(
    Math.round(opts.nameSize * 0.55),
    Math.min(opts.nameSize, Math.floor(maxNameW / Math.max(1, name.length * 0.47))),
  );
  const nameSqueezed = name.length * fittedNameSize * 0.47 > maxNameW;

  return (
    <g>
      {isWinner && (
        <rect x={cell.x} y={rowY + 4} width={3} height={opts.rowH - 8} fill={COLORS.gold} />
      )}
      {seed != null && (
        <>
          <circle
            cx={bubbleX}
            cy={cy}
            r={r}
            fill={bubbleFill ?? COLORS.card}
            stroke={isWinner ? COLORS.gold : COLORS.line}
            stroke-width={isWinner ? 2 : 1}
          />
          <text
            x={bubbleX}
            y={cy + opts.seedSize * 0.34}
            fill={bubbleFill ? contrastInk(bubbleFill) : COLORS.textDim}
            font-family={FONTS.body}
            font-size={opts.seedSize}
            font-weight={700}
            text-anchor="middle"
          >
            {seed}
          </text>
        </>
      )}
      <text
        x={nameX}
        y={baseline}
        fill={isWinner ? COLORS.gold : COLORS.navy}
        font-family={FONTS.body}
        font-size={fittedNameSize}
        font-weight={isWinner ? 700 : 400}
        textLength={nameSqueezed ? maxNameW : undefined}
        lengthAdjust={nameSqueezed ? "spacingAndGlyphs" : undefined}
      >
        {name}
      </text>
      <text
        x={cell.x + cell.w - 12}
        y={baseline}
        fill={COLORS.navy}
        font-family={FONTS.body}
        font-size={opts.nameSize}
        font-weight={700}
        text-anchor="end"
      >
        {score ?? ""}
      </text>
    </g>
  );
}

function renderChampion(
  box: CellBox,
  championId: string | null,
  nameById: (id: string) => string,
  nameSize: number,
) {
  const label = championId ? nameById(championId).toUpperCase() : "TBD";
  // Fit a long champion name inside the box: shrink the Teko size first
  // (~0.62em per cap glyph), then compress glyph spacing as the last resort.
  const full = Math.round(nameSize * 1.05);
  const maxW = box.w - 16;
  const fitted = Math.max(
    Math.round(full * 0.6),
    Math.min(full, Math.floor(maxW / Math.max(1, label.length * 0.62))),
  );
  const squeezed = label.length * fitted * 0.62 > maxW;
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={6}
        fill={championId ? COLORS.gold : COLORS.card}
        stroke={championId ? COLORS.gold : COLORS.line}
        stroke-width={1.5}
      />
      <text
        x={box.x + box.w / 2}
        y={box.y + box.h * 0.62}
        fill={championId ? COLORS.navy : COLORS.textDim}
        font-family={FONTS.head}
        font-size={fitted}
        font-weight={600}
        letter-spacing="0.02em"
        text-anchor="middle"
        textLength={squeezed ? maxW : undefined}
        lengthAdjust={squeezed ? "spacingAndGlyphs" : undefined}
      >
        {label}
      </text>
    </g>
  );
}
