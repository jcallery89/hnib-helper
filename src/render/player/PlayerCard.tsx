import type { Player, PlayerSummary } from "../../engine/types.ts";
import { ART_COLORS, COLORS, FONTS } from "../bracket/theme.ts";
import { bgForSize, type BrandAssets } from "../brand.ts";

interface Props {
  width: number;
  height: number;
  player: Player;
  summary: PlayerSummary;
  teamName: string;
  eventName: string;
  accentColor?: string;
  brand?: BrandAssets;
}

export function PlayerCard({ width, height, player, summary, teamName, eventName, accentColor, brand }: Props) {
  const pad = Math.round(width * 0.07);
  const bg = bgForSize(brand, width, height);
  const onArt = Boolean(bg);
  // Over the brand artwork (brighter royal blue) the site's dim grays and dark
  // navy panels clash; switch to the artwork-matched palette there.
  const C = {
    label: onArt ? ART_COLORS.ice : COLORS.textDim,
    team: onArt ? COLORS.white : accentColor || COLORS.ice,
    bio: onArt ? ART_COLORS.bright : COLORS.textPrimary,
    panelFill: onArt ? ART_COLORS.panel : COLORS.surface,
    panelStroke: onArt ? ART_COLORS.panelBorder : COLORS.border,
    statLabel: onArt ? ART_COLORS.ice : COLORS.ice,
  };
  // Header/footer strips are authored at 1080x60; scale with export width.
  const stripH = brand?.cardHeader ? Math.round((width * 60) / 1080) : 0;
  const footerStripH = brand?.cardFooter ? Math.round((width * 60) / 1080) : 0;

  const titleSize = Math.round(height * 0.062);
  const labelSize = Math.round(height * 0.016);
  const jerseySize = Math.round(height * 0.13);
  const statNum = Math.round(height * 0.058);

  // The live API often reports GP as 0; drop the tile rather than show a
  // number that reads as wrong next to real goals and assists.
  const hasGp = summary.gp > 0;
  const stats = (
    summary.isGoalie
      ? [
          hasGp ? { label: "GP", value: String(summary.gp) } : null,
          { label: "GAA", value: summary.gaa !== undefined ? summary.gaa.toFixed(2) : "-" },
          { label: "SV%", value: summary.savePct !== undefined ? summary.savePct.toFixed(3).replace(/^0/, "") : "-" },
          { label: "SV", value: summary.saves !== undefined ? String(summary.saves) : "-" },
        ]
      : [
          hasGp ? { label: "GP", value: String(summary.gp) } : null,
          { label: "G", value: String(summary.goals) },
          { label: "A", value: String(summary.assists) },
          { label: "PTS", value: String(summary.points) },
        ]
  ).filter(Boolean) as Array<{ label: string; value: string }>;

  const bio = [
    player.position ? positionLabel(player.position) : null,
    player.classYear ? `CLASS OF ${player.classYear}` : null,
    player.heightInches ? formatHeight(player.heightInches) : null,
    player.shoots ? `SHOOTS ${player.shoots}` : null,
    player.hometown ? player.hometown.toUpperCase() : null,
  ].filter(Boolean) as string[];

  const statBoxY = Math.round(height * 0.6);
  const statBoxH = Math.round(height * 0.16);
  const colW = (width - pad * 2) / stats.length;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={height} fill={COLORS.navyDeep} />
      {bg && (
        <image
          href={bg}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
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
        <image
          href={brand.cardFooter}
          x={0}
          y={height - footerStripH}
          width={width}
          height={footerStripH}
          preserveAspectRatio="none"
        />
      )}

      {/* Event + team. Team color appears as a contained swatch, not as text
          color, so jersey reds/greens cannot clash with the background. */}
      <text x={pad} y={pad + labelSize} fill={C.label} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em">
        {eventName.toUpperCase()}
      </text>
      {accentColor && (
        <rect
          x={pad}
          y={pad + labelSize * 1.55}
          width={labelSize * 1.15}
          height={labelSize * 1.15}
          rx={3}
          fill={accentColor}
          stroke="rgba(255,255,255,0.55)"
          stroke-width={1}
        />
      )}
      <text
        x={accentColor ? pad + labelSize * 1.8 : pad}
        y={pad + labelSize * 2.6}
        fill={C.team}
        font-family={FONTS.body}
        font-size={labelSize * 1.3}
        font-weight={700}
        letter-spacing="0.08em"
      >
        {teamName.toUpperCase()}
      </text>

      {/* Jersey number */}
      <text x={width - pad} y={pad + jerseySize * 0.8} fill={COLORS.gold} font-family={FONTS.head} font-size={jerseySize} font-weight={700} text-anchor="end">
        {player.jersey !== null ? player.jersey : ""}
      </text>

      {/* Name */}
      <text x={pad} y={Math.round(height * 0.42)} fill={COLORS.white} font-family={FONTS.head} font-size={titleSize} font-weight={600} letter-spacing="0.02em">
        {player.firstName.toUpperCase()}
      </text>
      <text x={pad} y={Math.round(height * 0.42) + titleSize * 0.92} fill={COLORS.white} font-family={FONTS.head} font-size={titleSize} font-weight={600} letter-spacing="0.02em">
        {player.lastName.toUpperCase()}
      </text>

      {/* Bio line */}
      <text x={pad} y={Math.round(height * 0.53)} fill={C.bio} font-family={FONTS.body} font-size={labelSize * 1.15} font-weight={500} letter-spacing="0.06em">
        {bio.join("   -   ")}
      </text>

      {/* Stat block */}
      <rect x={pad} y={statBoxY} width={width - pad * 2} height={statBoxH} rx={8} fill={C.panelFill} stroke={C.panelStroke} />
      {stats.map((s, i) => (
        <g key={s.label}>
          <text x={pad + colW * (i + 0.5)} y={statBoxY + statBoxH * 0.52} fill={COLORS.white} font-family={FONTS.head} font-size={statNum} font-weight={700} text-anchor="middle">
            {s.value}
          </text>
          <text x={pad + colW * (i + 0.5)} y={statBoxY + statBoxH * 0.8} fill={C.statLabel} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.12em" text-anchor="middle">
            {s.label}
          </text>
        </g>
      ))}

      {/* Footer - sits on the brand strip when present, baseline-padded otherwise */}
      <text
        x={pad}
        y={footerStripH ? height - footerStripH * 0.38 : height - pad}
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
        y={footerStripH ? height - footerStripH * 0.38 : height - pad}
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

function positionLabel(p: Player["position"]): string {
  return p === "G" ? "GOALTENDER" : p === "D" ? "DEFENSE" : "FORWARD";
}

function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
