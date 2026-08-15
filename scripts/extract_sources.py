#!/usr/bin/env python3
"""
extract_sources.py — cut the large citywide GeoPackages down to the extent the
tour actually draws, and write the results into sources/.

    .venv/Scripts/python.exe scripts/extract_sources.py

Run this once, when a new source file arrives. The trimmed outputs are what
gets committed; the citywide originals stay local and are gitignored.

Why not just commit the originals: the block file is 16 MB and the block group
file is 6 MB, against roughly 300 KB for both extracts. The tour draws blocks
for a single tract and block groups for a single borough, so the rest is weight
a reader downloads and a repository carries for no benefit.

Why Manhattan rather than a single tract for both: block groups are drawn for
the whole borough, and keeping all Manhattan blocks means DEMO_TRACTS in
build_data.py can be repointed at a different neighbourhood without going back
to the original file.

Provenance for the extracts is in SOURCES.md — trimming does not change what
the data is, but it does mean the committed file is not the published one, and
that should never be silently true.
"""

import pathlib
import geopandas as gpd

ROOT = pathlib.Path(__file__).resolve().parent.parent
IN = ROOT / "data"       # where the full citywide files were dropped
OUT = ROOT / "sources"   # what gets committed

MANHATTAN_FIPS = "061"
MANHATTAN_BORO = "1"

JOBS = [
    # (input file, output name, filter)
    ("census_nyc_2020_blockgroups.gpkg", "nyc_blockgroups_manhattan.gpkg",
     lambda g: g[g["COUNTYFP"] == MANHATTAN_FIPS]),
    ("nycp_2020_blocks.gpkg", "nyc_blocks_manhattan.gpkg",
     lambda g: g[g["BoroCode"] == MANHATTAN_BORO]),
]


def main():
    OUT.mkdir(exist_ok=True)
    for src, dst, keep in JOBS:
        p = IN / src
        if not p.exists():
            print(f"  skip {src} — not in {IN.name}/")
            continue

        g = gpd.read_file(p)
        sub = keep(g).to_crs(4326)
        out = OUT / dst
        sub.to_file(out, driver="GPKG", layer=out.stem)

        mb_in = p.stat().st_size / 1e6
        mb_out = out.stat().st_size / 1e6
        print(f"  {dst:34s} {len(g):>6,} -> {len(sub):>6,} features   "
              f"{mb_in:5.1f} MB -> {mb_out:4.1f} MB")


if __name__ == "__main__":
    main()
