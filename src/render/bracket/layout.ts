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
  const margin = Math.round(width * 0.045);
  const headerY = Math.round(height * 0.04);
  const labelY = Math.round(height * 0.13);
  const contentTop = Math.round(height * 0.17);
  const footerY = height - Math.round(height * 0.04);
  const contentBottom = footerY - Math.round(height * 0.03);

  // Four columns: QF, SF, FINAL, CHAMPION.
  const usableW = width - margin * 2;
  const colGap = Math.round(usableW * 0.05);
  const colW = Math.round((usableW - colGap * 3) / 4);
  const colX = [0, 1, 2, 3].map((i) => margin + i * (colW + colGap));

  // The cells own most of the vertical band; gaps stay smaller than a cell so
  // the bracket reads as boxes-with-breathing-room rather than dots in a void
  // (the old 0.052 row factor left cramped rows separated by huge gaps). The
  // pair that feeds one semifinal stays tighter than the gap between pairs.
  const band = contentBottom - contentTop;
  const rowH = Math.max(28, Math.round(band * (six ? 0.1 : 0.085)));
  const cellH = rowH * 2;

  const cells: CellBox[] = [];
  const connectors: Connector[] = [];

  const qfIds = six ? ["qf1", "qf2"] : ["qf1", "qf2", "qf3", "qf4"];
  let qfCenters: number[];
  if (six) {
    qfCenters = [0.27, 0.73].map((nrm) => contentTop + nrm * band);
  } else {
    const intraGap = Math.round(band * 0.08); // between QFs of one pair
    const interGap = Math.round(band * 0.15); // between the two pairs
    const total = cellH * 4 + intraGap * 2 + interGap;
    const top = contentTop + Math.max(0, Math.round((band - total) / 2));
    const c1 = top + cellH / 2;
    const c2 = c1 + cellH + intraGap;
    const c3 = c2 + cellH + interGap;
    const c4 = c3 + cellH + intraGap;
    qfCenters = [c1, c2, c3, c4];
  }
  qfIds.forEach((id, i) => {
    cells.push({ id, x: colX[0], y: qfCenters[i] - cellH / 2, w: colW, h: cellH });
  });

  // Semifinals. In a 6-team field each semi aligns with its play-in game (the bye
  // seed shares the cell); in an 8-team field a semi sits between two QFs.
  const sf1Center = six ? qfCenters[0] : (qfCenters[0] + qfCenters[1]) / 2;
  const sf2Center = six ? qfCenters[1] : (qfCenters[2] + qfCenters[3]) / 2;
  cells.push({ id: "sf1", x: colX[1], y: sf1Center - cellH / 2, w: colW, h: cellH });
  cells.push({ id: "sf2", x: colX[1], y: sf2Center - cellH / 2, w: colW, h: cellH });

  const finalCenter = (sf1Center + sf2Center) / 2;
  cells.push({ id: "final", x: colX[2], y: finalCenter - cellH / 2, w: colW, h: cellH });

  const championH = Math.round(rowH * 1.3);
  const champion: CellBox = { id: "champion", x: colX[3], y: finalCenter - championH / 2, w: colW, h: championH };

  const byId = new Map(cells.map((c) => [c.id, c]));
  connectors.push(connect(byId.get("qf1")!, byId.get("sf1")!));
  connectors.push(connect(byId.get("qf2")!, byId.get(six ? "sf2" : "sf1")!));
  if (!six) {
    connectors.push(connect(byId.get("qf3")!, byId.get("sf2")!));
    connectors.push(connect(byId.get("qf4")!, byId.get("sf2")!));
  }
  connectors.push(connect(byId.get("sf1")!, byId.get("final")!));
  connectors.push(connect(byId.get("sf2")!, byId.get("final")!));
  connectors.push(connect(byId.get("final")!, champion));

  const columns: ColumnLabel[] = [
    { text: six ? "PLAY-IN" : "QUARTERFINALS", x: colX[0] + colW / 2 },
    { text: "SEMIFINALS", x: colX[1] + colW / 2 },
    { text: "FINAL", x: colX[2] + colW / 2 },
    { text: "CHAMPION", x: colX[3] + colW / 2 },
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
