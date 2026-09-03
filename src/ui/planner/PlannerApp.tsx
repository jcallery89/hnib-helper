import { useMemo, useRef, useState } from "preact/hooks";
import {
  PROFILES,
  PROFILE_ORDER,
  comparisonRows,
  describeGuarantee,
  fmtTime,
  newScenario,
  planScenario,
  scheduleCsv,
  summaryText,
  teamName,
} from "../../engine/planner/index.ts";
import type {
  CostInputs,
  EventStructure,
  FormatPlan,
  PlanResult,
  PlannerProfileKey,
  PricingInputs,
  Scenario,
} from "../../engine/planner/types.ts";
import { kindLabel } from "../../engine/planner/text.ts";
import { parseScenarioFile, serializeScenarios } from "../../io/plannerStore.ts";
import type { DerivedStructure } from "../../io/plannerFromEvent.ts";
import "./planner.css";

// The planner screen, shared by the app's Planner tab and the standalone file.
// All numbers come from planScenario(); this file only lays them out.

export interface EventSource {
  id: string;
  name: string;
  year: number;
}

export interface PlannerAppProps {
  initial: Scenario[];
  /** Called after every edit (the app persists; the standalone file ignores it). */
  onChange?: (scenarios: Scenario[]) => void;
  /** Past events the structure can be seeded from (app only). */
  eventSources?: EventSource[];
  deriveFromEvent?: (id: string) => DerivedStructure | null;
  /** Show the masthead (standalone file). The app already has its own header. */
  masthead?: boolean;
  logoUrl?: string;
  /**
   * Hosted viewers that block file downloads: show the CSV and JSON in a
   * text box (and copy it to the clipboard) instead of saving a file.
   */
  inlineExports?: boolean;
}

