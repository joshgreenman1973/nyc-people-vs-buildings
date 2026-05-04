#!/usr/bin/env python3
"""
Join NYC 2020 Census blocks GeoJSON (DCP shoreline-clipped, dataset wmsu-5muw)
to Census 2020 P1_001N (total population) by 15-digit GEOID.

Computes pop_per_acre using shape_area (square feet, NY State Plane Long Island ft).
1 acre = 43,560 sq ft.

Drops blocks with population == 0 to keep file size down and avoid visual noise.

Output: data/blocks_pop.ndjson  (one Feature per line, ready for tippecanoe)
"""
import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
BLOCKS_IN = os.path.join(DATA, "blocks_raw.geojson")
P1_IN = os.path.join(DATA, "p1_raw.json")
OUT = os.path.join(DATA, "blocks_pop.ndjson")

def main():
    with open(P1_IN) as f:
        p1 = json.load(f)
    header = p1[0]
    idx = {k: i for i, k in enumerate(header)}
    pop = {}
    for row in p1[1:]:
        geo = row[idx["GEO_ID"]]
        # GEO_ID is "1000000USnnnnnnnnnnnnnnn" — last 15 digits = GEOID20
        geoid = geo.split("US")[-1]
        try:
            pop[geoid] = int(row[idx["P1_001N"]])
        except (TypeError, ValueError):
            pop[geoid] = 0

    with open(BLOCKS_IN) as f:
        blocks = json.load(f)

    kept = 0
    dropped_no_match = 0
    dropped_zero = 0
    with open(OUT, "w") as out:
        for ft in blocks["features"]:
            p = ft.get("properties") or {}
            geoid = p.get("geoid")
            if not geoid:
                continue
            popcount = pop.get(geoid)
            if popcount is None:
                dropped_no_match += 1
                continue
            if popcount == 0:
                dropped_zero += 1
                continue
            try:
                area_sqft = float(p.get("shape_area") or 0)
            except (TypeError, ValueError):
                area_sqft = 0
            if area_sqft <= 0:
                continue
            acres = area_sqft / 43560.0
            # Drop blocks smaller than 0.1 acres. These are typically
            # measurement-noise polygons (single-lot remnants) where
            # pop/acre divides into unreliable extremes.
            if acres < 0.1:
                continue
            ppa = popcount / acres
            slim = {
                "type": "Feature",
                "geometry": ft.get("geometry"),
                "properties": {
                    "p": popcount,                 # total population
                    "ppa": round(ppa, 1),          # persons per acre
                    "ac": round(acres, 3),         # acres
                    "boro": p.get("boroname") or "",
                    "geoid": geoid,
                },
            }
            out.write(json.dumps(slim, separators=(",", ":")) + "\n")
            kept += 1

    sys.stderr.write(
        f"kept={kept}  dropped_no_match={dropped_no_match}  dropped_zero_pop={dropped_zero}\n"
    )
    print(f"wrote {kept} features to {OUT}")

if __name__ == "__main__":
    main()
