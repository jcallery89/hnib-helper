#!/usr/bin/env python3
"""Fill public headshots for CURRENT_EVENT, recovering from PRIOR_EVENT.

Two passes, per the recipe in docs/HEADSHOTS.md:

  1. Direct: probe the Tourno GCS bucket for every current-event player ID
     and download hits (same as fetch_headshots.py).
  2. Recovery: for players the bucket does not have, match name + DOB
     against PRIOR_EVENT's rosters. A single exact name+DOB match whose OLD
     player ID has a bucket photo is downloaded and saved under the CURRENT
     player ID. Anything weaker (name-only, DOB missing or mismatched, or
     multiple candidates) is flagged for human confirmation, never guessed.

Privacy: output is written for PUBLIC CI logs - it prints ONLY opaque player
IDs and counts. Names and DOBs stay in memory for matching and are never
printed or written to disk. Do not commit the downloaded photos; upload them
to the server's headshots/ folder (the repo gitignores public/headshots/).

Usage:
  python scripts/recover_headshots.py CURRENT_EVENT_ID PRIOR_EVENT_ID [--out DIR]
"""

import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import unicodedata
import urllib.request

API = "https://hnib.app/api"
BUCKET = "https://storage.googleapis.com/tourno-39a2a.appspot.com/players/profile/"
UA = {"User-Agent": "HNIB-TE-headshots/1.0", "Accept": "application/json"}


def get_json(path):
    req = urllib.request.Request(f"{API}/{path}", headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def bucket_ext(player_id):
    for ext in (".jpg", ".jpeg", ".png"):
        req = urllib.request.Request(BUCKET + player_id + ext, method="HEAD", headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                if r.status == 200:
                    return ext
        except Exception:
            pass
    return None


def to_true_jpeg(path):
    with open(path, "rb") as f:
        if f.read(3) == b"\xff\xd8\xff":
            return
    try:
        from PIL import Image
    except ImportError:
        return  # browsers render PNG bytes under .jpg fine; conversion is nice-to-have
    Image.open(path).convert("RGB").save(path, "JPEG", quality=90)


def download(source_id, dest_path):
    """Download source_id's bucket photo to dest_path. True on success."""
    ext = bucket_ext(source_id)
    if not ext:
        return False
    req = urllib.request.Request(BUCKET + source_id + ext, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r, open(dest_path, "wb") as f:
        f.write(r.read())
    to_true_jpeg(dest_path)
    return True


def norm_name(first, last):
    s = unicodedata.normalize("NFKD", f"{first} {last}".lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_dob(s):
    """Normalize a date-ish string to YYYY-MM-DD; empty string if unusable."""
    s = (s or "").strip()
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return ""


def profile_dob(player_id):
    """DOB from /player_profile - the documented shape is Player.Dob, with a
    defensive walk over the whole response as fallback."""
    try:
        data = get_json(f"player_profile/{player_id}")
    except Exception:
        return ""
    direct = norm_dob(((data.get("Player") or {}).get("Dob")) if isinstance(data, dict) else "")
    if direct:
        return direct

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and ("dob" in k.lower() or "birth" in k.lower()):
                    d = norm_dob(v)
                    if d:
                        yield d
                yield from walk(v)
        elif isinstance(o, list):
            for item in o:
                yield from walk(item)

    for d in walk(data):
        return d
    return ""


def rosters(event_id):
    divisions = get_json(f"teams/{event_id}")
    players = []
    for d in divisions if isinstance(divisions, list) else divisions.get("Divisions", []):
        for t in d.get("Teams") or []:
            team = get_json(f"team/{t['ID']}")
            for p in team.get("Players") or []:
                if not p.get("ID"):
                    continue
                players.append({
                    "id": p["ID"],
                    "name": norm_name(p.get("FirstName") or "", p.get("LastName") or ""),
                    "dob": norm_dob(p.get("Dob") or p.get("DOB") or ""),
                })
    return players


def fill_dobs(players):
    """Fetch profile DOBs for players whose roster entry lacked one."""
    todo = [p for p in players if not p["dob"]]
    with cf.ThreadPoolExecutor(8) as ex:
        for p, dob in zip(todo, ex.map(lambda q: profile_dob(q["id"]), todo)):
            p["dob"] = dob


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("current_event")
    ap.add_argument("prior_event")
    ap.add_argument("--out", default="out-headshots")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    current = rosters(args.current_event)
    print(f"current event: {len(current)} players")

    # Pass 1: direct bucket fetch by current ID.
    def direct(p):
        return p, download(p["id"], os.path.join(args.out, p["id"] + ".jpg"))

    with cf.ThreadPoolExecutor(16) as ex:
        results = list(ex.map(direct, current))
    have = [p for p, ok in results if ok]
    need = [p for p, ok in results if not ok]
    print(f"direct bucket photos: {len(have)}; players still without: {len(need)}")

    if not need:
        write_summary(args.out, have, [], [], [])
        return 0

    # Pass 2: match the rest against the prior event by exact name + DOB.
    prior = rosters(args.prior_event)
    print(f"prior event: {len(prior)} players")
    fill_dobs(need)
    fill_dobs(prior)

    prior_by_name = {}
    for p in prior:
        prior_by_name.setdefault(p["name"], []).append(p)

    recovered, near_miss, not_found = [], [], []
    for p in need:
        candidates = prior_by_name.get(p["name"], [])
        exact = [c for c in candidates if p["dob"] and c["dob"] and c["dob"] == p["dob"]]
        if len(exact) == 1:
            old_id = exact[0]["id"]
            if download(old_id, os.path.join(args.out, p["id"] + ".jpg")):
                recovered.append((p["id"], old_id))
            else:
                not_found.append(p["id"])
        elif candidates:
            near_miss.append(p["id"])
        else:
            not_found.append(p["id"])

    print(f"recovered from prior event: {len(recovered)}")
    print(f"near-miss (name matched, DOB missing/ambiguous - confirm by hand): {len(near_miss)}")
    for pid in near_miss:
        print("  near-miss " + pid)
    print(f"no photo anywhere: {len(not_found)}")
    for pid in not_found:
        print("  missing " + pid)

    write_summary(args.out, have, recovered, near_miss, not_found)
    return 0


def write_summary(out, have, recovered, near_miss, not_found):
    """IDs-only machine summary next to the photos (safe: no names, no DOBs)."""
    summary = {
        "direct": sorted(p["id"] for p in have),
        "recovered": [{"currentId": c, "priorId": o} for c, o in sorted(recovered)],
        "nearMiss": sorted(near_miss),
        "missing": sorted(not_found),
    }
    with open(os.path.join(out, "recovery-summary.json"), "w") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    sys.exit(main())
