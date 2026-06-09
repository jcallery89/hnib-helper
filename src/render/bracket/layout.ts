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

const QF_IDS = ["qf1", "qf2", "qf3", "qf4"];

export function computeLayout(width: number, height: number): BracketLayout {
  const margin = Math.round(width * 0.045);
  const headerY = Math.round(height * 0.04);
  const labelY = Math.round(height * 0.13);
  const contentTop = Math.round(height * 0.17);
  const footerY = height - Math.round(height * 0.04);
  const contentBottom = footerY - Math.round(height * 0.03);

  // Four columns: QF, SF, FINAL, CHAMPION.
  const usableW = width - margin * 2;
  const colGap = Math.round(usableW * 0.04);
  const colW = Math.round((usableW - colGap * 3) / 4);
  const colX = [0, 1, 2, 3].map((i) => margin + i * (colW + colGap));

  const rowH = Math.max(28, Math.round((contentBottom - contentTop) * 0.05));
  const cellH = rowH * 2;

  const availH = contentBottom - contentTop;
  const qfCenters = [0, 1, 2, 3].map((i) => contentTop + ((i + 0.5) * availH) / 4);

  const cells: CellBox[] = [];
  QF_IDS.forEach((id, i) => {
    cells.push({ id, x: colX[0], y: qfCenters[i] - cellH / 2, w: colW, h: cellH });
  });

  const sf1Center = (qfCenters[0] + qfCenters[1]) / 2;
  const sf2Center = (qfCenters[2] + qfCenters[3]) / 2;
  cells.push({ id: "sf1", x: colX[1], y: sf1Center - cellH / 2, w: colW, h: cellH });
  cells.push({ id: "sf2", x: colX[1], y: sf2Center - cellH / 2, w: colW, h: cellH });

  const finalCenter = (sf1Center + sf2Center) / 2;
  cells.push({ id: "final", x: colX[2], y: finalCenter - cellH / 2, w: colW, h: cellH });

  const champion: CellBox = {
    id: "champion",
    x: colX[3],
    y: finalCenter - rowH / 2,
    w: colW,
    h: rowH,
  };

  const byId = new Map(cells.map((c) => [c.id, c]));
  const connectors: Connector[] = [
    connect(byId.get("qf1")!, byId.get("sf1")!),
    connect(byId.get("qf2")!, byId.get("sf1")!),
    connect(byId.get("qf3")!, byId.get("sf2")!),
    connect(byId.get("qf4")!, byId.get("sf2")!),
    connect(byId.get("sf1")!, byId.get("final")!),
    connect(byId.get("sf2")!, byId.get("final")!),
    connect(byId.get("final")!, champion),
  ];

  const columns: ColumnLabel[] = [
    { text: "QUARTERFINALS", x: colX[0] + colW / 2 },
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
