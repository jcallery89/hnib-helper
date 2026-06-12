// Brand assets from the HNIB tournament asset pack, bundled with the app.
//
// For the SVG exports (bracket, player cards) the images are converted to data
// URLs once and cached, so the rasterized PNG always embeds the artwork
// regardless of how the exporter resolves external references. The raw bundled
// URLs are also exported for plain <img> use in the UI chrome.

import logoWhiteUrl from "../assets/brand/logo_white_transparent.png";
import cardHeaderUrl from "../assets/brand/cardheader_1080x60.png";
import cardFooterUrl from "../assets/brand/cardfooter_1080x60.png";
import bgSquareUrl from "../assets/brand/bg_square_1080x1080.png";
import bgStoryUrl from "../assets/brand/bg_story_1080x1920.png";

export interface BrandAssets {
  logoWhite?: string;
  cardHeader?: string;
  cardFooter?: string;
  bgSquare?: string;
  bgStory?: string;
}

/** Raw bundled asset URLs for normal <img> tags in the UI. */
export const brandUrls = {
  logoWhite: logoWhiteUrl,
};

/** White shield logo aspect ratio (1024 x 720), for sizing <image> boxes. */
export const LOGO_ASPECT = 1024 / 720;

const SOURCES: Record<keyof BrandAssets, string> = {
  logoWhite: logoWhiteUrl,
  cardHeader: cardHeaderUrl,
  cardFooter: cardFooterUrl,
  bgSquare: bgSquareUrl,
  bgStory: bgStoryUrl,
};

let cache: Promise<BrandAssets> | null = null;

/** Load all brand assets as data URLs (cached). Missing files degrade silently. */
export function loadBrandAssets(): Promise<BrandAssets> {
  if (!cache) {
    cache = (async () => {
      const out: BrandAssets = {};
      await Promise.all(
        (Object.keys(SOURCES) as Array<keyof BrandAssets>).map(async (key) => {
          const dataUrl = await toDataUrl(SOURCES[key]);
          if (dataUrl) out[key] = dataUrl;
        }),
      );
      return out;
    })();
  }
  return cache;
}

/** Pick the background that best matches the export aspect ratio. */
export function bgForSize(brand: BrandAssets | undefined, width: number, height: number): string | undefined {
  if (!brand) return undefined;
  return height / width >= 1.5 ? brand.bgStory ?? brand.bgSquare : brand.bgSquare;
}

async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}
