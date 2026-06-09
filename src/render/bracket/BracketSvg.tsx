import type { BracketGame } from "../../engine/types.ts";
import { computeLayout, type CellBox } from "./layout.ts";
import { COLORS, FONTS } from "./theme.ts";

interface Props {
  width: number;
  height: number;
  title: string;
  bracket: BracketGame[];
  nameById: (id: string) => string;
}

export function BracketSvg({ width, height, title, bracket, nameById }: Props) {
  const layout = computeLayout(width, height);
  const gameById = new Map(bracket.map((g) => [g.id, g]));
  const championId = gameById.get("final")?.winnerTeamId ?? null;

  const titleSize = Math.round(height * 0.038);
  const labelSize = Math.round(height * 0.014);
  const seedSize = Math.round(layout.rowH * 0.42);
  const nameSize = Math.round(layout.rowH * 0.5);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <rect x={0} y={0} width={width} height={height} fill={COLORS.navyDeep} />

      {/* Signature gradient bar */}
      <defs>
        <linearGradient id="sigbar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2856" />
          <stop offset="30%" stopColor="#2e4a8a" />
          <stop offset="70%" stopColor="#a8cce0" />
          <stop offset="100%" stopColor="#dae8f3" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={3} fill="url(#sigbar)" />

      <text
        x={Math.round(width * 0.045)}
        y={layout.headerY + titleSize}
        fill={COLORS.white}
        font-family={FONTS.head}
        font-size={titleSize}
        font-weight={600}
        letter-spacing="0.02em"
      >
        {title.toUpperCase()}
      </text>

      {/* Round labels */}
      {layout.columns.map((c) => (
        <text
          key={c.text}
          x={c.x}
          y={layout.labelY}
          fill={COLORS.textDim}
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
            stroke={COLORS.border}
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
          seedSize,
          nameSize,
          rowH: layout.rowH,
        });
      })}

      {/* Champion */}
      {renderChampion(layout.champion, championId, nameById, nameSize)}

      {/* Footer */}
      <text
        x={Math.round(width * 0.045)}
        y={layout.footerY}
        fill={COLORS.textDim}
        font-family={FONTS.body}
        font-size={labelSize}
        letter-spacing="0.08em"
      >
        @hockey.night
      </text>
      <text
        x={width - Math.round(width * 0.045)}
        y={layout.footerY}
        fill={COLORS.ice}
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
  seedSize: number;
  nameSize: number;
  rowH: number;
}

function renderCell(cell: CellBox, game: BracketGame, opts: CellOpts) {
  const { rowH } = opts;
  const tag =
    game.decidedBy === "ot" ? "OT" : game.decidedBy === "shootout" ? "SO" : "";
  return (
    <g key={cell.id}>
      <rect
        x={cell.x}
        y={cell.y}
        width={cell.w}
        height={cell.h}
        rx={6}
        fill={COLORS.surface}
        stroke={COLORS.border}
        stroke-width={1}
      />
      {teamRow(cell, cell.y, game.highSeed, game.highTeamId, game.highScore, game.winnerTeamId, opts)}
      <line
        x1={cell.x}
        y1={cell.y + rowH}
        x2={cell.x + cell.w}
        y2={cell.y + rowH}
        stroke={COLORS.border}
        stroke-width={1}
      />
      {teamRow(cell, cell.y + rowH, game.lowSeed, game.lowTeamId, game.lowScore, game.winnerTeamId, opts)}
      {tag && (
        <text
          x={cell.x + cell.w - 6}
          y={cell.y + cell.h - 5}
          fill={COLORS.ice}
          font-family={FONTS.body}
          font-size={opts.seedSize}
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
  const accent = isWinner ? COLORS.gold : COLORS.ice;
  const textColor = isWinner ? COLORS.white : COLORS.textPrimary;
  return (
    <g>
      {isWinner && (
        <rect x={cell.x} y={rowY + 4} width={3} height={opts.rowH - 8} fill={COLORS.gold} />
      )}
      <text
        x={cell.x + 12}
        y={rowY + opts.rowH * 0.66}
        fill={accent}
        font-family={FONTS.body}
        font-size={opts.seedSize}
        font-weight={700}
        letter-spacing="0.08em"
      >
        {seed ?? ""}
      </text>
      <text
        x={cell.x + 12 + opts.seedSize + 8}
        y={rowY + opts.rowH * 0.66}
        fill={textColor}
        font-family={FONTS.body}
        font-size={opts.nameSize}
        font-weight={isWinner ? 600 : 400}
      >
        {name}
      </text>
      <text
        x={cell.x + cell.w - 12}
        y={rowY + opts.rowH * 0.66}
        fill={textColor}
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
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={6}
        fill={championId ? COLORS.gold : COLORS.surface}
        stroke={championId ? COLORS.gold : COLORS.border}
        stroke-width={1}
      />
      <text
        x={box.x + box.w / 2}
        y={box.y + box.h * 0.62}
        fill={championId ? COLORS.navyDeep : COLORS.textDim}
        font-family={FONTS.head}
        font-size={nameSize * 1.05}
        font-weight={600}
        letter-spacing="0.02em"
        text-anchor="middle"
      >
        {championId ? nameById(championId).toUpperCase() : "TBD"}
      </text>
    </g>
  );
}
