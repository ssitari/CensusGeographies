#!/usr/bin/env python3
"""
build_data.py — fetch the boundary files the tour needs and write them to
data/_raw/ as WGS 84 GeoJSON. Run scripts/simplify.sh afterwards to simplify
and convert to the TopoJSON the app actually loads.

    pip install pygris geopandas
    python scripts/build_data.py
    bash scripts/simplify.sh

Census layers come through pygris, which constructs the TIGER/Line URLs itself
— that is deliberate. Hand-written census.gov URLs rot and are easy to get
subtly wrong (wrong vintage, wrong resolution), and a wrong file here is a
wrong fact on the page.

The two NYC DCP layers are the exception: they are not Census products and
pygris knows nothing about them. Their URLs are marked UNVERIFIED below and
must be confirmed against the DCP open data page before you trust them.

Everything is 2020 vintage. This tool illustrates the *idea* of each geography,
so the vintage is pinned and labelled rather than chased.
"""

import pathlib
import geopandas as gpd
from pygris import (
    nation, divisions, states, counties, places,
    congressional_districts, pumas, tracts, block_groups, blocks,
    zctas, roads,
)

YEAR = 2020
NY = "36"
NYC_COUNTIES = ["005", "047", "061", "081", "085"]  # Bronx, Kings, NY, Queens, Richmond

# The one neighbourhood that gets blocks and streets. Manhattan tract 014500
# is a placeholder — swap in whichever tract you want to teach with.
DEMO_COUNTY = "061"
DEMO_TRACTS = ["014500"]

# --- UNVERIFIED: confirm both against https://www.nyc.gov/site/planning/data-maps/open-data.page
NTA_URL = None   # 2020 Neighborhood Tabulation Areas
CDTA_URL = None  # 2020 Community District Tabulation Areas

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "_raw"


def pick(gdf, *candidates):
    """First column that actually exists. TIGER suffixes the tabulation
    geographies (GEOID20, NAME20) but not the legal ones, and the pattern is
    not consistent across vintages — so ask the dataframe instead of guessing."""
    for c in candidates:
        if c in gdf.columns:
            return c
    raise KeyError(f"none of {candidates} in {list(gdf.columns)[:12]}")


def within(gdf, mask, how="inner"):
    """Keep only features whose centroid falls inside `mask`.

    Several layers can only be downloaded at a larger extent than we want to
    draw — PUMAs come statewide, and 2020 ZCTAs are national-only. Filtering
    spatially rather than by ID range means we are not hard-coding code ranges
    that change between vintages."""
    m = mask.to_crs(4326).geometry.union_all()
    g = gdf.to_crs(4326)
    # Centroid test, not intersects: a ZCTA that merely grazes Manhattan
    # shouldn't be drawn as if it belonged to it.
    pts = g.geometry.representative_point()
    return g[pts.within(m)].copy() if how == "inner" else g


def write(gdf, name, id_col=None, name_col=None):
    """Reproject to WGS 84, normalise to GEOID/NAME, write GeoJSON.

    Everything downstream — data.js, the GEOID readout, simplify.sh — assumes
    exactly two properties named GEOID and NAME. Normalising here means the
    manifest stays honest and no layer needs a special case."""
    gdf = gdf.to_crs(4326)

    id_col = id_col or pick(gdf, "GEOID", "GEOID20", "GEOID10")

    # NAMELSAD before NAME on purpose: it carries the entity type, so the hover
    # readout says "Census Tract 15.01" and "New York city" rather than a bare
    # "15.01" that means nothing to a beginner. That distinction is the whole
    # subject of this tool, so it should be legible in the label.
    name_col = name_col or pick(gdf, "NAMELSAD", "NAMELSAD20", "NAMELSAD10",
                                "NAME", "NAME20", "FULLNAME", id_col)

    gdf = gdf[[id_col, name_col, "geometry"]].copy()
    gdf.columns = ["GEOID", "NAME", "geometry"]

    OUT.mkdir(parents=True, exist_ok=True)
    gdf.to_file(OUT / f"{name}.geojson", driver="GeoJSON")
    print(f"  {name:14s} {len(gdf):>7,} features")


def main():
    print("national frames")
    write(nation(year=YEAR), "nation")
    write(divisions(year=YEAR), "division")
    write(states(year=YEAR), "state")

    print("new york state")
    ny = states(year=YEAR)
    write(ny[ny.GEOID == NY], "state-ny")
    write(counties(state=NY, year=YEAR), "county-ny")
    write(congressional_districts(state=NY, year=YEAR), "cd-ny")
    write(places(state=NY, year=YEAR), "place-ny")

    print("new york city")
    co = counties(state=NY, year=YEAR)
    nyc = co[co.COUNTYFP.isin(NYC_COUNTIES)]
    write(nyc, "borough")

    # PUMAs download statewide; keep the ~55 that sit inside the five boroughs.
    write(within(pumas(state=NY, year=YEAR), nyc), "puma")

    if NTA_URL and CDTA_URL:
        write(gpd.read_file(NTA_URL), "nta")
        write(gpd.read_file(CDTA_URL), "cdta")
    else:
        print("  nta/cdta      skipped — set NTA_URL and CDTA_URL first")

    print("small areas")
    manhattan = co[co.COUNTYFP == DEMO_COUNTY]
    write(tracts(state=NY, county=DEMO_COUNTY, year=YEAR), "tract")

    # 2020 ZCTAs are published nationally only — no state subset exists. Pull
    # the generalised cartographic boundary version (a fraction of the full
    # file, and we simplify anyway) and clip to Manhattan.
    write(within(zctas(year=YEAR, cb=True), manhattan), "zcta")

    write(block_groups(state=NY, county=DEMO_COUNTY, year=YEAR), "block-group")

    bl = blocks(state=NY, county=DEMO_COUNTY, year=YEAR)
    tract_col = pick(bl, "TRACTCE20", "TRACTCE10", "TRACTCE")
    bl = bl[bl[tract_col].isin(DEMO_TRACTS)]
    write(bl, "block")

    # Streets, clipped to the block extent. Without these a block is an
    # unreadable blob; with them it is obviously a city block.
    rd = roads(state=NY, county=DEMO_COUNTY, year=YEAR).to_crs(4326)
    write(gpd.clip(rd, tuple(bl.to_crs(4326).total_bounds)), "roads",
          id_col="LINEARID", name_col="FULLNAME")

    print(f"\nwrote to {OUT}\nnow run: bash scripts/simplify.sh")


if __name__ == "__main__":
    main()