const usd = (n: number, decimals = 0) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function PlannerApp({ initial, onChange, eventSources, deriveFromEvent, masthead, logoUrl, inlineExports }: PlannerAppProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>(initial.length ? initial : [newScenario("satellite")]);
  const [activeId, setActiveId] = useState<string>(scenarios[0].id);
  const [status, setStatus] = useState("");
  const [eventNotes, setEventNotes] = useState<string[]>([]);
  const [eventPick, setEventPick] = useState(eventSources?.[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => scenarios.map(planScenario), [scenarios]);
  const activeIndex = Math.max(
    0,
    scenarios.findIndex((s) => s.id === activeId),
  );
  const active = scenarios[activeIndex];
  const result = results[activeIndex];

  function commit(next: Scenario[]) {
    setScenarios(next);
    onChange?.(next);
  }

  function edit(mutate: (s: Scenario) => void) {
    commit(
      scenarios.map((s) => {
        if (s.id !== active.id) return s;
        const copy: Scenario = {
          ...s,
          structure: { ...s.structure, dayLabels: [...s.structure.dayLabels] },
          costs: { ...s.costs },
          pricing: { ...s.pricing },
        };
        mutate(copy);
        return copy;
      }),
    );
  }

  function add(profile: PlannerProfileKey) {
    const s = newScenario(profile, `${PROFILES[profile].label} ${scenarios.length + 1}`);
    commit([...scenarios, s]);
    setActiveId(s.id);
  }

  function duplicate() {
    const copy = structuredClone(active);
    copy.id = `s${Date.now().toString(36)}d`;
    copy.name = `${active.name} (copy)`;
    commit([...scenarios.slice(0, activeIndex + 1), copy, ...scenarios.slice(activeIndex + 1)]);
    setActiveId(copy.id);
  }

  function remove() {
    if (scenarios.length <= 1) return;
    const next = scenarios.filter((s) => s.id !== active.id);
    commit(next);
    setActiveId(next[Math.max(0, activeIndex - 1)].id);
  }

  function resetToProfile() {
    const fresh = newScenario(active.profile, active.name, active.id);
    commit(scenarios.map((s) => (s.id === active.id ? fresh : s)));
  }

  function applyPlan(alt: FormatPlan) {
    edit((s) => {
      s.structure.teams = alt.teams;
      s.structure.gamesPerTeam = Math.max(...alt.guaranteed);
      s.structure.format = alt.kind;
      s.structure.fixedRounds = alt.equal ? null : (alt.rounds ?? null);
    });
  }

  function loadEvent() {
    if (!deriveFromEvent || !eventPick) return;
    const derived = deriveFromEvent(eventPick);
    if (!derived) {
      setEventNotes(["Could not load that event."]);
      return;
    }
    edit((s) => {
      Object.assign(s.structure, derived.structure);
      s.structure.fixedRounds = null;
      s.structure.format = "auto";
    });
    setEventNotes(derived.notes);
  }

  async function copySummary() {
    const text = summaryText(results);
    const ok = await copyText(text);
    setStatus(ok ? "Summary copied to the clipboard." : "Could not access the clipboard; the summary is in the box below.");
    if (!ok) setFallbackText(text);
  }
  const [fallbackText, setFallbackText] = useState("");

  async function showExchange(text: string, what: string) {
    setFallbackText(text);
    const ok = await copyText(text);
    setStatus(ok ? `${what} copied to the clipboard and shown below.` : `${what} is shown below; select it and copy.`);
  }

  function downloadCsv() {
    const csv = scheduleCsv(result);
    if (inlineExports) {
      void showExchange(csv, "Schedule CSV");
      return;
    }
    download(`${slug(active.name)}-schedule.csv`, csv, "text/csv");
  }

  function saveJson() {
    const json = serializeScenarios(scenarios);
    if (inlineExports) {
      void showExchange(json, "Scenarios JSON");
      return;
    }
    download("hnib-planner-scenarios.json", json, "application/json");
    setStatus("Scenario file saved.");
  }

  function loadJsonText(text: string, source: string) {
    try {
      const list = parseScenarioFile(text);
      commit(list);
      setActiveId(list[0].id);
      setStatus(`Loaded ${list.length} scenario${list.length === 1 ? "" : "s"} from ${source}.`);
      setFallbackText("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  function loadJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => loadJsonText(String(reader.result), file.name);
    reader.readAsText(file);
  }

  return (
    <div class="pl pl-page">
      {masthead && (
        <header class="pl-masthead">
          {logoUrl && <img src={logoUrl} alt="HNIB" />}
          <div>
            <h1>HNIB Event Planner</h1>
            <div class="pl-tag">Schedule, P&amp;L, and family value for satellite and Massachusetts events</div>
          </div>
        </header>
      )}
      <div class="pl-wrap">
        <div class="pl-scenarios">
          {scenarios.map((s) => (
            <button key={s.id} class={`pl-chip ${s.id === active.id ? "active" : ""}`} onClick={() => setActiveId(s.id)}>
              {s.name}
            </button>
          ))}
          <span class="pl-sep" />
          {PROFILE_ORDER.map((p) => (
            <button key={p} class="pl-btn quiet" onClick={() => add(p)} title={PROFILES[p].description}>
              + {PROFILES[p].label}
            </button>
          ))}
          <button class="pl-btn quiet" onClick={duplicate}>
            Duplicate
          </button>
          <button class="pl-btn quiet" onClick={remove} disabled={scenarios.length <= 1}>
            Delete
          </button>
        </div>

        <div class="pl-toolbar">
          <button class="pl-btn primary" onClick={copySummary}>
            Copy summary
          </button>
          <button class="pl-btn" onClick={downloadCsv}>
            {inlineExports ? "Show schedule CSV" : "Download schedule CSV"}
          </button>
          <button class="pl-btn" onClick={() => window.print()}>
            Print
          </button>
          <button class="pl-btn" onClick={saveJson}>
            {inlineExports ? "Show scenarios JSON" : "Save scenarios (JSON)"}
          </button>
          <button class="pl-btn" onClick={() => fileRef.current?.click()}>
            Load scenarios (JSON)
          </button>
          <input
            ref={fileRef}
            class="pl-hidden-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = (e.currentTarget as HTMLInputElement).files?.[0];
              if (f) loadJson(f);
              (e.currentTarget as HTMLInputElement).value = "";
            }}
          />
          {status && <span class="pl-status">{status}</span>}
        </div>
        {fallbackText && (
          <div class="pl-card pl-noprint">
            <textarea
              style={{ width: "100%", height: 160, fontFamily: "monospace", fontSize: 12 }}
              value={fallbackText}
              onInput={(e) => setFallbackText((e.currentTarget as HTMLTextAreaElement).value)}
              aria-label="Export text"
            />
            <div class="pl-toolbar" style={{ marginTop: 6, marginBottom: 0 }}>
              <button class="pl-btn" onClick={() => void copyText(fallbackText).then((ok) => setStatus(ok ? "Copied to the clipboard." : "Could not copy; select the text and copy it."))}>
                Copy
              </button>
              <button class="pl-btn" onClick={() => loadJsonText(fallbackText, "the pasted text")}>
                Load as scenarios JSON
              </button>
              <button class="pl-btn quiet" onClick={() => setFallbackText("")}>
                Close
              </button>
            </div>
          </div>
        )}

        <div class="pl-layout">
          <aside class="pl-inputs">
            <div class="pl-card">
              <input
                class="pl-name"
                value={active.name}
                onInput={(e) => edit((s) => (s.name = (e.currentTarget as HTMLInputElement).value))}
                aria-label="Scenario name"
              />
              <p class="pl-note" style={{ margin: "6px 0 0" }}>
                {PROFILES[active.profile].label}: {PROFILES[active.profile].venue}.{" "}
                <button class="pl-btn quiet" style={{ padding: "1px 6px" }} onClick={resetToProfile}>
                  Reset to profile defaults
                </button>
              </p>
              {eventSources && eventSources.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <h3>Seed from a past event</h3>
                  <div class="pl-field" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                    <select value={eventPick} onChange={(e) => setEventPick((e.currentTarget as HTMLSelectElement).value)}>
                      {eventSources.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name} ({ev.year})
                        </option>
                      ))}
                    </select>
                    <button class="pl-btn" onClick={loadEvent}>
                      Use
                    </button>
                  </div>
                  <p class="pl-note">
                    Copies the team count, roster sizes, games per team, days, sheets, block cadence, and playoff rounds
                    from the synced event. Costs and price stay as they are.
                  </p>
                  {eventNotes.map((n, i) => (
                    <p class="pl-note" key={i}>
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div class="pl-card">
              <StructureInputs s={active.structure} edit={(f) => edit((sc) => f(sc.structure))} />
              <CostInputsPanel c={active.costs} roster={result.pnl.rosterPerTeam} edit={(f) => edit((sc) => f(sc.costs))} />
              <PricingInputsPanel p={active.pricing} edit={(f) => edit((sc) => f(sc.pricing))} />
            </div>
          </aside>

          <main>
            {(result.warnings.length > 0 || result.schedule.warnings.length > 0 || result.format.notes.length > 0) && (
              <div class="pl-card">
                {result.warnings.map((w, i) => (
                  <p class="pl-warn" key={`w${i}`}>
                    {w}
                  </p>
                ))}
                {result.format.notes.map((w, i) => (
                  <p class="pl-warn" key={`f${i}`}>
                    {w}
                  </p>
                ))}
                {result.schedule.warnings.map((w, i) => (
                  <p class={w.includes("does not fit") || w.includes("must be") ? "pl-warn" : "pl-note"} key={`s${i}`}>
                    {w}
                  </p>
                ))}
              </div>
            )}

            <Tiles r={result} />
            <FormatCard r={result} applyPlan={applyPlan} />
            <ScheduleCard r={result} />
            <PnlCard r={result} />
            <FamilyCard r={result} />
            <CompareCard results={results} activeId={active.id} onPick={setActiveId} />
          </main>
        </div>
        <p class="pl-foot">
          Hockey Night in Boston. Every figure on this page is recomputed from the inputs on the left; open "Show the math"
          under the P&amp;L to see each formula with the current numbers.
        </p>
      </div>
    </div>
  );
}

// ---- Inputs ---------------------------------------------------------------------

interface NumProps {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  note?: string;
}

function Num({ label, value, onChange, min, max, step, prefix, suffix, note }: NumProps) {
  return (
    <div class="pl-field">
      <label>{label}</label>
      <div class="pl-affix">
        {prefix && <span>{prefix}</span>}
        <input
          type="number"
          value={value ?? ""}
          min={min}
          max={max}
          step={step ?? 1}
          onInput={(e) => {
            const v = Number((e.currentTarget as HTMLInputElement).value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {note && <p class="pl-note">{note}</p>}
    </div>
  );
}

/** A number that may be blank (null), for optional overrides. */
function OptNum({ label, value, onChange, prefix, note }: { label: string; value: number | null; onChange: (v: number | null) => void; prefix?: string; note?: string }) {
  return (
    <div class="pl-field">
      <label>{label}</label>
      <div class="pl-affix">
        {prefix && <span>{prefix}</span>}
        <input
          type="number"
          value={value ?? ""}
          placeholder="none"
          min={0}
          onInput={(e) => {
            const raw = (e.currentTarget as HTMLInputElement).value;
            if (raw === "") onChange(null);
            else if (Number.isFinite(Number(raw))) onChange(Number(raw));
          }}
        />
      </div>
      {note && <p class="pl-note">{note}</p>}
    </div>
  );
}

function Check({ label, value, onChange, note }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <div class="pl-field check">
      <label>{label}</label>
      <input type="checkbox" checked={value} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      {note && <p class="pl-note">{note}</p>}
    </div>
  );
}

function Sel<T extends string>({ label, value, options, onChange, note }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; note?: string }) {
  return (
    <div class="pl-field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      {note && <p class="pl-note">{note}</p>}
    </div>
  );
}

function Time({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div class="pl-field">
      <label>{label}</label>
      <input type="time" value={value} onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value)} />
    </div>
  );
}

function StructureInputs({ s, edit }: { s: EventStructure; edit: (f: (st: EventStructure) => void) => void }) {
  return (
    <details open>
      <summary>Event structure</summary>
      <Num label="Number of teams" value={s.teams} min={2} max={24} onChange={(v) => edit((st) => { st.teams = v; st.fixedRounds = null; })} note="3, 4, 6, and 8 are pre-checked; any count from 2 to 12 works." />
      <div class="pl-field">
        <label>Roster per team (F / D / G)</label>
        <div class="pl-row3">
          <input type="number" min={0} value={s.forwards} onInput={(e) => edit((st) => (st.forwards = Number((e.currentTarget as HTMLInputElement).value) || 0))} aria-label="Forwards" />
          <input type="number" min={0} value={s.defense} onInput={(e) => edit((st) => (st.defense = Number((e.currentTarget as HTMLInputElement).value) || 0))} aria-label="Defense" />
          <input type="number" min={0} value={s.goalies} onInput={(e) => edit((st) => (st.goalies = Number((e.currentTarget as HTMLInputElement).value) || 0))} aria-label="Goalies" />
        </div>
      </div>
      <Num label="Games per team (guaranteed)" value={s.gamesPerTeam} min={1} max={12} onChange={(v) => edit((st) => { st.gamesPerTeam = v; st.fixedRounds = null; })} />
      <Sel
        label="Format"
        value={s.format}
        options={[
          ["auto", "Automatic (best exact fit)"],
          ["single-rr", "Single round robin"],
          ["double-rr", "Double round robin"],
          ["partial-rr", "Partial round robin"],
          ["pools", "Two pools plus crossover"],
          ["rr-placement", "Round robin plus placement round"],
        ]}
        onChange={(v) => edit((st) => { st.format = v; st.fixedRounds = null; })}
      />
      <Sel
        label="Playoff games"
        value={s.playoffs}
        options={[
          ["none", "None"],
          ["final", "Final only"],
          ["semis", "Semis plus final"],
          ["quarters", "Quarters, semis, final (8 teams)"],
        ]}
        onChange={(v) => edit((st) => (st.playoffs = v))}
      />
      <Check label="All-Star game" value={s.allStarGame} onChange={(v) => edit((st) => (st.allStarGame = v))} />
      <Check label="Practice per team" value={s.practice} onChange={(v) => edit((st) => (st.practice = v))} />
      {s.practice && <Num label="Practice minutes" value={s.practiceMinutes} min={15} max={240} step={5} onChange={(v) => edit((st) => (st.practiceMinutes = v))} />}
      <Num label="Days available" value={s.days} min={1} max={7} onChange={(v) => edit((st) => (st.days = v))} />
      <Time label="First ice" value={s.firstIce} onChange={(v) => edit((st) => (st.firstIce = v))} />
      <Time label="Last ice (blocks must end by)" value={s.lastIce} onChange={(v) => edit((st) => (st.lastIce = v))} />
      <Num label="Ice sheets" value={s.sheets} min={1} max={4} onChange={(v) => edit((st) => (st.sheets = v))} />
      <Num
        label="Game block (minutes)"
        value={s.blockMinutes}
        min={20}
        max={240}
        step={5}
        onChange={(v) => edit((st) => (st.blockMinutes = v))}
        note="Warmup, two 23-minute stop-time periods, and the resurface. Match this to the increment the rink sells ice in."
      />
      <Num label="Buffer between blocks (minutes)" value={s.bufferMinutes} min={0} max={120} step={5} onChange={(v) => edit((st) => (st.bufferMinutes = v))} />
      <Num
        label="Rest blocks between a team's games"
        value={s.restBlocks}
        min={0}
        max={4}
        onChange={(v) => edit((st) => (st.restBlocks = v))}
        note="1 means no back-to-back games. On one sheet with four teams this forces open blocks; set 0 to allow back-to-back and compress the ice."
      />
      <Num label="Stop-time minutes per game" value={s.gameMinutes} min={10} max={120} onChange={(v) => edit((st) => (st.gameMinutes = v))} note="Used for the family value view only (two 23-minute periods = 46)." />
    </details>
  );
}

function CostInputsPanel({ c, roster, edit }: { c: CostInputs; roster: number; edit: (f: (c: CostInputs) => void) => void }) {
  const money = (label: string, key: keyof CostInputs, note?: string, step = 1) => (
    <Num label={label} value={c[key] as number} min={0} step={step} prefix="$" onChange={(v) => edit((x) => ((x as unknown as Record<string, number>)[key] = v))} note={note} />
  );
  return (
    <details open>
      <summary>Costs</summary>
      <h3>Ice</h3>
      {money("Ice cost per hour", "iceHourly")}
      <Sel
        label="Ice billed as"
        value={c.iceBilling}
        options={[
          ["span", "Booked span (idle gaps paid)"],
          ["active", "Active blocks only"],
        ]}
        onChange={(v) => edit((x) => (x.iceBilling = v))}
      />
      <OptNum label="Flat weekend ice package" value={c.icePackage} prefix="$" onChange={(v) => edit((x) => (x.icePackage = v))} note="When set, replaces the hourly calculation." />
      <OptNum label="Rink rental minimum" value={c.iceMinimum} prefix="$" onChange={(v) => edit((x) => (x.iceMinimum = v))} />
      <h3 style={{ marginTop: 8 }}>Officials and staff</h3>
      <Num label="Referees per game" value={c.refsPerGame} min={0} max={4} onChange={(v) => edit((x) => (x.refsPerGame = v))} />
      {money("Rate per referee per game", "refRate")}
      {money("Scorekeeper per game", "scorekeeperPerGame")}
      {money("Coach pay per team (flat)", "coachPerTeam")}
      <Check label="Coach referral commission" value={c.referralOn} onChange={(v) => edit((x) => (x.referralOn = v))} />
      {c.referralOn && (
        <>
          {money("Commission per referred player", "referralPerPlayer")}
          <OptNum label="Players each coach referred" value={c.referredPerTeam} onChange={(v) => edit((x) => (x.referredPerTeam = v))} note={`Blank = the full roster (${roster}).`} />
        </>
      )}
      <h3 style={{ marginTop: 8 }}>Per player</h3>
      {money("Jersey per player", "jerseyPerPlayer", "HNIB game jerseys are normally included in the fee, so this starts at 0.")}
      {money("App profile per player", "appProfilePerPlayer")}
      {money("Insurance per player", "insurancePerPlayer")}
      <Num label="Card processing fee" value={c.processingPct} min={0} max={10} step={0.1} suffix="%" onChange={(v) => edit((x) => (x.processingPct = v))} />
      <Num label="Plus per transaction" value={c.processingFlat} min={0} step={0.05} prefix="$" onChange={(v) => edit((x) => (x.processingFlat = v))} />
      <Num label="Share paying by card" value={c.cardShare} min={0} max={100} suffix="%" onChange={(v) => edit((x) => (x.cardShare = v))} />
      <h3 style={{ marginTop: 8 }}>Event fixed costs</h3>
      {money("Staff travel", "travel")}
      {money("Lodging", "lodging")}
      {money("Staff", "staff")}
      {money("Video", "video")}
      {money("Marketing", "marketing")}
      {money("Trophies", "trophies")}
      {money("Misc", "misc")}
    </details>
  );
}

function PricingInputsPanel({ p, edit }: { p: PricingInputs; edit: (f: (p: PricingInputs) => void) => void }) {
  return (
    <details open>
      <summary>Pricing</summary>
      <Num label="Price per player" value={p.pricePerPlayer} min={0} prefix="$" onChange={(v) => edit((x) => (x.pricePerPlayer = v))} note="HNIB list prices: $379 festival, $479 showcase." />
      <OptNum label="Early-bird price" value={p.earlyBirdPrice} prefix="$" onChange={(v) => edit((x) => (x.earlyBirdPrice = v))} />
      {p.earlyBirdPrice !== null && <Num label="Share registering early" value={p.earlyBirdShare} min={0} max={100} suffix="%" onChange={(v) => edit((x) => (x.earlyBirdShare = v))} />}
      <Num label="Expected fill rate" value={p.fillRate} min={0} max={150} suffix="%" onChange={(v) => edit((x) => (x.fillRate = v))} note="Share of the target roster that actually registers." />
    </details>
  );
}

// ---- Outputs -------------------------------------------------------------------

function Tiles({ r }: { r: PlanResult }) {
  const p = r.pnl;
  return (
    <div class="pl-tiles">
      <div class="pl-tile">
        <div class="k">Net profit</div>
        <div class={`v ${p.netProfit < 0 ? "neg" : ""}`}>{usd(p.netProfit)}</div>
        <div class="s">{p.marginPct}% margin on {usd(p.netRevenue)} net revenue</div>
      </div>
      <div class="pl-tile">
        <div class="k">Profit per player</div>
        <div class={`v ${p.profitPerPlayer < 0 ? "neg" : ""}`}>{usd(p.profitPerPlayer)}</div>
        <div class="s">{p.players} players at {usd(p.effectivePrice)}</div>
      </div>
      <div class="pl-tile">
        <div class="k">Break-even price</div>
        <div class="v">{usd(p.breakEvenPrice)}</div>
        <div class="s">at the target roster of {p.targetPlayers}</div>
      </div>
      <div class="pl-tile">
        <div class="k">Break-even players</div>
        <div class="v">{p.breakEvenPlayers ?? "n/a"}</div>
        <div class="s">{p.breakEvenTeams !== null ? `about ${p.breakEvenTeams} teams at ${usd(r.scenario.pricing.pricePerPlayer)}` : "each registrant loses money"}</div>
      </div>
      <div class="pl-tile">
        <div class="k">Ice</div>
        <div class={`v ${r.schedule.fits ? "" : "neg"}`}>{r.schedule.bookedHours} h</div>
        <div class="s">
          {r.schedule.fits ? "fits the window" : `${r.schedule.hoursShort} h short`}, {r.schedule.totalGames} games,{" "}
          {r.schedule.days.length} day{r.schedule.days.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function FormatCard({ r, applyPlan }: { r: PlanResult; applyPlan: (p: FormatPlan) => void }) {
  const f = r.format;
  return (
    <div class="pl-card">
      <h2>Format: {f.plan.title}</h2>
      <p style={{ margin: "0 0 4px" }}>
        {f.plan.description} <strong>{describeGuarantee(f.plan)}</strong>
        {f.exact ? "" : ` (requested ${f.gamesPerTeam}).`}
      </p>
      {f.plan.pools.length > 1 && (
        <p class="pl-note">
          {f.plan.pools.map((pool, i) => `Pool ${String.fromCharCode(65 + i)}: ${pool.map(teamName).join(", ")}`).join(". ")}.
        </p>
      )}
      {f.alternatives.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h3>{f.exact ? "Other formats that also work" : "Closest workable formats"}</h3>
          {f.alternatives.map((alt, i) => (
            <div class="pl-alt" key={i}>
              <div>
                <span class="t">
                  {alt.teams !== f.teams ? `${alt.teams} teams: ` : ""}
                  {alt.title}
                </span>{" "}
                <span class="pl-note">
                  {describeGuarantee(alt)}. {alt.description}
                </span>
              </div>
              <button class="pl-btn quiet pl-noprint" onClick={() => applyPlan(alt)}>
                Use
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleCard({ r }: { r: PlanResult }) {
  const s = r.schedule;
  const sheets = r.scenario.structure.sheets;
  return (
    <div class="pl-card">
      <h2>Weekend schedule</h2>
      <p class="pl-note" style={{ margin: "0 0 8px" }}>
        {s.roundRobinGames} round-robin games{s.placementGames ? `, ${s.placementGames} placement` : ""}
        {s.playoffGames ? `, ${s.playoffGames} playoff` : ""}
        {s.allStarGames ? ", 1 All-Star" : ""}
        {s.practiceSessions ? `, ${s.practiceSessions} practices` : ""}. {s.bookedHours} ice hours booked ({s.activeHours} active,{" "}
        {Math.round((s.bookedHours - s.activeHours) * 100) / 100} open). Playoff seeds come from the round-robin standings using the HNIB tie-break
        rules (points, wins, head-to-head for two teams, goals against, goals for).
      </p>
      {s.days.map((d) => (
        <div class="pl-day" key={d.day}>
          <h3>
            <span>{d.label}</span>
            <span>
              {d.games} games, {d.bookedHours} h booked{d.idleHours > 0 ? `, ${d.idleHours} h open` : ""}
            </span>
          </h3>
          <div class="pl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  {sheets > 1 && <th>Sheet</th>}
                  <th>Type</th>
                  <th>Stage</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {s.sessions
                  .filter((x) => x.day === d.day)
                  .map((x, i) => (
                    <tr key={i} class={x.kind === "idle" ? "idle" : ""}>
                      <td>{fmtTime(x.start)}</td>
                      <td>{fmtTime(x.end)}</td>
                      {sheets > 1 && <td>Sheet {x.sheet + 1}</td>}
                      <td>
                        <span class={`pl-kind ${x.kind}`}>{kindLabel(x.kind)}</span>
                      </td>
                      <td>{x.stage}</td>
                      <td>{x.label}</td>
                    </tr>
                  ))}
                {s.sessions.filter((x) => x.day === d.day).length === 0 && (
                  <tr>
                    <td colSpan={6} class="pl-note">
                      Nothing scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {s.unscheduled.length > 0 && (
        <div>
          <h3>Could not be placed ({s.hoursShort} hours short)</h3>
          {s.unscheduled.map((u, i) => (
            <p class="pl-warn" key={i}>
              {u.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PnlCard({ r }: { r: PlanResult }) {
  const p = r.pnl;
  return (
    <div class="pl-card">
      <h2>Profit and loss</h2>
      <div class="pl-scroll">
        <table>
          <tbody>
            <tr class="group">
              <td>Gross revenue</td>
              <td class="formula">
                {p.players} players x {usd(p.effectivePrice, 2)}
              </td>
              <td class="num">{usd(p.grossRevenue)}</td>
            </tr>
            <tr>
              <td class="sub">Processing fees</td>
              <td class="formula">
                {r.scenario.costs.processingPct}% + {usd(r.scenario.costs.processingFlat, 2)} on {r.scenario.costs.cardShare}% card transactions
              </td>
              <td class="num">-{usd(p.processingFees)}</td>
            </tr>
            <tr class="total">
              <td>Net revenue</td>
              <td />
              <td class="num">{usd(p.netRevenue)}</td>
            </tr>
            {p.groups.map((g) => (
              <tr key={g.key} class="group">
                <td>{g.label}</td>
                <td class="formula">{g.lines.filter((l) => l.value !== 0 || g.lines.length === 1).map((l) => `${l.label}: ${l.formula}`).join("; ")}</td>
                <td class="num">{usd(g.amount)}</td>
              </tr>
            ))}
            <tr class="total">
              <td>Total cost</td>
              <td />
              <td class="num">{usd(p.totalCost)}</td>
            </tr>
            <tr class="total">
              <td>Net profit</td>
              <td class="formula">{p.marginPct}% margin</td>
              <td class={`num ${p.netProfit < 0 ? "pl-warn" : ""}`}>{usd(p.netProfit)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pl-scroll" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>Per player</th>
              <th class="num">Revenue</th>
              <th class="num">Cost</th>
              <th class="num">Profit</th>
              <th class="num">Break-even price</th>
              <th class="num">Break-even players</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{p.players} registered</td>
              <td class="num">{usd(p.revenuePerPlayer, 2)}</td>
              <td class="num">{usd(p.costPerPlayer, 2)}</td>
              <td class="num">{usd(p.profitPerPlayer, 2)}</td>
              <td class="num">{usd(p.breakEvenPrice, 2)}</td>
              <td class="num">{p.breakEvenPlayers ?? "n/a"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pl-scroll" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>Fill rate sensitivity</th>
              {p.sensitivity.map((s) => (
                <th class="num" key={s.fillRate}>
                  {s.fillRate}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Players</td>
              {p.sensitivity.map((s) => (
                <td class="num" key={s.fillRate}>
                  {s.players}
                </td>
              ))}
            </tr>
            <tr>
              <td>Net profit</td>
              {p.sensitivity.map((s) => (
                <td class={`num ${s.profit < 0 ? "pl-warn" : ""}`} key={s.fillRate}>
                  {usd(s.profit)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary>Show the math</summary>
        <div class="pl-scroll">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Formula with current numbers</th>
                <th class="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {p.math.map((m, i) => (
                <tr key={i}>
                  <td>{m.label}</td>
                  <td class="formula">{m.formula}</td>
                  <td class="num">{m.money ? usd(m.value, 2) : m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function FamilyCard({ r }: { r: PlanResult }) {
  const f = r.family;
  return (
    <div class="pl-card navy">
      <h2>What a family gets for {usd(f.price)}</h2>
      <div class="pl-family">
        <div class="item">
          <div class="k">Games</div>
          <div class="v">{f.guaranteedGames}</div>
        </div>
        <div class="item">
          <div class="k">Price per game</div>
          <div class="v">{usd(f.pricePerGame)}</div>
        </div>
        <div class="item">
          <div class="k">Skater ice per game</div>
          <div class="v">{f.skaterIceMinutesPerGame} min</div>
        </div>
        <div class="item">
          <div class="k">Skater ice, weekend</div>
          <div class="v">{f.skaterIceMinutesTotal + f.practiceMinutes} min</div>
        </div>
        <div class="item">
          <div class="k">Goalie ice per game</div>
          <div class="v">{f.goalieIceMinutesPerGame} min</div>
        </div>
        <div class="item">
          <div class="k">Practice</div>
          <div class="v">{f.practiceMinutes ? `${f.practiceMinutes} min` : "none"}</div>
        </div>
        <div class="item">
          <div class="k">Playoffs</div>
          <div class="v" style={{ fontSize: 20 }}>
            {f.playoffOpportunity}
          </div>
        </div>
        <div class="item">
          <div class="k">All-Star game</div>
          <div class="v">{f.allStarOpportunity ? "Yes" : "No"}</div>
        </div>
      </div>
      <p class="pl-note" style={{ color: "var(--pl-ice)", marginTop: 8 }}>
        {f.gameMinutesTotal} stop-time minutes of games with referees and a scorekeeper. Skater ice assumes five skaters on the ice
        sharing {r.scenario.structure.forwards + r.scenario.structure.defense} skater spots; goalies split the net. Game jersey included.
        {" "}About {usd(f.pricePerIceMinute, 2)} per minute of ice.
      </p>
    </div>
  );
}

function CompareCard({ results, activeId, onPick }: { results: PlanResult[]; activeId: string; onPick: (id: string) => void }) {
  const rows = comparisonRows(results);
  return (
    <div class="pl-card">
      <h2>Scenario comparison</h2>
      <div class="pl-scroll">
        <table class="pl-compare">
          <thead>
            <tr>
              <th />
              {results.map((r) => (
                <th class={`col ${r.scenario.id === activeId ? "active" : ""}`} key={r.scenario.id} onClick={() => onPick(r.scenario.id)} style={{ cursor: "pointer" }}>
                  {r.scenario.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={i} class={/^-?\$|%$|^\d/.test(v) ? "num" : ""}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Browser helpers ---------------------------------------------------------

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario";
}
