import { useMemo, useState } from "preact/hooks";
import type { Dataset } from "../../io/dataset.ts";
import type { Player, PlayerSummary } from "../../engine/types.ts";
import {
  type BallotPosition,
  type BallotSelection,
  type InviteStatus,
  ballotPosition,
  compareProduction,
  countInvites,
  emptyBallot,
  positionLabel,
} from "../../engine/ballot/ballot.ts";
import { joinContacts } from "../../io/contactJoin.ts";
import { listRegistrationEvents } from "../../io/importRegistration.ts";
import { playerSummaries } from "../state/store.ts";
import { downloadFile } from "../../io/session.ts";

interface Props {
  dataset: Dataset;
  update: (mutate: (draft: Dataset) => void) => void;
}

const POSITIONS: BallotPosition[] = ["F", "D", "G"];

export function BallotView({ dataset, update }: Props) {
  const [teamFilter, setTeamFilter] = useState("all");
  const [nominatedOnly, setNominatedOnly] = useState(false);
  const [registrationCsv, setRegistrationCsv] = useState("");
  const [registrationEvent, setRegistrationEvent] = useState("");
  const [joinStatus, setJoinStatus] = useState<string[]>([]);

  const ballot = dataset.ballot ?? emptyBallot();
  const nominated = useMemo(() => new Set(ballot.nominatedIds ?? []), [ballot.nominatedIds]);
  const teamName = useMemo(() => new Map(dataset.teams.map((t) => [t.id, t.name])), [dataset.teams]);
  const summaries = useMemo(
    () => playerSummaries(dataset),
    [dataset.players, dataset.playerStats, dataset.games],
  );

  // Every rostered player is on the ballot; coaches nominated from their own
  // teams, so the list is grouped by position and pre-sorted by production to
  // read like the form did.
  const groups = useMemo(() => {
    const g: Record<BallotPosition, Player[]> = { F: [], D: [], G: [] };
    for (const p of dataset.players ?? []) g[ballotPosition(p, summaries.get(p.id))].push(p);
    for (const pos of POSITIONS) {
      g[pos].sort(
        (a, b) =>
          compareProduction(summaries.get(a.id), summaries.get(b.id), pos) ||
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
      );
    }
    return g;
  }, [dataset.players, summaries]);

  const nominatedPlayers = useMemo(
    () => (dataset.players ?? []).filter((p) => nominated.has(p.id)),
    [dataset.players, nominated],
  );

  const registrationEvents = useMemo(
    () => (registrationCsv.trim() ? listRegistrationEvents(registrationCsv) : []),
    [registrationCsv],
  );

  function toggleNominated(id: string) {
    update((d) => {
      if (!d.ballot) d.ballot = emptyBallot();
      const set = new Set(d.ballot.nominatedIds ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      d.ballot.nominatedIds = [...set];
    });
  }

  function setSelection(id: string, value: BallotSelection | "") {
    update((d) => {
      if (!d.ballot) d.ballot = emptyBallot();
      const sel = { ...(d.ballot.selections ?? {}) };
      if (value === "") delete sel[id];
      else sel[id] = value;
      d.ballot.selections = sel;
    });
  }

  function setNote(id: string, value: string) {
    update((d) => {
      if (!d.ballot) d.ballot = emptyBallot();
      const notes = { ...(d.ballot.playerNotes ?? {}) };
      if (value.trim() === "") delete notes[id];
      else notes[id] = value;
      d.ballot.playerNotes = notes;
    });
  }

  function setInvite(id: string, value: InviteStatus | "") {
    update((d) => {
      if (!d.ballot) d.ballot = emptyBallot();
      const inv = { ...(d.ballot.invites ?? {}) };
      if (value === "") delete inv[id];
      else inv[id] = value;
      d.ballot.invites = inv;
    });
  }

  function setTarget(pos: BallotPosition, value: number) {
    update((d) => {
      if (!d.ballot) d.ballot = emptyBallot();
      d.ballot.targets = { F: 0, D: 0, G: 0, ...(d.ballot.targets ?? {}), [pos]: value };
    });
  }

  function statText(s: PlayerSummary | undefined, pos: BallotPosition): string {
    if (pos === "G") {
      const gaa = s?.gaa !== undefined ? s.gaa.toFixed(2) : "-";
      const sv = s?.savePct !== undefined ? s.savePct.toFixed(3).replace(/^0/, "") : "-";
      return `GP ${s?.gp ?? 0}, ${gaa} GAA, ${sv} SV%`;
    }
    return `GP ${s?.gp ?? 0}, ${s?.goals ?? 0}g ${s?.assists ?? 0}a ${s?.points ?? 0}pts`;
  }

  function nominatedCsvRows(): string[][] {
    const rows: string[][] = [];
    for (const pos of POSITIONS) {
      for (const p of groups[pos]) {
        if (!nominated.has(p.id)) continue;
        const s = summaries.get(p.id);
        rows.push([
          teamName.get(p.teamId) ?? p.teamId,
          p.jersey !== null ? String(p.jersey) : "",
          p.lastName,
          p.firstName,
          pos,
          p.birthYear !== undefined ? String(p.birthYear) : "",
          p.hometown ?? "",
          p.school ?? "",
          String(s?.gp ?? 0),
          pos === "G" ? (s?.gaa !== undefined ? s.gaa.toFixed(2) : "") : String(s?.goals ?? 0),
          pos === "G" ? (s?.savePct !== undefined ? s.savePct.toFixed(3) : "") : String(s?.assists ?? 0),
          pos === "G" ? "" : String(s?.points ?? 0),
          ballot.selections?.[p.id] ?? "",
          ballot.invites?.[p.id] ?? "",
          ballot.playerNotes?.[p.id] ?? "",
        ]);
      }
    }
    return rows;
  }

  function exportNominated() {
    const header = [
      "team", "jersey", "last", "first", "position", "birthYear", "hometown", "school",
      "gp", "g_or_gaa", "a_or_svpct", "pts", "selection", "invite", "note",
    ];
    const lines = nominatedCsvRows().map((r) => r.map(csvCell).join(","));
    downloadFile(
      `${dataset.event.year}-nominated-players.csv`,
      [header.join(","), ...lines].join("\n"),
      "text/csv",
    );
  }

  function exportNotificationList() {
    const result = joinContacts(
      registrationCsv,
      nominatedPlayers,
      dataset.teams,
      registrationEvents.length > 1 ? registrationEvent : undefined,
    );
    const status: string[] = [];
    if (result.warnings.length > 0) status.push(...result.warnings);
    if (result.unmatched.length > 0) {
      status.push(`No registration row found for: ${result.unmatched.join("; ")}. They are in the file with blank contact columns.`);
    }
    const contactById = new Map(result.rows.map((r) => [r.playerId, r]));
    const header = [
      "team", "jersey", "last", "first", "position", "selection", "invite",
      "parent_name", "parent_cell", "parent_email", "player_cell", "player_email", "note",
    ];
    const lines: string[] = [];
    for (const pos of POSITIONS) {
      for (const p of groups[pos]) {
        if (!nominated.has(p.id)) continue;
        const c = contactById.get(p.id);
        lines.push(
          [
            teamName.get(p.teamId) ?? p.teamId,
            p.jersey !== null ? String(p.jersey) : "",
            p.lastName,
            p.firstName,
            pos,
            ballot.selections?.[p.id] ?? "",
            ballot.invites?.[p.id] ?? "",
            c?.parentName ?? "",
            c?.parentCell ?? "",
            c?.parentEmail ?? "",
            c?.playerCell ?? "",
            c?.playerEmail ?? "",
            ballot.playerNotes?.[p.id] ?? "",
          ].map(csvCell).join(","),
        );
      }
    }
    if (lines.length > 0 && result.rows.length > 0) {
      downloadFile(
        `${dataset.event.year}-nomination-notifications.csv`,
        [header.join(","), ...lines].join("\n"),
        "text/csv",
      );
      status.unshift(`Downloaded contacts for ${result.rows.length} of ${nominatedPlayers.length} nominated players.`);
    } else if (lines.length === 0) {
      status.unshift("No players are marked as nominated yet.");
    } else {
      status.unshift("No nominated players matched the paste. Check that it is the registration export for this event.");
    }
    setJoinStatus(status);
  }

  if ((dataset.players ?? []).length === 0) {
    return (
      <section>
        <div class="card">
          <p class="section-title">Coaches Ballot</p>
          <p class="note">No players yet. Sync the event from Setup to load the rosters.</p>
        </div>
      </section>
    );
  }

  const rosterCount = Object.values(ballot.selections ?? {}).filter((s) => s === "roster").length;
  const alternateCount = Object.values(ballot.selections ?? {}).filter((s) => s === "alternate").length;

  return (
    <section>
      <div class="card premium">
        <p class="section-title">Nominations ({nominated.size})</p>
        <p class="note">
          Work from the Gravity Forms entries export: tick Nominated for each player a coach named.
          Directors then mark Roster or Alternate on the nominated group. Counts:{" "}
          {POSITIONS.map((pos) => `${positionLabel(pos)} ${groups[pos].filter((p) => nominated.has(p.id)).length}`).join(", ")}
          {" - "}Roster {rosterCount}, Alternates {alternateCount}.
        </p>
        <div class="row" style={{ gap: 18, flexWrap: "wrap" }}>
          {POSITIONS.map((pos) => {
            const ids = groups[pos].map((p) => p.id);
            const c = countInvites(ballot, ids, pos);
            return (
              <label class="row" style={{ gap: 6 }} key={pos}>
                <strong>{positionLabel(pos)}:</strong>
                <span class="note">
                  {c.confirmed} in, {c.pending} awaiting reply, {c.declined} declined
                </span>
                of target
                <input
                  type="number"
                  min={0}
                  style={{ width: 56 }}
                  aria-label={`${positionLabel(pos)} target`}
                  value={ballot.targets?.[pos] || ""}
                  onInput={(e) => setTarget(pos, Number((e.target as HTMLInputElement).value) || 0)}
                />
              </label>
            );
          })}
        </div>
        {POSITIONS.map((pos) => {
          const c = countInvites(ballot, groups[pos].map((p) => p.id), pos);
          if (c.over === 0) return null;
          return (
            <p class="note" style={{ color: "#d6453d", fontWeight: 600 }} key={`over-${pos}`}>
              {positionLabel(pos)}: confirmed plus outstanding invites exceed the target by {c.over}.
              Hold further invites until replies land or the target changes.
            </p>
          );
        })}
        <div class="toolbar">
          <label class="row" style={{ gap: 6 }}>
            Team
            <select value={teamFilter} onChange={(e) => setTeamFilter((e.target as HTMLSelectElement).value)}>
              <option value="all">All teams</option>
              {dataset.teams.map((t) => (
                <option value={t.id} key={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label class="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={nominatedOnly}
              onChange={(e) => setNominatedOnly((e.target as HTMLInputElement).checked)}
            />
            Nominated only
          </label>
          <button class="btn secondary" onClick={exportNominated} disabled={nominated.size === 0}>
            Export nominated (CSV)
          </button>
        </div>
      </div>

      {POSITIONS.map((pos) => {
        const list = groups[pos].filter(
          (p) =>
            (teamFilter === "all" || p.teamId === teamFilter) &&
            (!nominatedOnly || nominated.has(p.id)),
        );
        if (list.length === 0) return null;
        return (
          <div class="card" key={pos}>
            <p class="section-title">
              {positionLabel(pos)} ({list.filter((p) => nominated.has(p.id)).length} nominated of {list.length})
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Nominated</th>
                    <th>Player</th>
                    <th>Team</th>
                    <th>#</th>
                    <th>Birth Yr</th>
                    <th>Stats</th>
                    <th>Final call</th>
                    <th>Invite</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const isNominated = nominated.has(p.id);
                    return (
                      <tr key={p.id} class={isNominated ? "highlight" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Nominated: ${p.firstName} ${p.lastName}`}
                            checked={isNominated}
                            onChange={() => toggleNominated(p.id)}
                          />
                        </td>
                        <td>{p.lastName}, {p.firstName}</td>
                        <td>{teamName.get(p.teamId) ?? p.teamId}</td>
                        <td>{p.jersey ?? ""}</td>
                        <td>{p.birthYear ?? ""}</td>
                        <td class="note">{statText(summaries.get(p.id), pos)}</td>
                        <td>
                          {isNominated ? (
                            <select
                              value={ballot.selections?.[p.id] ?? ""}
                              onChange={(e) =>
                                setSelection(p.id, (e.target as HTMLSelectElement).value as BallotSelection | "")
                              }
                            >
                              <option value="">-</option>
                              <option value="roster">Roster</option>
                              <option value="alternate">Alternate</option>
                            </select>
                          ) : null}
                        </td>
                        <td>
                          {isNominated ? (
                            <select
                              aria-label={`Invite: ${p.firstName} ${p.lastName}`}
                              value={ballot.invites?.[p.id] ?? ""}
                              onChange={(e) =>
                                setInvite(p.id, (e.target as HTMLSelectElement).value as InviteStatus | "")
                              }
                            >
                              <option value="">-</option>
                              <option value="invited">Invited</option>
                              <option value="yes">RSVP yes</option>
                              <option value="no">Declined</option>
                            </select>
                          ) : null}
                        </td>
                        <td>
                          {isNominated ? (
                            <input
                              type="text"
                              value={ballot.playerNotes?.[p.id] ?? ""}
                              placeholder="note"
                              onChange={(e) => setNote(p.id, (e.target as HTMLInputElement).value)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div class="card">
        <p class="section-title">Notification export (contacts)</p>
        <p class="note">
          Paste the HNIB registration export below to download the nominated players with parent
          and player contact columns for notification. Contact details are used for this download
          only and are never saved in the app.
        </p>
        <textarea
          rows={5}
          style={{ width: "100%" }}
          placeholder="Paste the registration export (CSV or straight from the spreadsheet)"
          value={registrationCsv}
          onInput={(e) => setRegistrationCsv((e.target as HTMLTextAreaElement).value)}
        />
        {registrationEvents.length > 1 && (
          <label class="row" style={{ gap: 6, marginTop: 8 }}>
            Event in the file
            <select
              value={registrationEvent}
              onChange={(e) => setRegistrationEvent((e.target as HTMLSelectElement).value)}
            >
              <option value="">Pick the event</option>
              {registrationEvents.map((ev) => (
                <option value={ev} key={ev}>{ev}</option>
              ))}
            </select>
          </label>
        )}
        <div class="toolbar" style={{ marginTop: 8 }}>
          <button
            class="btn"
            onClick={exportNotificationList}
            disabled={registrationCsv.trim() === "" || (registrationEvents.length > 1 && registrationEvent === "")}
          >
            Download notification list
          </button>
          <button
            class="btn secondary"
            onClick={() => {
              setRegistrationCsv("");
              setRegistrationEvent("");
              setJoinStatus([]);
            }}
            disabled={registrationCsv === ""}
          >
            Clear paste
          </button>
        </div>
        {joinStatus.map((s, i) => (
          <p class="note" key={i}>{s}</p>
        ))}
      </div>
    </section>
  );
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
