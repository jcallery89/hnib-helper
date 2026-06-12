// Light theme matched to the HNIB mobile app (Axe Sports): white surfaces on a
// pale blue-gray page, royal blue accents, deep navy text, status pills.
// Adopted June 2026 per JC, replacing the dark website theme for this tool.
// The navy/royal values are the asset pack's own (navy 28/38/96, royal
// 52/78/170, ice line 214/232/250).
export const COLORS = {
  navy: "#1c2660", // primary text, header bars, big numerals
  royal: "#344eaa", // accents, section labels, links
  bg: "#eef1f7", // page background
  card: "#ffffff", // card / cell surfaces
  line: "#dde3f0", // borders and dividers
  zebra: "#f3f6fb", // alternating table rows
  textDim: "#6b7798", // secondary text
  gold: "#d4a843", // champion / winner accents only
  red: "#d6453d", // in progress / eliminated
  green: "#1da95c", // advancing / final
  white: "#ffffff",
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
