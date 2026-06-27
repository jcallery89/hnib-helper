import { useMemo, useRef, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Analysis } from "../state/store.ts";
import { ShareCard } from "../../render/share/ShareCard.tsx";
import { EXPORT_SIZES } from "../../render/bracket/theme.ts";
import { exportNodePng } from "../../render/exportImage.ts";
import { useBrandAssets } from "../state/useBrand.ts";
import {
  seedingCardContent,
  tiebreakCardContent,
  announcementCardContent,
  type ShareCardContent,
} from "../../engine/playoff/shareCards.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
}

type CardType = "seeding" | "tiebreakers" | "announcement";

export function ShareView({ dataset, analysis }: Props) {
  const brand = useBrandAssets();
  const [cardType, setCardType] = useState<CardType>("seeding");
  const [sizeKey, setSizeKey] = useState(EXPORT_SIZES[0].key);
  const [busy, setBusy] = useState(false);
  const [annTitle, setAnnTitle] = useState("Elimination Watch");
  const [annBody, setAnnBody] = useState("");
  const [annBullets, setAnnBullets] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const size = EXPORT_SIZES.find((s) => s.key === sizeKey) ?? EXPORT_SIZES[0];

  const content: ShareCardContent = useMemo(() => {
    const divisionCount = dataset.divisions.length;
    if (cardType === "tiebreakers") return tiebreakCardContent(dataset.event);
    if (cardType === "announcement") return announcementCardContent(dataset.event, annTitle, annBody, annBullets);
    const seeds = (analysis.seeds ?? []).map((s) => ({ seed: s.seed, name: analysis.nameById(s.teamId) }));
    return seedingCardContent(dataset.event, divisionCount, seeds);
  }, [cardType, dataset.event, dataset.divisions.length, analysis.seeds, annTitle, annBody, annBullets]);

  async function doExport() {
    if (!exportRef.current) return;
    setBusy(true);
    try {
      await exportNodePng(exportRef.current, size.width, size.height, `${slug(dataset.event.name)}-${cardType}-${size.width}x${size.height}.png`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div class="card">
        <p class="section-title">Share Graphics</p>
        <p class="note">
          On-brand graphics for Instagram. Pick a card, choose a size, and export a PNG. Seeding and
          tiebreakers come straight from the event; the announcement card is free text for quick
          scenario posts.
        </p>
        <div class="toolbar">
          <label class="row">
            Card:
            <select value={cardType} onChange={(e) => setCardType((e.target as HTMLSelectElement).value as CardType)}>
              <option value="seeding">Playoff Seeding</option>
              <option value="tiebreakers">Tiebreakers</option>
              <option value="announcement">Announcement / Scenario</option>
            </select>
          </label>
          <label class="row">
            Size:
            <select value={sizeKey} onChange={(e) => setSizeKey((e.target as HTMLSelectElement).value)}>
              {EXPORT_SIZES.map((s) => (
                <option value={s.key} key={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button class="btn primary" disabled={busy} onClick={doExport}>
            {busy ? "Rendering..." : "Export PNG"}
          </button>
        </div>

        {cardType === "announcement" && (
          <div class="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            <label style={{ flex: 1, minWidth: 240 }}>
              <span class="note">Headline</span>
              <input type="text" style={{ width: "100%" }} value={annTitle} onInput={(e) => setAnnTitle((e.target as HTMLInputElement).value)} />
            </label>
            <label style={{ flex: 1, minWidth: 240 }}>
              <span class="note">Body (one paragraph per line)</span>
              <textarea
                style={{ width: "100%", height: 70 }}
                placeholder="Northern NE controls its own fate entering the final round."
                value={annBody}
                onInput={(e) => setAnnBody((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            <label style={{ flex: 1, minWidth: 240 }}>
              <span class="note">Bullets (one per line)</span>
              <textarea
                style={{ width: "100%", height: 70 }}
                placeholder={"Clinches with a win or tie\nEliminated with a regulation loss by 4 or more"}
                value={annBullets}
                onInput={(e) => setAnnBullets((e.target as HTMLTextAreaElement).value)}
              />
            </label>
          </div>
        )}
      </div>

      <div class="card">
        {/* Live preview - the SVG viewBox scales to the container. */}
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <ShareCard width={size.width} height={size.height} content={content} brand={brand} />
        </div>
      </div>

      {/* Hidden full-size node used for rasterization */}
      <div style={{ position: "absolute", left: -99999, top: 0 }} aria-hidden="true">
        <div ref={exportRef} style={{ width: size.width, height: size.height }}>
          <ShareCard width={size.width} height={size.height} content={content} brand={brand} />
        </div>
      </div>
    </section>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
