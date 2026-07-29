#!/usr/bin/env python3
"""Build public/headshots/ for an event: photos + manifest.js.

Tourno keeps player photos in a public GCS bucket keyed by player ID, but the
bucket sends no CORS headers, so the app re-hosts photos same-origin and looks
them up via headshots/manifest.js (window.HNIB_HEADSHOTS). This script:

  1. Pulls the event's rosters from the Tourno API.
  2. Checks the bucket for each player's photo (.jpg/.jpeg/.png).
  3. Downloads hits into public/headshots/{playerId}.jpg, converting the
     ~25% of bucket files that are PNG bytes under a .jpg name (needs Pillow;
     without Pillow they are saved as-is, which browsers still render).
  4. Regenerates manifest.js from the FULL folder contents, so photos from
     other events (or recovered older photos saved under this year's player
     IDs) are preserved.

Usage:
  python scripts/fetch_headshots.py EVENT_ID [--out public/headshots]

Privacy note: do NOT commit the downloaded photos or any name+DOB match data
to this public repo; public/headshots/ is gitignored on purpose. Upload the
folder to the server next to index.html instead.

Requires network access to hnib.app and storage.googleapis.com (run it on a
machine that has it; the cloud dev sandbox may not).
"""

import argparse
import concurrent.futures as cf
import json
import os
import sys
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
        print(f"  note: {os.path.basename(path)} is not JPEG bytes and Pillow is missing; left as-is")
        return
    Image.open(path).convert("RGB").save(path, "JPEG", quality=90)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_id")
    ap.add_argument("--out", default="public/headshots")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    divisions = get_json(f"teams/{args.event_id}")
    team_ids = [t["ID"] for d in divisions for t in d.get("Teams", [])]
    players = []
    for tid in team_ids:
        team = get_json(f"team/{tid}")
        players.extend(p["ID"] for p in team.get("Players", []) if p.get("ID"))
    print(f"{len(team_ids)} teams, {len(players)} players")

    def fetch(pid):
        ext = bucket_ext(pid)
        if not ext:
            return pid, False
        dest = os.path.join(args.out, pid + ".jpg")
        req = urllib.request.Request(BUCKET + pid + ext, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
            f.write(r.read())
        to_true_jpeg(dest)
        return pid, True

    with cf.ThreadPoolExecutor(16) as ex:
        results = list(ex.map(fetch, players))
    found = [pid for pid, ok in results if ok]
    missing = [pid for pid, ok in results if not ok]
    print(f"downloaded {len(found)}, missing {len(missing)}")

    ids = sorted(fn[:-4] for fn in os.listdir(args.out) if fn.endswith(".jpg"))
    manifest = {i: f"./headshots/{i}.jpg" for i in ids}
    with open(os.path.join(args.out, "manifest.js"), "w") as f:
        f.write("window.HNIB_HEADSHOTS=" + json.dumps(manifest) + ";")
    print(f"manifest.js: {len(manifest)} entries (full folder)")

    if missing:
        print("players with no bucket photo (consider name+DOB matching against")
        print("prior events' rosters - see docs/HEADSHOTS.md):")
        for pid in missing:
            print("  " + pid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
