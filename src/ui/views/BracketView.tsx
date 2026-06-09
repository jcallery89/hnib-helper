import { useRef, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Analysis } from "../state/store.ts";
import { buildBracket, type BracketResult } from "../../engine/playoff/bracket.ts";
import type { BracketGame, DecidedBy } from "../../engine/types.ts";
import { BracketSvg } from "../../render/bracket/BracketSvg.tsx";
import { EXPORT_SIZES } from "../../render/bracket/theme.ts";
import { exportBracketPng } from "../../render/bracket/export.ts";

interface Props {
  dataset: Dataset;
  analysis: Analysis;
  update: (mutate: (draft: Dataset) => void) => void;
}

export function BracketView({ dataset, analysis, update }: Props) {
  const [sizeKey, setSizeKey] = useState(EXPORT_SIZES[0].key);
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const size = EXPORT_SIZES.find((s) => s.key === sizeKey) ?? EXPORT_SIZES[0];

  if (!dataset.event.hasPlayoffBracket) {
    return (
      <section>
        <div class="card">
          <p class="section-title">No Playoff Bracket</p>
          <p class="note">
            This event runs schedules and standings without a champion. Enable a playoff bracket in
            Setup to seed and render one.
          </p>
        </div>
      </section>
    );
  }

  const results = new Map<string, BracketResult>(Object.entries(dataset.bracketResults ?? {}));
  const bracket = buildBracket(analysis.seeds, results);
  const title = `${dataset.event.name} - Playoffs`;

  function setResult(gameId: string, patch: Partial<BracketResult>) {
    update((draft) => {
      const current = draft.bracketResults ?? {};
      const existing = current[gameId] ?? { highScore: null, lowScore: null, decidedBy: null };
      draft.bracketResults = { ...current, [gameId]: { ...existing, ...patch } };
    });
  }

  async function doExport() {
    if (!exportRef.current) return;
    setBusy(true);
    try {
      await exportBracketPng(
        exportRef.current,
        size.width,
        size.height,
        `${slug(dataset.event.name)}-bracket-${size.width}x${size.height}.png`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div class="card">
        <p class="section-title">Playoff Bracket</p>
        <div class="toolbar">
          <select value={sizeKey} onChange={(e) => setSizeKey((e.target as HTMLSelectElement).value)}>
            {EXPORT_SIZES.map((s) => (
              <option value={s.key} key={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button class="btn primary" disabled={busy} onClick={doExport}>
            {busy ? "Rendering..." : "Export PNG"}
          </button>
        </div>
        <div class="bracket-preview" style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Live preview - the SVG viewBox scales it to the container width. */}
          <BracketSvg
            width={size.width}
            height={size.height}
            title={title}
            bracket={bracket}
            nameById={analysis.nameById}
          />
        </div>
      </div>

      <div class="card">
        <p class="section-title">Playoff Results</p>
        <p class="note">
          Enter scores to advance teams. Preliminary, quarterfinal, and semifinal ties are decided by
          shootout; the final adds a 3-on-3 overtime first. Pick the winner when a game is tied.
        </p>
        <PlayoffEntry bracket={bracket} results={results} nameById={analysis.nameById} setResult={setResult} />
      </div>

      {/* Hidden full-size node used for rasterization */}
      <div style={{ position: "absolute", left: -99999, top: 0 }} aria-hidden="true">
        <div ref={exportRef} style={{ width: size.width, height: size.height }}>
          <BracketSvg
            width={size.width}
            height={size.height}
            title={title}
            bracket={bracket}
            nameById={analysis.nameById}
          />
        </div>
      </div>
    </section>
  );
}

function PlayoffEntry({
  bracket,
  results,
  nameById,
  setResult,
}: {
  bracket: BracketGame[];
  results: Map<string, BracketResult>;
  nameById: (id: string) => string;
  setResult: (gameId: string, patch: Partial<BracketResult>) => void;
}) {
  const playable = bracket.filter((g) => g.highTeamId && g.lowTeamId);
  if (playable.length === 0) return <p class="note">Seed the field first by entering round-robin results.</p>;

  return (
    <table class="grid">
      <thead>
        <tr>
          <th>Game</th>
          <th>Matchup</th>
          <th class="num">Score</th>
          <th>Decided By</th>
          <th>Winner</th>
        </tr>
      </thead>
      <tbody>
        {playable.map((g) => {
          const r = results.get(g.id) ?? { highScore: null, lowScore: null, decidedBy: null };
          const tied = r.highScore !== null && r.lowScore !== null && r.highScore === r.lowScore;
          return (
            <tr key={g.id}>
              <td>{roundLabel(g.round)}</td>
              <td>
                {nameById(g.highTeamId as string)} vs {nameById(g.lowTeamId as string)}
              </td>
              <td class="num">
                <input
                  class="score-input"
                  type="number"
                  min={0}
                  value={r.highScore ?? ""}
                  onInput={(e) => setResult(g.id, { highScore: numOrNull((e.target as HTMLInputElement).value) })}
                />
                <input
                  class="score-input"
                  type="number"
                  min={0}
                  value={r.lowScore ?? ""}
                  onInput={(e) => setResult(g.id, { lowScore: numOrNull((e.target as HTMLInputElement).value) })}
                />
              </td>
              <td>
                <select
                  value={r.decidedBy ?? "regulation"}
                  onChange={(e) => setResult(g.id, { decidedBy: (e.target as HTMLSelectElement).value as DecidedBy })}
                >
                  <option value="regulation">Regulation</option>
                  {g.round === "final" && <option value="ot">Overtime</option>}
                  <option value="shootout">Shootout</option>
                </select>
              </td>
              <td>
                {tied ? (
                  <select
                    value={r.winner ?? ""}
                    onChange={(e) => setResult(g.id, { winner: ((e.target as HTMLSelectElement).value || undefined) as "high" | "low" | undefined })}
                  >
                    <option value="">-</option>
                    <option value="high">{nameById(g.highTeamId as string)}</option>
                    <option value="low">{nameById(g.lowTeamId as string)}</option>
                  </select>
                ) : (
                  <span class="note">{g.winnerTeamId ? nameById(g.winnerTeamId) : "-"}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function roundLabel(round: BracketGame["round"]): string {
  return { prelim: "Prelim", qf: "Quarterfinal", sf: "Semifinal", final: "Final" }[round];
}

function numOrNull(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
