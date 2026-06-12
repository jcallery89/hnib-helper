import type { Player, PlayerSummary } from "../../engine/types.ts";
import { COLORS, FONTS } from "../bracket/theme.ts";

interface Props {
  width: number;
  height: number;
  player: Player;
  summary: PlayerSummary;
  teamName: string;
  eventName: string;
  accentColor?: string;
}

export function PlayerCard({ width, height, player, summary, teamName, eventName, accentColor }: Props) {
  const pad = Math.round(width * 0.07);
  const accent = accentColor || COLORS.ice;

  const titleSize = Math.round(height * 0.062);
  const labelSize = Math.round(height * 0.016);
  const jerseySize = Math.round(height * 0.13);
  const statNum = Math.round(height * 0.058);

  const stats = summary.isGoalie
    ? [
        { label: "GP", value: String(summary.gp) },
        { label: "GAA", value: summary.gaa !== undefined ? summary.gaa.toFixed(2) : "-" },
        { label: "SV%", value: summary.savePct !== undefined ? summary.savePct.toFixed(3).replace(/^0/, "") : "-" },
        { label: "SV", value: summary.saves !== undefined ? String(summary.saves) : "-" },
      ]
    : [
        { label: "GP", value: String(summary.gp) },
        { label: "G", value: String(summary.goals) },
        { label: "A", value: String(summary.assists) },
        { label: "PTS", value: String(summary.points) },
      ];

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
      <defs>
        <linearGradient id="sigbar-pc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2856" />
          <stop offset="30%" stopColor="#2e4a8a" />
          <stop offset="70%" stopColor="#a8cce0" />
          <stop offset="100%" stopColor="#dae8f3" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={4} fill="url(#sigbar-pc)" />

      {/* Event + team */}
      <text x={pad} y={pad + labelSize} fill={COLORS.textDim} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.1em">
        {eventName.toUpperCase()}
      </text>
      <text x={pad} y={pad + labelSize * 2.6} fill={accent} font-family={FONTS.body} font-size={labelSize * 1.3} font-weight={700} letter-spacing="0.08em">
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
      <text x={pad} y={Math.round(height * 0.53)} fill={COLORS.textPrimary} font-family={FONTS.body} font-size={labelSize * 1.15} font-weight={500} letter-spacing="0.06em">
        {bio.join("   -   ")}
      </text>

      {/* Stat block */}
      <rect x={pad} y={statBoxY} width={width - pad * 2} height={statBoxH} rx={8} fill={COLORS.surface} stroke={COLORS.border} />
      {stats.map((s, i) => (
        <g key={s.label}>
          <text x={pad + colW * (i + 0.5)} y={statBoxY + statBoxH * 0.52} fill={COLORS.white} font-family={FONTS.head} font-size={statNum} font-weight={700} text-anchor="middle">
            {s.value}
          </text>
          <text x={pad + colW * (i + 0.5)} y={statBoxY + statBoxH * 0.8} fill={COLORS.ice} font-family={FONTS.body} font-size={labelSize} font-weight={700} letter-spacing="0.12em" text-anchor="middle">
            {s.label}
          </text>
        </g>
      ))}

      {/* Footer */}
      <text x={pad} y={height - pad} fill={COLORS.gold} font-family={FONTS.body} font-size={labelSize * 1.1} font-weight={700} letter-spacing="0.08em">
        GET SEEN. GET RECRUITED.
      </text>
      <text x={width - pad} y={height - pad} fill={COLORS.textDim} font-family={FONTS.body} font-size={labelSize} letter-spacing="0.08em" text-anchor="end">
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
