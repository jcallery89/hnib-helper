// Brand tokens as JS constants for the SVG bracket. Solid fills are used (not
// rgba surfaces) so the rasterized PNG stays crisp and predictable.
export const COLORS = {
  navyDeep: "#111e3f",
  surface: "#1e2e56",
  border: "#263a66",
  gold: "#d4a843",
  ice: "#a8cce0",
  icePale: "#dae8f3",
  green: "#3ddc84",
  red: "#e05252",
  white: "#ffffff",
  textPrimary: "#c0cfe0",
  textDim: "#7a8daa",
};

export const FONTS = {
  head: "'Teko', sans-serif",
  body: "'Barlow Condensed', sans-serif",
};

export interface ExportSize {
  key: string;
  label: string;
  width: number;
  height: number;
}

export const EXPORT_SIZES: ExportSize[] = [
  { key: "portrait", label: "Portrait 1080x1350", width: 1080, height: 1350 },
  { key: "story", label: "Story 1080x1920", width: 1080, height: 1920 },
  { key: "square", label: "Square 1080x1080", width: 1080, height: 1080 },
];
