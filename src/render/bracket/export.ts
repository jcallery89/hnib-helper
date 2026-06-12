import { exportNodePng } from "../exportImage.ts";

/** Rasterize a bracket node to PNG and download it. See exportNodePng. */
export function exportBracketPng(
  node: HTMLElement,
  width: number,
  height: number,
  filename: string,
): Promise<void> {
  return exportNodePng(node, width, height, filename);
}
