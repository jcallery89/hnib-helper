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

export function computeLayout(width: number, height: number, fieldSize = 8): BracketLayout {
  const six = fieldSize === 6;
  const twelve = fieldSize === 12;
  const margin = Math.round(width * 0.045);
  const headerY = Math.round(height * 0.04);
  const labelY = Math.round(height * 0.13);
  const contentTop = Math.round(height * 0.17);
  const footerY = height - Math.round(height * 0.04);
  const contentBottom = footerY - Math.round(height * 0.03);

  // Columns: QF, SF, FINAL, CHAMPION - plus a leading ROUND 1 for 12 teams.
  const colCount = twelve ? 5 : 4;
  const usableW = width - margin * 2;
  const colGap = Math.round(usableW * (twelve ? 0.03 : 0.05));
  const colW = Math.round((usableW - colGap * (colCount - 1)) / colCount);
  const colX = Array.from({ length: colCount }, (_, i) => margin + i * (colW + colGap));

  const rowH = Math.max(28, Math.round((contentBottom - contentTop) * 0.052));
  const cellH = rowH * 2;

  // Center band the QF cells can occupy without their boxes running past the
  // content edges.
  const centerTop = contentTop + cellH / 2;
  const centerBot = contentBottom - cellH / 2;
  const span = centerBot - centerTop;

  const cells: CellBox[] = [];
  const connectors: Connector[] = [];

  // First-round cells, grouped so games feeding the same next-round game sit
  // tighter than the gap between pairs (the classic bracket shape: intra-pair
  // gap 1 unit, inter-pair gap 2 units). A 6-team field has just the two
  // play-ins, spread evenly.
  const groupedNorm = [0, 1, 3, 4].map((p) => p / 4);
  const r1Ids = twelve ? ["pr1", "pr2", "pr3", "pr4"] : six ? ["qf1", "qf2"] : ["qf1", "qf2", "qf3", "qf4"];
  const r1Norm = six ? [0.25, 0.75] : groupedNorm;
  const r1Centers = r1Norm.map((nrm) => centerTop + nrm * span);
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

  const champion: CellBox = { id: "champion", x: colX[qfCol + 3], y: finalCenter - rowH / 2, w: colW, h: rowH };

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
    { text: "CHAMPION", x: colX[qfCol + 3] + colW / 2 },
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
