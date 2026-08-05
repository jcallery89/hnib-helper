#!/usr/bin/env python3
"""Missing-headshot report for an event, grouped by team.

A player is "missing" when their ID is absent from the SITE's
headshots/manifest.js - the source of truth after recovery uploads, since
recovered photos live on the server, not in the Tourno bucket. Players whose
name also appears on the prior event's roster are marked as a possible match
to verify (the recovery run held them back for DOB reasons).

Output contents are roster-public fields only: team, jersey, name, player ID.
No birth dates, no photos. Console output is counts only, safe for public CI
logs.

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
    prior_names = {p["name"] for p in rh.rosters(args.prior_event)}

    total = 0
    rows = []
    for t in teams:
        for p in t["players"]:
            total += 1
            if p["id"] in have:
                continue
            status = (
                "possible prior-event match - verify identity"
                if p["name_key"] in prior_names
                else "no photo found anywhere"
            )
            rows.append({**p, "team": t["name"], "status": status})
    rows.sort(key=lambda r: (r["team"], r["jersey"] if isinstance(r["jersey"], int) else 999))
    print(f"{total} players on {len(teams)} teams; {len(rows)} missing a photo on the site")

    os.makedirs(os.path.join(args.out, "by-team"), exist_ok=True)
    with open(os.path.join(args.out, "missing-headshots.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Team", "Jersey", "First", "Last", "Status", "PlayerID"])
        for r in rows:
            w.writerow([r["team"], r["jersey"], r["first"], r["last"], r["status"], r["id"]])

    by_team = {}
    for r in rows:
        by_team.setdefault(r["team"], []).append(r)
    for team, plist in by_team.items():
        safe = re.sub(r"[^A-Za-z0-9 _-]+", "", team).strip() or "team"
        lines = [f"{team} - missing headshots ({len(plist)})", ""]
        for r in plist:
            jersey = f"#{r['jersey']} " if r["jersey"] not in (None, "") else ""
            lines.append(f"{jersey}{r['first']} {r['last']} - {r['status']}")
        with open(os.path.join(args.out, "by-team", f"{safe}.txt"), "w") as f:
            f.write("\n".join(lines) + "\n")
    print(f"wrote {args.out}/ with {len(by_team)} team files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
