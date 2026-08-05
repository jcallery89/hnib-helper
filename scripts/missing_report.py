#!/usr/bin/env python3
"""Missing-headshot report for an event, grouped by team.

A player is "missing" when their ID is absent from the SITE's
headshots/manifest.js - the source of truth after recovery uploads, since
recovered photos live on the server, not in the Tourno bucket. Players whose
name also appears on the prior event's roster are marked as a possible match
to verify (the recovery run held them back for DOB reasons).

For each missing player, any name-matched prior-event candidate photo is
downloaded from the public Tourno bucket into by-team/<Team>/<Last_First>.jpg
so identity can be verified by eye before adding it. Output contents are
otherwise roster-public fields: team, jersey, name, player ID - no birth
dates. Console output is counts only, safe for public CI logs.

Usage:
  python scripts/missing_report.py CURRENT_EVENT PRIOR_EVENT \
      --manifest-url URL [--out missing-report]
"""

import argparse
import csv
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recover_headshots as rh


def manifest_ids(url):
    req = urllib.request.Request(url, headers=rh.UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        text = r.read().decode("utf-8", "replace")
    m = re.search(r"window\.HNIB_HEADSHOTS\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        raise SystemExit("manifest.js did not parse")
    return set(json.loads(m.group(1)).keys())


def team_rosters(event_id):
    teams = []
    divisions = rh.get_json(f"teams/{event_id}")
    for d in divisions if isinstance(divisions, list) else []:
        for t in d.get("Teams") or []:
            team = rh.get_json(f"team/{t['ID']}")
            players = []
            for p in team.get("Players") or []:
                if not p.get("ID"):
                    continue
                players.append({
                    "id": p["ID"],
                    "first": (p.get("FirstName") or "").strip(),
                    "last": (p.get("LastName") or "").strip(),
                    "jersey": p.get("Number"),
                    "name_key": rh.norm_name(p.get("FirstName") or "", p.get("LastName") or ""),
                })
            teams.append({"name": (t.get("Name") or t["ID"]).strip(), "players": players})
    return teams


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("current_event")
    ap.add_argument("prior_event")
    ap.add_argument("--manifest-url", required=True)
    ap.add_argument("--out", default="missing-report")
    args = ap.parse_args()

    have = manifest_ids(args.manifest_url)
    print(f"site manifest: {len(have)} photos")
    teams = team_rosters(args.current_event)
    prior_by_name = {}
    for p in rh.rosters(args.prior_event):
        prior_by_name.setdefault(p["name"], []).append(p["id"])

    total = 0
    rows = []
    for t in teams:
        for p in t["players"]:
            total += 1
            if p["id"] in have:
                continue
            rows.append({**p, "team": t["name"], "candidates": prior_by_name.get(p["name_key"], [])})
    rows.sort(key=lambda r: (r["team"], r["jersey"] if isinstance(r["jersey"], int) else 999))
    print(f"{total} players on {len(teams)} teams; {len(rows)} missing a photo on the site")

    # Pull each name-matched prior-event candidate's photo (public Tourno
    # bucket) into the player's team folder so identity can be verified by eye.
    downloaded = 0
    for r in rows:
        r["photos"] = []
        team_dir = os.path.join(args.out, "by-team", safe_name(r["team"]))
        for i, prior_id in enumerate(r["candidates"]):
            suffix = f"_candidate{i + 1}" if len(r["candidates"]) > 1 else ""
            fname = f"{safe_name(r['last'] + '_' + r['first'])}{suffix}.jpg"
            os.makedirs(team_dir, exist_ok=True)
            if rh.download(prior_id, os.path.join(team_dir, fname)):
                r["photos"].append(fname)
                downloaded += 1
            elif not os.listdir(team_dir):
                os.rmdir(team_dir)
    print(f"downloaded {downloaded} prior-event candidate photos")

    os.makedirs(os.path.join(args.out, "by-team"), exist_ok=True)
    with open(os.path.join(args.out, "missing-headshots.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Team", "Jersey", "First", "Last", "PhotosIncluded", "PlayerID2026", "CandidatePriorIDs"])
        for r in rows:
            w.writerow([
                r["team"], r["jersey"], r["first"], r["last"],
                ";".join(r["photos"]) or "none found",
                r["id"], ";".join(r["candidates"]),
            ])

    by_team = {}
    for r in rows:
        by_team.setdefault(r["team"], []).append(r)
    for team, plist in by_team.items():
        lines = [f"{team} - missing headshots ({len(plist)})", ""]
        for r in plist:
            jersey = f"#{r['jersey']} " if r["jersey"] not in (None, "") else ""
            note = f"prior-event photo included: {', '.join(r['photos'])} (verify identity)" if r["photos"] else "no photo found anywhere"
            lines.append(f"{jersey}{r['first']} {r['last']} - {note}")
        with open(os.path.join(args.out, "by-team", f"{safe_name(team)}.txt"), "w") as f:
            f.write("\n".join(lines) + "\n")
    print(f"wrote {args.out}/ with {len(by_team)} team files")
    return 0


def safe_name(s):
    return re.sub(r"[^A-Za-z0-9 _-]+", "", s).strip().replace(" ", "_") or "unnamed"


if __name__ == "__main__":
    sys.exit(main())
