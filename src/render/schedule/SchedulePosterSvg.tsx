import type { PosterRow } from "../../io/importDaySchedule.ts";
import { COLORS, FONTS } from "../bracket/theme.ts";
import { LOGO_ASPECT, type BrandAssets } from "../brand.ts";
import { FONT_FACE_CSS } from "../fontEmbed.ts";

interface Props {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  rows: PosterRow[];
  brand?: BrandAssets;
  embedFonts?: boolean;
}

// Event accent colors (and the ink that reads on them).
const EVENT = {
  soph: { bar: "#344eaa", ink: "#ffffff", label: "Sophomore" },
  jr: { bar: "#d4a843", ink: "#1c2660", label: "Jr. High" },
  other: { bar: "#6b7798", ink: "#ffffff", label: "Event" },
} as const;

export function SchedulePosterSvg({ width, height, title, subtitle, rows, brand, embedFonts }: Props) {
  const margin = Math.round(width * 0.05);
  const titleSize = Math.round(height * 0.034);
  const subSize = Math.round(height * 0.018);
  const footSize = Math.round(height * 0.014);

  const logoH = brand?.logoNavy ? Math.round(titleSize * 1.5) : 0;
  const logoW = Math.round(logoH * LOGO_ASPECT);
  const titleX = brand?.logoNavy ? margin + logoW + Math.round(width * 0.02) : margin;

  const wmW = Math.round(width * 0.55);
  const wmH = Math.round(wmW / LOGO_ASPECT);

  // Header block, then the legend, then the rows fill to the footer.
  const headerY = Math.round(height * 0.045);
  const legendY = headerY + titleSize + subSize + Math.round(height * 0.028);
  const listTop = legendY + Math.round(height * 0.03);
  const footerY = height - Math.round(height * 0.035);
  const listBottom = footerY - Math.round(height * 0.03);

  const n = Math.max(rows.length, 1);
  const rowH = Math.min(Math.round(height * 0.064), Math.floor((listBottom - listTop) / n));
  const rowGap = Math.round(rowH * 0.14);
  const cardH = rowH - rowGap;

  const timeW = Math.round(width * 0.2);
  const rinkW = Math.round(width * 0.17);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      {embedFonts && <style>{FONT_FACE_CSS}</style>}
      <rect x={0} y={0} width={width} height={height} fill={COLORS.bg} />
      {brand?.watermarkNavy && (
        <image href={brand.watermarkNavy} x={width - wmW + Math.round(width * 0.08)} y={height - wmH - Math.round(height * 0.04)} width={wmW} height={wmH} preserveAspectRatio="xMaxYMax meet" opacity={0.5} />
      )}

      <defs>
        <linearGradient id="sigbar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2856" />
          <stop offset="30%" stopColor="#2e4a8a" />
          <stop offset="70%" stopColor="#a8cce0" />
          <stop offset="100%" stopColor="#dae8f3" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={4} fill="url(#sigbar)" />

      {brand?.logoNavy && (
        <image href={brand.logoNavy} x={margin} y={headerY + titleSize - logoH + Math.round(titleSize * 0.2)} width={logoW} height={logoH} preserveAspectRatio="xMidYMid meet" />
      )}
      <text x={titleX} y={headerY + titleSize} fill={COLORS.navy} font-family={FONTS.head} font-size={titleSize} font-weight={600} letter-spacing="0.01em">
        {title.toUpperCase()}
      </text>
      <text x={titleX} y={headerY + titleSize + subSize + Math.round(height * 0.006)} fill={COLORS.royal} font-family={FONTS.body} font-size={subSize} font-weight={600} letter-spacing="0.04em">
        {subtitle}
      </text>

      {/* Legend */}
      {legendChips(margin, legendY, subSize)}

      {/* Rows */}
      {rows.map((r, i) => {
        const y = listTop + i * rowH;
        const ev = EVENT[r.eventKey];
        return (
          <g key={i}>
            <rect x={margin} y={y} width={width - margin * 2} height={cardH} rx={8} fill={COLORS.card} stroke={COLORS.line} stroke-width={1} />
            <rect x={margin} y={y} width={6} height={cardH} rx={3} fill={ev.bar} />
            {/* Time */}
            <text x={margin + 20} y={y + cardH * 0.62} fill={COLORS.navy} font-family={FONTS.head} font-size={Math.round(cardH * 0.42)} font-weight={600}>
              {r.time}
            </text>
            {/* Matchup + phase */}
            <text x={margin + timeW} y={y + cardH * 0.46} fill={COLORS.navy} font-family={FONTS.body} font-size={Math.round(cardH * 0.34)} font-weight={600}>
              {r.matchup}
            </text>
            {(r.phase || ev.label) && (
              <text x={margin + timeW} y={y + cardH * 0.82} fill={COLORS.textDim} font-family={FONTS.body} font-size={Math.round(cardH * 0.24)} letter-spacing="0.04em">
                {[ev.label, r.phase].filter(Boolean).join(" · ")}
              </text>
            )}
            {/* Rink chip */}
            {r.rink && (
              <>
                <rect x={width - margin - rinkW} y={y + cardH * 0.26} width={rinkW - 16} height={cardH * 0.48} rx={cardH * 0.24} fill={COLORS.zebra} stroke={COLORS.line} stroke-width={1} />
                <text x={width - margin - rinkW + (rinkW - 16) / 2} y={y + cardH * 0.6} fill={COLORS.royal} font-family={FONTS.body} font-size={Math.round(cardH * 0.28)} font-weight={600} text-anchor="middle">
                  {r.rink}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Footer */}
      <text x={margin} y={footerY} fill={COLORS.textDim} font-family={FONTS.body} font-size={footSize} letter-spacing="0.08em">
        @hockey.night
      </text>
      <text x={width - margin} y={footerY} fill={COLORS.royal} font-family={FONTS.body} font-size={footSize} letter-spacing="0.08em" text-anchor="end">
        PlayHNIB.com
      </text>
    </svg>
  );

  function legendChips(x: number, y: number, size: number) {
    const keys: Array<keyof typeof EVENT> = ["soph", "jr"];
    let cx = x;
    return (
      <g>
        {keys.map((k) => {
          const ev = EVENT[k];
          const w = Math.round(ev.label.length * size * 0.62) + Math.round(size * 2.4);
          const chip = (
            <g key={k}>
              <rect x={cx} y={y} width={w} height={Math.round(size * 1.7)} rx={Math.round(size * 0.85)} fill={ev.bar} />
              <text x={cx + w / 2} y={y + Math.round(size * 1.2)} fill={ev.ink} font-family={FONTS.body} font-size={size} font-weight={700} letter-spacing="0.04em" text-anchor="middle">
                {ev.label.toUpperCase()}
              </text>
            </g>
          );
          cx += w + Math.round(size * 0.8);
          return chip;
        })}
      </g>
    );
  }
}
