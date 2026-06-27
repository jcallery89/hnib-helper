import type { JSX } from "preact";
import type { ShareCardContent } from "../../engine/playoff/shareCards.ts";
import { COLORS, FONTS } from "../bracket/theme.ts";
import { LOGO_ASPECT, type BrandAssets } from "../brand.ts";

interface Props {
  width: number;
  height: number;
  content: ShareCardContent;
  brand?: BrandAssets;
}

/**
 * On-brand shareable graphic (kicker, big title, intro paragraphs, a numbered
 * or bulleted list, footnote) rendered as one SVG, matching the player card and
 * bracket styling. Laid out with a running vertical cursor so a variable number
 * of items and wrapped lines stack without overlapping. Same node feeds the live
 * preview and the PNG export.
 */
export function ShareCard({ width, height, content, brand }: Props) {
  const pad = Math.round(width * 0.075);
  const innerW = width - pad * 2;
  const stripH = brand?.cardHeader ? Math.round((width * 60) / 1080) : 0;
  const footerStripH = brand?.cardFooter ? Math.round((width * 60) / 1080) : 0;

  // Type scale (relative to height so all three export sizes look consistent).
  const kickerFont = Math.round(height * 0.019);
  const titleFont = Math.round(height * 0.058);
  const introFont = Math.round(height * 0.023);
  const itemFont = Math.round(height * 0.0225);
  const footFont = Math.round(height * 0.016);

  const introLineH = Math.round(introFont * 1.32);
  const itemLineH = Math.round(itemFont * 1.3);
  const badgeR = Math.round(itemFont * 0.92);
  const itemTextX = pad + badgeR * 2 + Math.round(width * 0.02);
  const itemTextW = width - pad - itemTextX;

  const els: JSX.Element[] = [];
  let key = 0;
  let y = stripH + Math.round(height * 0.06); // running baseline cursor

  // Kicker
  els.push(
    <text key={key++} x={pad} y={y} fill={COLORS.royal} font-family={FONTS.body} font-size={kickerFont} font-weight={700} letter-spacing="0.18em">
      {content.kicker.toUpperCase()}
    </text>,
  );
  y += Math.round(height * 0.012);

  // Title (wraps if long)
  const titleLines = wrap(content.title.toUpperCase(), Math.floor(innerW / (titleFont * 0.5)));
  for (const ln of titleLines) {
    y += titleFont;
    els.push(
      <text key={key++} x={pad} y={y} fill={COLORS.navy} font-family={FONTS.head} font-size={titleFont} font-weight={600} letter-spacing="0.01em">
        {ln}
      </text>,
    );
    y += Math.round(titleFont * 0.12);
  }

  // Accent rule under the title
  y += Math.round(height * 0.012);
  els.push(<rect key={key++} x={pad} y={y} width={Math.round(width * 0.16)} height={Math.round(height * 0.006)} fill={COLORS.royal} />);
  y += Math.round(height * 0.03);

  // Intro paragraphs
  const introMax = Math.floor(innerW / (introFont * 0.47));
  for (const para of content.intro) {
    for (const ln of wrap(para, introMax)) {
      y += introFont;
      els.push(
        <text key={key++} x={pad} y={y} fill={COLORS.textDim} font-family={FONTS.body} font-size={introFont} font-weight={500}>
          {ln}
        </text>,
      );
      y += introLineH - introFont;
    }
    y += Math.round(introFont * 0.4);
  }

  // Items (numbered/bulleted)
  y += Math.round(height * 0.015);
  const itemMax = Math.floor(itemTextW / (itemFont * 0.47));
  for (const item of content.items) {
    const lines = wrap(item.text, itemMax);
    const firstBaseline = y + itemFont;
    const cy = firstBaseline - Math.round(itemFont * 0.36);
    if (item.badge) {
      els.push(<circle key={key++} cx={pad + badgeR} cy={cy} r={badgeR} fill={COLORS.navy} />);
      els.push(
        <text key={key++} x={pad + badgeR} y={cy + badgeR * 0.36} fill={COLORS.white} font-family={FONTS.head} font-size={Math.round(badgeR * 1.15)} font-weight={600} text-anchor="middle">
          {item.badge}
        </text>,
      );
    } else {
      els.push(<circle key={key++} cx={pad + badgeR} cy={cy} r={Math.round(badgeR * 0.32)} fill={COLORS.royal} />);
    }
    lines.forEach((ln, i) => {
      els.push(
        <text key={key++} x={itemTextX} y={firstBaseline + i * itemLineH} fill={COLORS.navy} font-family={FONTS.body} font-size={itemFont} font-weight={i === 0 ? 600 : 500}>
          {ln}
        </text>,
      );
    });
    y = firstBaseline + (lines.length - 1) * itemLineH + Math.round(itemFont * 0.85);
  }

  // Footnote, pinned just above the footer strip
  const footerTop = height - (footerStripH || Math.round(height * 0.05));
  if (content.footnote) {
    for (const ln of wrap(content.footnote, Math.floor(innerW / (footFont * 0.47))).slice(0, 2).reverse()) {
      els.push(
        <text key={key++} x={pad} y={footerTop - Math.round(height * 0.028)} fill={COLORS.textDim} font-family={FONTS.body} font-size={footFont} font-weight={500} font-style="italic">
          {ln}
        </text>,
      );
    }
  }

  // Watermark, bottom-right above the footer
  const wmW = Math.round(width * 0.5);
  const wmH = Math.round(wmW / LOGO_ASPECT);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={height} fill={COLORS.card} />
      {brand?.watermarkNavy && (
        <image
          href={brand.watermarkNavy}
          x={width - wmW + Math.round(width * 0.07)}
          y={footerTop - wmH + Math.round(height * 0.05)}
          width={wmW}
          height={wmH}
          preserveAspectRatio="xMaxYMax meet"
          opacity={0.9}
        />
      )}
      <defs>
        <linearGradient id="sigbar-share" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2856" />
          <stop offset="30%" stopColor="#2e4a8a" />
          <stop offset="70%" stopColor="#a8cce0" />
          <stop offset="100%" stopColor="#dae8f3" />
        </linearGradient>
      </defs>
      {brand?.cardHeader ? (
        <>
          <image href={brand.cardHeader} x={0} y={0} width={width} height={stripH} preserveAspectRatio="none" />
          <rect x={0} y={stripH} width={width} height={3} fill="url(#sigbar-share)" />
        </>
      ) : (
        <rect x={0} y={0} width={width} height={4} fill="url(#sigbar-share)" />
      )}
      {brand?.cardFooter && (
        <image href={brand.cardFooter} x={0} y={height - footerStripH} width={width} height={footerStripH} preserveAspectRatio="none" />
      )}

      {els}

      <text
        x={pad}
        y={footerStripH ? height - footerStripH * 0.38 : height - Math.round(height * 0.02)}
        fill={footerStripH ? COLORS.gold : COLORS.royal}
        font-family={FONTS.body}
        font-size={footFont * 1.05}
        font-weight={700}
        letter-spacing="0.08em"
      >
        GET SEEN. GET RECRUITED.
      </text>
      <text
        x={width - pad}
        y={footerStripH ? height - footerStripH * 0.38 : height - Math.round(height * 0.02)}
        fill={footerStripH ? COLORS.white : COLORS.textDim}
        font-family={FONTS.body}
        font-size={footFont}
        letter-spacing="0.08em"
        text-anchor="end"
      >
        @hockey.night - PlayHNIB.com
      </text>
    </svg>
  );
}

// Greedy word wrap to a max character count per line.
function wrap(text: string, maxChars: number): string[] {
  if (maxChars < 6) maxChars = 6;
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current === "") current = word;
    else if (current.length + 1 + word.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
