// Pure geometry for the 8-team single-elimination bracket, parameterized by the
// target image dimensions so the same component drives every social size.

export interface CellBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Connector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ColumnLabel {
  text: string;
  x: number;
}

export interface BracketLayout {
  width: number;
  height: number;
  headerY: number; // baseline area for the title
  labelY: number; // round label row
  contentTop: number;
  cells: CellBox[];
  connectors: Connector[];
  columns: ColumnLabel[];
  champion: CellBox;
  footerY: number;
  rowH: number;
}

export function computeLayout(
  width: number,
  height: number,
  fieldSize = 8,
  insets: { top?: number; bottom?: number } = {},
): BracketLayout {
  const six = fieldSize === 6;
  const twelve = fieldSize === 12;
  // Brand header/footer strips (when present) reserve their own bands; the
  // whole composition shifts inside them instead of drawing underneath.
  const insetTop = insets.top ?? 0;
  const insetBottom = insets.bottom ?? 0;
  const margin = Math.round(width * (twelve ? 0.025 : 0.045));
  const headerY = insetTop + Math.round(height * 0.035);
  const labelY = insetTop + Math.round(height * 0.12);
  const contentTop = insetTop + Math.round(height * 0.155);
  const footerY = height - insetBottom - Math.round(height * 0.032);
  const contentBottom = footerY - Math.round(height * 0.03);

  // Columns: QF, SF, FINAL, CHAMPION - plus a leading ROUND 1 for 12 teams.
  // In the crowded 5-column layout the champion box (a single centered name)
  // cedes width to the four game columns, where every pixel feeds team names.
  const colCount = twelve ? 5 : 4;
  const usableW = width - margin * 2;
  const colGap = Math.round(usableW * (twelve ? 0.018 : 0.05));
  const champW = twelve
    ? Math.round((usableW - colGap * 4) * (0.62 / 4.62))
    : Math.round((usableW - colGap * 3) / 4);
  const colW = twelve
    ? Math.round((usableW - colGap * 4 - champW) / 4)
    : champW;
  const colX = Array.from({ length: colCount }, (_, i) => margin + i * (colW + colGap));

  // The cells own most of the vertical band; gaps stay smaller than a cell so
  // the bracket reads as boxes-with-breathing-room rather than dots in a void
  // (the old 0.052 row factor left cramped rows separated by huge gaps). The
  // pair that feeds one semifinal stays tighter than the gap between pairs.
  // Row height is ALSO capped by the column width: tall exports (1080x1920)
  // grow the band but not the columns, and an uncapped row makes bubbles and
  // type outgrow the box they live in.
  // The 12-team column is narrow but its vertical band is generous, so it
  // runs taller rows (bigger type) with tighter gaps between pair groups.
  const band = contentBottom - contentTop;
  const rowH = Math.max(
    28,
    Math.min(Math.round(band * (six ? 0.1 : twelve ? 0.095 : 0.085)), Math.round(colW * (twelve ? 0.5 : 0.42))),
  );
  const cellH = rowH * 2;

  const cells: CellBox[] = [];
  const connectors: Connector[] = [];

  // First-round cells (Round 1 for 12 teams, otherwise the QFs/play-ins),
  // grouped so games feeding the same next-round game sit tighter than the
  // gap between pairs.
  const r1Ids = twelve ? ["pr1", "pr2", "pr3", "pr4"] : six ? ["qf1", "qf2"] : ["qf1", "qf2", "qf3", "qf4"];
  let r1Centers: number[];
  if (six) {
    r1Centers = [0.27, 0.73].map((nrm) => contentTop + nrm * band);
  } else {
    const intraGap = Math.round(band * (twelve ? 0.055 : 0.08)); // between the games of one pair
    const interGap = Math.round(band * (twelve ? 0.1 : 0.15)); // between the two pairs
    const total = cellH * 4 + intraGap * 2 + interGap;
    const top = contentTop + Math.max(0, Math.round((band - total) / 2));
    const c1 = top + cellH / 2;
    const c2 = c1 + cellH + intraGap;
    const c3 = c2 + cellH + interGap;
    const c4 = c3 + cellH + intraGap;
    r1Centers = [c1, c2, c3, c4];
  }
  r1Ids.forEach((id, i) => {
    cells.push({ id, x: colX[0], y: r1Centers[i] - cellH / 2, w: colW, h: cellH });
  });

  // Quarterfinals (12-team only): each bye-seed QF aligns with the Round 1 game
  // that feeds it.
  const qfCol = twelve ? 1 : 0;
  if (twelve) {
    ["qf1", "qf2", "qf3", "qf4"].forEach((id, i) => {
      cells.push({ id, x: colX[1], y: r1Centers[i] - cellH / 2, w: colW, h: cellH });
    });
  }
  const qfCenters = r1Centers;

  // Semifinals. In a 6-team field each semi aligns with its play-in game (the bye
  // seed shares the cell); otherwise a semi sits between the two games feeding it.
  const sf1Center = six ? qfCenters[0] : (qfCenters[0] + qfCenters[1]) / 2;
  const sf2Center = six ? qfCenters[1] : (qfCenters[2] + qfCenters[3]) / 2;
  cells.push({ id: "sf1", x: colX[qfCol + 1], y: sf1Center - cellH / 2, w: colW, h: cellH });
  cells.push({ id: "sf2", x: colX[qfCol + 1], y: sf2Center - cellH / 2, w: colW, h: cellH });

  const finalCenter = (sf1Center + sf2Center) / 2;
  cells.push({ id: "final", x: colX[qfCol + 2], y: finalCenter - cellH / 2, w: colW, h: cellH });

  const championH = Math.round(rowH * 1.3);
  const champion: CellBox = { id: "champion", x: colX[qfCol + 3], y: finalCenter - championH / 2, w: champW, h: championH };

  const byId = new Map(cells.map((c) => [c.id, c]));
  if (twelve) {
    ["pr1", "pr2", "pr3", "pr4"].forEach((id, i) => {
      connectors.push(connect(byId.get(id)!, byId.get(`qf${i + 1}`)!));
    });
  }
  if (!six) {
    connectors.push(connect(byId.get("qf1")!, byId.get("sf1")!));
    connectors.push(connect(byId.get("qf2")!, byId.get("sf1")!));
    connectors.push(connect(byId.get("qf3")!, byId.get("sf2")!));
    connectors.push(connect(byId.get("qf4")!, byId.get("sf2")!));
  } else {
    connectors.push(connect(byId.get("qf1")!, byId.get("sf1")!));
    connectors.push(connect(byId.get("qf2")!, byId.get("sf2")!));
  }
  connectors.push(connect(byId.get("sf1")!, byId.get("final")!));
  connectors.push(connect(byId.get("sf2")!, byId.get("final")!));
  connectors.push(connect(byId.get("final")!, champion));

  const columns: ColumnLabel[] = [
    ...(twelve ? [{ text: "ROUND 1", x: colX[0] + colW / 2 }] : []),
    { text: six ? "PLAY-IN" : "QUARTERFINALS", x: colX[qfCol] + colW / 2 },
    { text: "SEMIFINALS", x: colX[qfCol + 1] + colW / 2 },
    { text: "FINAL", x: colX[qfCol + 2] + colW / 2 },
    { text: "CHAMPION", x: colX[qfCol + 3] + champW / 2 },
  ];

  return {
    width,
    height,
    headerY,
    labelY,
    contentTop,
    cells,
    connectors,
    columns,
    champion,
    footerY,
    rowH,
  };
}

// Elbow connector from the right edge of `from` to the left edge of `to`.
function connect(from: CellBox, to: CellBox): Connector {
  return {
    x1: from.x + from.w,
    y1: from.y + from.h / 2,
    x2: to.x,
    y2: to.y + to.h / 2,
  };
}
