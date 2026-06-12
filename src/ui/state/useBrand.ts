import { useEffect, useState } from "preact/hooks";
import { loadBrandAssets, type BrandAssets } from "../../render/brand.ts";

/** Brand assets as data URLs, loaded once and shared. Undefined while loading. */
export function useBrandAssets(): BrandAssets | undefined {
  const [brand, setBrand] = useState<BrandAssets | undefined>(undefined);
  useEffect(() => {
    let active = true;
    loadBrandAssets().then((b) => {
      if (active) setBrand(b);
    });
    return () => {
      active = false;
    };
  }, []);
  return brand;
}
