// The self-hosted @font-face CSS (Teko + Barlow Condensed as data URLs) as a raw
// string, so it can be inlined into an <svg> via a <style> element. A rasterized
// SVG is rendered in an isolated context that cannot see the page's fonts, so the
// font must live inside the SVG for PNG exports to keep it.
import fontFaceCss from "../styles/fonts.css?raw";

export const FONT_FACE_CSS = fontFaceCss;
