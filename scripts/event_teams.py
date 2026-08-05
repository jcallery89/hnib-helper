#!/usr/bin/env python3
"""Print an event's teams as CSV: division, team, coach, jersey colors.

Colors come from the team's PrimaryRGB/SecondaryRGB, normalized to hex and
labeled with the nearest common jersey-color name. Everything here is public
event info (hnib.app lists it), so stdout is safe for CI logs.

Usage: python scripts/event_teams.py EVENT_ID
"""

import argparse
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recover_headshots as rh

NAMED_COLORS = {
    "white": (255, 255, 255),
    "black": (0, 0, 0),
    "gray": (128, 128, 128),
    "navy": (16, 30, 80),
    "royal blue": (65, 105, 225),
    "light blue": (173, 216, 230),
    "teal": (0, 128, 128),
    "green": (0, 128, 0),
    "dark green": (0, 80, 40),
    "red": (220, 30, 50),
    "maroon": (128, 0, 0),
    "orange": (255, 120, 0),
    "gold": (218, 165, 32),
    "yellow": (255, 221, 0),
    "purple": (110, 0, 130),
    "pink": (255, 105, 180),
    "brown": (139, 69, 19),
}


def parse_color(c):
    """Normalize '#rrggbb', 'rrggbb', or 'r,g,b' to (r, g, b); None if unknown."""
    v = (c or "").strip()
    m = re.match(r"^#?([0-9a-fA-F]{6})$", v)
    if m:
        n = int(m.group(1), 16)
        return ((n >> 16) & 255, (n >> 8) & 255, n & 255)
    m = re.match(r"^(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})$", v)
    if m:
        return tuple(min(255, int(x)) for x in m.groups())
    return None


def color_name(rgb):
    if rgb is None:
        return ""
    return min(NAMED_COLORS, key=lambda n: sum((a - b) ** 2 for a, b in zip(NAMED_COLORS[n], rgb)))


def to_hex(rgb):
    return "#%02x%02x%02x" % rgb if rgb else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_id")
    args = ap.parse_args()

    w = csv.writer(sys.stdout)
    w.writerow(["Division", "Team", "Coach", "Primary", "PrimaryName", "Secondary", "SecondaryName"])
    divisions = rh.get_json(f"teams/{args.event_id}")
    for d in divisions if isinstance(divisions, list) else []:
        for t in d.get("Teams") or []:
            team = rh.get_json(f"team/{t['ID']}")
            primary = parse_color(team.get("PrimaryRGB"))
            secondary = parse_color(team.get("SecondaryRGB"))
            w.writerow([
                (d.get("Name") or "").strip(),
                (t.get("Name") or "").strip(),
                (t.get("Coach") or team.get("Coach") or "").strip(),
                to_hex(primary), color_name(primary),
                to_hex(secondary), color_name(secondary),
            ])
    return 0


if __name__ == "__main__":
    sys.exit(main())
