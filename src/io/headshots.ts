// Same-origin headshot lookup.
//
// Tourno stores player photos in a public GCS bucket
// (storage.googleapis.com/tourno-39a2a.appspot.com/players/profile/{playerId}.jpg)
// but that bucket sends no CORS headers, so the browser cannot inline those
// images into PNG exports. Instead the photos are re-hosted next to the
// deployed app in headshots/{playerId}.jpg and indexed by
// headshots/manifest.js, which index.html loads before the bundle (it defines
// window.HNIB_HEADSHOTS). scripts/fetch_headshots.py rebuilds the folder.
// A missing manifest just means every player falls back to initials.
declare global {
  interface Window {
    HNIB_HEADSHOTS?: Record<string, string>;
  }
}

export function headshotFor(playerId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.HNIB_HEADSHOTS?.[playerId];
}
