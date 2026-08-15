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

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "_raw"
SRC = ROOT / "sources"

# NYC DCP borough boundaries, water excluded, via Columbia University Libraries.
# Even the cartographic boundary counties keep a lot of water inside New York
# City — Manhattan is 31.7 sq mi in cb against 22.8 here, the island's actual
# land area. Optional: if the file is absent the build falls back to cb.
NYBB_GPKG = SRC / "nycp_nybb_2023.gpkg"


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


def boroughs(cb_counties, tiger_counties):
    """NYC boroughs from the DCP water-excluded file, falling back to cb.

    Two things happen here that are worth being explicit about.

    The county GEOID is recovered by spatially joining each borough to the
    TIGER counties rather than hard-coding BoroCode 1-5 to FIPS 061/005/047/
    081/085. The mapping is stable and well known, but deriving it from the
    geometry means the build cannot silently mislabel a borough, and the join
    fails loudly if it ever stops matching.

    The label is built as "Brooklyn (Kings County)" because the NYC step exists
    to teach that one place contains five counties. Showing both names in the
    hover readout makes the point before anyone reads the callout."""
    if not NYBB_GPKG.exists():
        print(f"  borough       using cb — {NYBB_GPKG.name} not found in sources/")
        return cb_counties

    d = gpd.read_file(NYBB_GPKG).to_crs(4326)
    pts = d.copy()
    pts["geometry"] = d.representative_point()
    j = gpd.sjoin(pts, tiger_counties.to_crs(4326)[["GEOID", "NAMELSAD", "geometry"]],
                  predicate="within", how="left")

    if j["GEOID"].isna().any():
        raise RuntimeError(f"borough join failed for {list(j[j.GEOID.isna()].BoroName)}")

    d = d.assign(GEOID=j["GEOID"].values,
                 NAME=j["BoroName"] + " (" + j["NAMELSAD"] + ")")
    return d


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
    # Cartographic boundary files (cb=True) rather than raw TIGER, everywhere
    # they exist. They are clipped to the coastline, which for New York removes
    # a lot of open water — 44% of Richmond County's TIGER extent, 32% of
    # Queens — and the Census describes them as "specifically designed for
    # small scale thematic mapping", which is exactly what this is.
    #
    # Caveat worth knowing: cb clips to the *outer* coastline, not to local
    # shorelines. Manhattan still loses only ~6%, so the Hudson out to the New
    # Jersey line stays inside the county. The NYC steps want DCP's
    # water-trimmed files instead; see SOURCES.md.
    #
    # `nation` and `divisions` are cb-only products already, so they take a
    # resolution but no cb flag. Blocks and roads have no cb equivalent at all.

    print("national frames")
    write(nation(year=YEAR, resolution="20m"), "nation")
    write(divisions(year=YEAR, resolution="20m"), "division")

    # 5m, not 20m: the 1:20,000,000 state file drops American Samoa, Guam, the
    # Northern Mariana Islands and the U.S. Virgin Islands, leaving 52 features
    # instead of 56. Losing the island areas from a tool that teaches what
    # counts as a state-equivalent would be the wrong trade for a smaller file.
    write(states(year=YEAR, cb=True, resolution="5m"), "state")

    print("new york state")
    # 500k for the New York frames — 20m is too coarse once the camera descends.
    ny = states(year=YEAR, cb=True, resolution="500k")
    write(ny[ny.GEOID == NY], "state-ny")
    write(counties(state=NY, year=YEAR, cb=True, resolution="500k"), "county-ny")
    write(congressional_districts(state=NY, year=YEAR, cb=True, resolution="500k"), "cd-ny")
    write(places(state=NY, year=YEAR, cb=True), "place-ny")

    print("new york city")
    co = counties(state=NY, year=YEAR, cb=True, resolution="500k")

    # Spatial filtering uses the *water-inclusive* TIGER counties, never the
    # trimmed ones. Filtering PUMAs against a shoreline-clipped borough
    # dropped three of the 55 whose representative point sits over water —
    # the mask defines "which features belong to NYC", not what gets drawn.
    co_full = counties(state=NY, year=YEAR)
    nyc_mask = co_full[co_full.COUNTYFP.isin(NYC_COUNTIES)]

    write(boroughs(co[co.COUNTYFP.isin(NYC_COUNTIES)], co_full),
          "borough", id_col="GEOID", name_col="NAME")

    # PUMAs download statewide; keep the ~55 that sit inside the five boroughs.
    #
    # No cb=True here: cartographic boundary PUMAs stop at 2019, and 2019 means
    # 2010-vintage PUMA boundaries — a different set of shapes, not a cleaner
    # version of these. Silently swapping vintages to get water trimming would
    # be trading a cosmetic problem for a factual one. Stays raw TIGER until
    # the DCP water-trimmed file replaces it.
    write(within(pumas(state=NY, year=YEAR), nyc_mask), "puma")

    if NTA_URL and CDTA_URL:
        write(gpd.read_file(NTA_URL), "nta")
        write(gpd.read_file(CDTA_URL), "cdta")
    else:
        print("  nta/cdta      skipped — set NTA_URL and CDTA_URL first")

    print("small areas")
    manhattan = co_full[co_full.COUNTYFP == DEMO_COUNTY]
    write(tracts(state=NY, county=DEMO_COUNTY, year=YEAR, cb=True), "tract")

    # 2020 ZCTAs are published nationally only — no state subset exists. Pull
    # the generalised cartographic boundary version (a fraction of the full
    # file, and we simplify anyway) and clip to Manhattan.
    write(within(zctas(year=YEAR, cb=True), manhattan), "zcta")

    write(block_groups(state=NY, county=DEMO_COUNTY, year=YEAR, cb=True), "block-group")

    # No cb equivalent exists for blocks — this stays raw TIGER, water and all.
    # The demo tract is inland so it doesn't show, but swap DEMO_TRACTS to a
    # waterfront tract and you will see it.
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
