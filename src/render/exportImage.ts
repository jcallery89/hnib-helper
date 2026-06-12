import { toPng } from "html-to-image";

/**
 * Rasterize an offscreen DOM node (sized to the target preset) to PNG and
 * download it. The node carries its own background via its SVG, so the export
 * is never transparent. Fonts are embedded so Teko / Barlow Condensed render
 * correctly outside the browser. Shared by the bracket and player-card exports.
 */
export async function exportNodePng(
  node: HTMLElement,
  width: number,
  height: number,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(node, {
    width,
    height,
    pixelRatio: 1,
    backgroundColor: "#ffffff",
    cacheBust: true,
  });
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
