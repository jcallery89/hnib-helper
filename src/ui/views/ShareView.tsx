import { useMemo, useRef, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Analysis } from "../state/store.ts";
import { ShareCard } from "../../render/share/ShareCard.tsx";
import { SchedulePosterSvg } from "../../render/schedule/SchedulePosterSvg.tsx";
import { EXPORT_SIZES } from "../../render/bracket/theme.ts";
import { exportNodePng } from "../../render/exportImage.ts";
import { useBrandAssets } from "../state/useBrand.ts";
import { parseDaySchedule, posterRowsFor, scheduleDays, dayLabel } from "../../io/importDaySchedule.ts";
import {
  seedingCardContent,
  tiebreakCardContent,
  announcementCardContent,
  playoffPictureCardContent,
  type ShareCardContent,
} from "../../engine/playoff/shareCards.ts";
import { playoffPicture, eliminatedTeamIds } from "../../engine/playoff/scenarios.ts";
import { COLORS } from "../../render/bracket/theme.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
}

type CardType = "seeding" | "picture" | "tiebreakers" | "announcement" | "schedule";

export function ShareView({ dataset, analysis }: Props) {
  const brand = useBrandAssets();
  const [cardType, setCardType] = useState<CardType>("seeding");
  const [sizeKey, setSizeKey] = useState(EXPORT_SIZES[0].key);
  const [busy, setBusy] = useState(false);
  const [annTitle, setAnnTitle] = useState("Elimination Watch");
  const [annBody, setAnnBody] = useState("");
  const [annBullets, setAnnBullets] = useState("");
  const [schedText, setSchedText] = useState("");
  const [schedDay, setSchedDay] = useState("");
  const [schedTitle, setSchedTitle] = useState("Championship Day");
  const exportRef = useRef<HTMLDivElement>(null);
  const size = EXPORT_SIZES.find((s) => s.key === sizeKey) ?? EXPORT_SIZES[0];

  // Day-schedule poster (combines every event in the pasted master schedule).
  const schedRows = useMemo(() => parseDaySchedule(schedText, dataset.event.year), [schedText, dataset.event.year]);
  const days = useMemo(() => scheduleDays(schedRows), [schedRows]);
  const activeDay = (schedDay && days.some((d) => d.date === schedDay) && schedDay) || days[0]?.date || "";
  const posterRows = useMemo(() => (activeDay ? posterRowsFor(schedRows, activeDay) : []), [schedRows, activeDay]);
  const venue = dataset.event.venues?.[0] ?? "";
  const schedSubtitle = activeDay ? `${dayLabel(activeDay)}${venue ? ` · ${venue}` : ""}` : "Paste a schedule below";
  const isSchedule = cardType === "schedule";

  const content: ShareCardContent = useMemo(() => {
    const divisionCount = dataset.divisions.length;
    if (cardType === "tiebreakers") return tiebreakCardContent(dataset.event);
    if (cardType === "announcement") return announcementCardContent(dataset.event, annTitle, annBody, annBullets);
    const colorById = new Map(dataset.teams.map((t) => [t.id, t.colorPrimary]));
    const seeds = (analysis.seeds ?? []).map((s) => ({ seed: s.seed, name: analysis.nameById(s.teamId), color: colorById.get(s.teamId) }));
    if (cardType === "picture") {
      const pic = playoffPicture(dataset.event, dataset.divisions, dataset.teams, dataset.games);
      const elimIds = new Set(eliminatedTeamIds(pic));
      const seedIds = new Set((analysis.seeds ?? []).map((s) => s.teamId));
      const statusById = new Map(pic.statuses.map((s) => [s.teamId, s.state]));
      const eliminated = dataset.teams.filter((t) => elimIds.has(t.id)).map((t) => ({ name: t.name, color: COLORS.red }));
      // Still alive but not currently holding a seed.
      const inHunt = dataset.teams
        .filter((t) => !seedIds.has(t.id) && statusById.get(t.id) === "alive")
        .map((t) => ({ name: t.name, color: t.colorPrimary || "#8a93ab" }));
      return playoffPictureCardContent(dataset.event, seeds, inHunt, eliminated, pic.decided);
    }
    return seedingCardContent(dataset.event, divisionCount, seeds);
  }, [cardType, dataset.event, dataset.divisions, dataset.teams, dataset.games, analysis.seeds, annTitle, annBody, annBullets]);

  async function doExport() {
    if (!exportRef.current) return;
    setBusy(true);
    try {
      const base = isSchedule ? `schedule-${activeDay || "day"}` : `${slug(dataset.event.name)}-${cardType}`;
      await exportNodePng(exportRef.current, size.width, size.height, `${base}-${size.width}x${size.height}.png`);
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
              <option value="picture">Playoff Picture</option>
              <option value="tiebreakers">Tiebreakers</option>
              <option value="announcement">Announcement / Scenario</option>
              <option value="schedule">Day Schedule (all events)</option>
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

        {isSchedule && (
          <div style={{ marginTop: 8 }}>
            <p class="note">
              Paste the master schedule (all events, tab-separated: day, time, rink, game number, home,
              away, event). Both Jr. High and Sophomore rows are combined into one poster, color-coded
              by event. Pick the day to feature.
            </p>
            <div class="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <label class="row">
                Title:
                <input type="text" value={schedTitle} onInput={(e) => setSchedTitle((e.target as HTMLInputElement).value)} />
              </label>
              {days.length > 0 && (
                <label class="row">
                  Day:
                  <select value={activeDay} onChange={(e) => setSchedDay((e.target as HTMLSelectElement).value)}>
                    {days.map((d) => (
                      <option value={d.date} key={d.date}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {activeDay && <span class="note">{posterRows.length} games on this day</span>}
            </div>
            <textarea
              style={{ width: "100%", height: 120 }}
              placeholder={"Mon 6/29\t8:00 AM\tLamacchia\t43\tSoph 2nd\tSoph 7th\tSophomore"}
              value={schedText}
              onInput={(e) => setSchedText((e.target as HTMLTextAreaElement).value)}
            />
          </div>
        )}

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
          {isSchedule ? (
            <SchedulePosterSvg width={size.width} height={size.height} title={schedTitle} subtitle={schedSubtitle} rows={posterRows} brand={brand} />
          ) : (
            <ShareCard width={size.width} height={size.height} content={content} brand={brand} />
          )}
        </div>
      </div>

      {/* Hidden full-size node used for rasterization */}
      <div style={{ position: "absolute", left: -99999, top: 0 }} aria-hidden="true">
        <div ref={exportRef} style={{ width: size.width, height: size.height }}>
          {isSchedule ? (
            <SchedulePosterSvg width={size.width} height={size.height} title={schedTitle} subtitle={schedSubtitle} rows={posterRows} brand={brand} embedFonts />
          ) : (
            <ShareCard width={size.width} height={size.height} content={content} brand={brand} embedFonts />
          )}
        </div>
      </div>
    </section>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
