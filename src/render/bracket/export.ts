import { toPng } from "html-to-image";

/**
 * Rasterize a bracket DOM node (an offscreen container sized to the target
 * preset) to PNG and download it. The node already carries the navy background
 * via its SVG, so the export is never transparent. Fonts are embedded so Teko /
 * Barlow Condensed render correctly outside the browser.
 */
export async function exportBracketPng(
  node: HTMLElement,
  width: number,
  height: number,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(node, {
    width,
    height,
    pixelRatio: 1,
    backgroundColor: "#111e3f",
    cacheBust: true,
  });
  // Convert data URL to a blob download for consistent behaviour across browsers.
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
