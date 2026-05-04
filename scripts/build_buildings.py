#!/usr/bin/env python3
"""
Paginate NYC Building Footprints (Socrata `5zhs-2jue`) into NDJSON.
Filters height_roof > 0, keeps only geometry + height_roof + bbl.
Output: data/buildings.ndjson  (one Feature per line, ready for tippecanoe)
"""
import json
import os
import sys
import urllib.request
import urllib.parse

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "buildings.ndjson")
LIMIT = 50000
BASE = "https://data.cityofnewyork.us/resource/5zhs-2jue.geojson"

def page(offset):
    qs = urllib.parse.urlencode({
        "$select": "the_geom,height_roof,mappluto_bbl",
        "$where": "height_roof>0",
        "$order": ":id",
        "$limit": LIMIT,
        "$offset": offset,
    }, safe="$")
    req = urllib.request.Request(f"{BASE}?{qs}", headers={"User-Agent": "nyc-people-vs-buildings"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def main():
    total = 0
    with open(OUT, "w") as f:
        offset = 0
        while True:
            data = page(offset)
            feats = data.get("features", [])
            if not feats:
                break
            for ft in feats:
                props = ft.get("properties") or {}
                hr = props.get("height_roof")
                if hr is None:
                    continue
                try:
                    hrn = float(hr)
                except (TypeError, ValueError):
                    continue
                if hrn <= 0:
                    continue
                slim = {
                    "type": "Feature",
                    "geometry": ft.get("geometry"),
                    "properties": {"h": round(hrn, 1), "bbl": props.get("mappluto_bbl") or ""},
                }
                f.write(json.dumps(slim, separators=(",", ":")) + "\n")
                total += 1
            sys.stderr.write(f"offset={offset} chunk={len(feats)} total={total}\n")
            sys.stderr.flush()
            if len(feats) < LIMIT:
                break
            offset += LIMIT
    print(f"wrote {total} features to {OUT}")

if __name__ == "__main__":
    main()
