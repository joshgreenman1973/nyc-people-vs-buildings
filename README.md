# NYC: residential density vs. built environment

A 3D map of New York City with two views you can toggle between:

- **Residential** — extrudes 2020 Census blocks by people per acre.
- **Built** — extrudes ~1.08 million building footprints by their actual roof height in feet.

Same map, two different stories. Tall buildings are not the same as crowded neighborhoods.

Inspired by [Shahnab/topographical-explorer](https://github.com/Shahnab/topographical-explorer), but built with MapLibre GL + PMTiles instead of Three.js because NYC is fundamentally a vector problem (40K + 1M polygons).

## Stack

- [MapLibre GL JS](https://maplibre.org/) — 3D `fill-extrusion` layers
- [PMTiles](https://github.com/protomaps/PMTiles) — single static vector-tile files served from GitHub Pages
- [tippecanoe](https://github.com/felt/tippecanoe) — tile generation
- CARTO Voyager raster basemap

## Data

| Layer | Source | Rows | Tile file |
|---|---|---|---|
| Residential blocks | NYC DCP 2020 Census Blocks (`wmsu-5muw`) joined to Census P1 (P.L. 94-171) | 30,692 (zero-pop blocks dropped) | `data/pop_blocks.pmtiles` (3.5 MB) |
| Building footprints | NYC DoITT Building Footprints (`5zhs-2jue`), `height_roof > 0` only | 1,082,139 | `data/buildings.pmtiles` (~69 MB) |

See [methodology.html](methodology.html) for full details, ramps, and limitations.

## Run locally

PMTiles needs an HTTP server that supports byte-range requests. Python's built-in `http.server` does not.

```sh
python3 scripts/serve.py 8867
# open http://localhost:8867
```

## Rebuild data

```sh
python3 scripts/build_population.py     # blocks + Census P1 -> blocks_pop.ndjson
python3 scripts/build_buildings.py      # paginated SODA pull -> buildings.ndjson
tippecanoe -zg --drop-densest-as-needed -l blocks    -o data/pop_blocks.pmtiles data/blocks_pop.ndjson
tippecanoe -zg --no-feature-limit --no-tile-size-limit --simplification=8 -l buildings -o data/buildings.pmtiles data/buildings.ndjson
```

The buildings download is ~30 minutes (~22 paginated SODA calls of 50k features each).
