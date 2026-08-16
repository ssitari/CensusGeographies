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
    regions, divisions, states, counties, places,
    metro_divisions,
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

# NYC census tracts carrying DCP's own identifiers alongside the federal GEOID:
# NTA2020, CDTA2020 and PUMA are all present, so the neighbourhood layers are
# aggregations of this one file rather than four separate downloads. Its
# citywide area is 302.1 sq mi, identical to the borough file, so the water
# treatment is consistent across every NYC layer.
NYCT_GPKG = SRC / "cul_nyc_tracts_2020.gpkg"

# Manhattan extracts of the citywide DCP block and Census block group files,
# cut by scripts/extract_sources.py — 22.8 MB of source reduced to 2.6 MB with
# no loss to anything the tour draws. Both measure 22.8 sq mi across Manhattan,
# matching the tract and borough files, so water treatment stays consistent.
NYCBG_GPKG = SRC / "nyc_blockgroups_manhattan.gpkg"
NYCBL_GPKG = SRC / "nyc_blocks_manhattan.gpkg"


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


def nyc_tracts():
    """NYC tracts from DCP, water excluded, or None if the file isn't present."""
    if not NYCT_GPKG.exists():
        print(f"  (no {NYCT_GPKG.name} in sources/ — NYC layers fall back to Census)")
        return None
    return gpd.read_file(NYCT_GPKG).to_crs(4326)


def aggregate(g, by, name_col, geoid=None):
    """Dissolve tracts into one of DCP's aggregate geographies.

    NTAs and CDTAs are defined as aggregations of 2020 census tracts, so
    dissolving on the tract file's own NTA2020 / CDTA2020 columns reproduces
    them exactly and keeps every NYC layer on identical geometry. Building them
    this way also means one source file and one citation instead of four."""
    out = g.dissolve(by=by, aggfunc="first").reset_index()
    out["GEOID"] = out[by] if geoid is None else geoid(out)
    out["NAME"] = out[name_col]
    return out


def write(gdf, name, id_col=None, name_col=None, extra=None):
    """Reproject to WGS 84, normalise to GEOID/NAME, write GeoJSON.

    Everything downstream — data.js, the GEOID readout, simplify.sh — assumes
    two properties named GEOID and NAME. Normalising here means the manifest
    stays honest and no layer needs a special case.

    `extra` keeps additional columns for layers that need them. Currently only
    the states, which carry STUSPS so the map can fall back to a postal
    abbreviation where the full name will not fit inside the state."""
    gdf = gdf.to_crs(4326)

    id_col = id_col or pick(gdf, "GEOID", "GEOID20", "GEOID10")

    # NAMELSAD before NAME on purpose: it carries the entity type, so the hover
    # readout says "Census Tract 15.01" and "New York city" rather than a bare
    # "15.01" that means nothing to a beginner. That distinction is the whole
    # subject of this tool, so it should be legible in the label.
    name_col = name_col or pick(gdf, "NAMELSAD", "NAMELSAD20", "NAMELSAD10",
                                "NAME", "NAME20", "FULLNAME", id_col)

    keep = [c for c in (extra or []) if c in gdf.columns]
    gdf = gdf[[id_col, name_col] + keep + ["geometry"]].copy()
    gdf.columns = ["GEOID", "NAME"] + keep + ["geometry"]

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

    # 5m, not 20m: the 1:20,000,000 state file drops American Samoa, Guam, the
    # Northern Mariana Islands and the U.S. Virgin Islands, leaving 52 features
    # instead of 56. Losing the island areas from a tool that teaches what
    # counts as a state-equivalent would be the wrong trade for a smaller file.
    st = states(year=YEAR, cb=True, resolution="5m").to_crs(4326)
    write(st, "state", extra=["STUSPS"])

    # Nation and divisions are dissolved from those same states rather than
    # downloaded separately. The published nation and division files are only
    # offered at 1:20m, so mixing them with 5m states made the coastline visibly
    # coarsen as the tour moved between steps, and left slivers where a
    # dissolved edge disagreed with the state boundary next to it. Dissolving
    # guarantees the three layers share an outline exactly.
    nat = st.dissolve().reset_index(drop=True)
    nat["GEOID"] = "US"
    nat["NAME"] = "United States"
    write(nat, "nation", id_col="GEOID", name_col="NAME")

    # Region and division membership by spatial join, not hard-coded state
    # lists. Each join assigns 51 of the 56: the five territories match
    # nothing, because they genuinely belong to no region or division. That is
    # a fact about census geography rather than a bug.
    pts = st.copy()
    pts["geometry"] = st.representative_point()

    def assign(parent, code, label):
        p = (parent[["GEOID", "NAME", "geometry"]]
             .rename(columns={"GEOID": code, "NAME": label}).to_crs(4326))
        j = gpd.sjoin(pts, p, predicate="within", how="left")
        out = st.loc[j[code].notna().values].copy()
        out[code] = j.loc[j[code].notna(), code].values
        out[label] = j.loc[j[code].notna(), label].values
        return out

    rg = assign(regions(year=YEAR, resolution="20m"), "REG", "REGNAME")
    region = rg.dissolve(by="REG", aggfunc="first").reset_index()
    write(region, "region", id_col="REG", name_col="REGNAME")

    dv = assign(divisions(year=YEAR, resolution="20m"), "DIV", "DIVNAME")
    # Carry the region through onto each division, so the hover readout says
    # "New England (Northeast)". Region boundaries are drawn on the map too,
    # but naming them here means the answer is available on any single click
    # rather than only by reading line weights.
    dv = dv.merge(rg[["GEOID", "REGNAME"]], on="GEOID", how="left")
    div = dv.dissolve(by="DIV", aggfunc="first").reset_index()
    div["LABEL"] = div["DIVNAME"] + " (" + div["REGNAME"] + ")"
    print(f"  (regions: {len(region)}, divisions: {len(div)}, from "
          f"{len(dv)} states; {len(st) - len(dv)} territories belong to none)")
    write(div, "division", id_col="DIV", name_col="LABEL")

    print("new york state")
    # Water-inclusive counties, used throughout as the mask for "which features
    # belong here" — never as something drawn. See the note at the boroughs.
    co_full = counties(state=NY, year=YEAR)

    # 500k for the New York frames — 20m is too coarse once the camera descends.
    ny = states(year=YEAR, cb=True, resolution="500k")
    write(ny[ny.GEOID == NY], "state-ny")
    write(counties(state=NY, year=YEAR, cb=True, resolution="500k"), "county-ny")

    # Congressional districts get a SHORT label in the conventional "NY-01"
    # form, which is what anyone looking one up will have seen. The state
    # abbreviation comes from the states table rather than a literal, so
    # repointing NY at another state does not silently mislabel every district.
    usps = dict(zip(st["GEOID"], st["STUSPS"]))
    cd = congressional_districts(state=NY, year=YEAR, cb=True, resolution="500k")
    cd["SHORT"] = cd["GEOID"].map(lambda g: f"{usps.get(g[:2], g[:2])}-{g[2:]}")
    write(cd, "cd-ny", extra=["SHORT"])
    # Places are drawn for the New York metro area rather than the whole state.
    # All 1,293 NY places at state scale is an unreadable stipple; the metro
    # still spans New York City against small villages, which is the range the
    # step exists to show.
    #
    # The metro *division* containing Manhattan, not the whole CBSA. The
    # New York-Newark-Jersey City CBSA runs east to Montauk, which pushes the
    # city into a corner of the frame and fills the rest with the East End.
    # The division stops at the Nassau line and keeps the city central.
    #
    # Found by point-in-polygon rather than by matching the name, because
    # metro names get restyled between vintages and geometry does not.
    cbsa = metro_divisions(year=YEAR).to_crs(4326)
    manhattan_pt = (co_full[co_full.COUNTYFP == DEMO_COUNTY]
                    .to_crs(4326).representative_point().iloc[0])
    here = cbsa[cbsa.contains(manhattan_pt)]
    if len(here) != 1:
        raise RuntimeError(f"expected one metro division over Manhattan, got {len(here)}")
    print(f"  (metro: {here.iloc[0]['NAMELSAD']})")

    pl = places(state=NY, year=YEAR, cb=True).to_crs(4326)
    # Only the New York side: the division reaches into New Jersey,
    # but this layer holds New York places, and an empty New Jersey beside a
    # dense New York would read as missing data rather than as a state line.
    # LSAD is kept so the map can label incorporated municipalities (25 city,
    # 47 village) and leave the CDPs unlabelled. A CDP is a statistical
    # convenience, not a municipality, and several on Long Island are large in
    # area while barely populated — ranking labels without excluding them puts
    # Calverton on the map ahead of Yonkers.
    write(within(pl, here), "place-metro", extra=["LSAD"])

    # Counties clipped to the same division, used as the backdrop for that step.
    # Drawing all 62 would leave Nassau and Suffolk sitting there in grey with
    # no places inside them, which reads as missing data rather than as an
    # extent that stops at the county line.
    write(within(counties(state=NY, year=YEAR, cb=True, resolution="500k"), here),
          "county-metro")

    print("new york city")
    co = counties(state=NY, year=YEAR, cb=True, resolution="500k")

    # Spatial filtering uses the *water-inclusive* TIGER counties, never the
    # trimmed ones. Filtering PUMAs against a shoreline-clipped borough
    # dropped three of the 55 whose representative point sits over water —
    # the mask defines "which features belong to NYC", not what gets drawn.
    nyc_mask = co_full[co_full.COUNTYFP.isin(NYC_COUNTIES)]

    write(boroughs(co[co.COUNTYFP.isin(NYC_COUNTIES)], co_full),
          "borough", id_col="GEOID", name_col="NAME")

    nyct = nyc_tracts()

    if nyct is None:
        # Fallback: TIGER PUMAs, water included AND 2010-vintage. See below.
        write(within(pumas(state=NY, year=YEAR), nyc_mask), "puma")
        print("  nta/cdta      skipped — needs the DCP tract file")
    else:
        # PUMAs are 2020 vintage, taken from the tract file's PUMA column.
        #
        # This matters more than it looks. pygris `pumas(year=2020)` returns a
        # GEOID10 column — those are 2010-vintage PUMAs, because 2020 PUMAs
        # were not delineated until 2022 and the TIGER 2020 release predates
        # them. Only 8 of 55 codes overlap between the two. Everything else in
        # this build is 2020 vintage, so the TIGER layer was quietly the odd
        # one out. Cross-checked: these 55 codes match TIGER 2022 and 2023
        # exactly.
        names = pumas(state=NY, year=2022)[["GEOID20", "NAMELSAD20"]]
        puma = aggregate(nyct, "PUMA", "PUMA",
                         geoid=lambda d: "36" + d["PUMA"].astype(str).str.zfill(5))
        puma = puma.merge(names, left_on="GEOID", right_on="GEOID20", how="left")
        puma["NAME"] = puma["NAMELSAD20"].fillna("PUMA " + puma["GEOID"])
        write(puma, "puma", id_col="GEOID", name_col="NAME")

        write(aggregate(nyct, "NTA2020", "NTAName"), "nta",
              id_col="GEOID", name_col="NAME")
        write(aggregate(nyct, "CDTA2020", "CDTANAME"), "cdta",
              id_col="GEOID", name_col="NAME")

    print("small areas")
    manhattan = co_full[co_full.COUNTYFP == DEMO_COUNTY]

    if nyct is None:
        write(tracts(state=NY, county=DEMO_COUNTY, year=YEAR, cb=True), "tract")
    else:
        # Same 310 GEOIDs as the Census cb file, verified, but 22.8 sq mi
        # instead of 31.7 — the cb tracts still carry the Hudson out to the
        # New Jersey line.
        man = nyct[nyct.GEOID.str.startswith(NY + DEMO_COUNTY)].copy()
        man["NAME"] = "Census Tract " + man["CTLabel"].astype(str)
        write(man, "tract", id_col="GEOID", name_col="NAME")

    # 2020 ZCTAs are published nationally only — no state subset exists. Pull
    # the generalised cartographic boundary version (a fraction of the full
    # file, and we simplify anyway) and clip to Manhattan.
    write(within(zctas(year=YEAR, cb=True), manhattan), "zcta")

    if NYCBG_GPKG.exists():
        # 1,278 features against the Census cb file's 1,286: the difference is
        # water-only block groups, which have no land and nothing to teach.
        write(gpd.read_file(NYCBG_GPKG), "block-group")
    else:
        write(block_groups(state=NY, county=DEMO_COUNTY, year=YEAR, cb=True),
              "block-group")

    if NYCBL_GPKG.exists():
        bl = gpd.read_file(NYCBL_GPKG)
        bl = bl[bl["CT2020"].isin(DEMO_TRACTS)].copy()
        bl["NAME"] = "Block " + bl["CB2020"].astype(str)
        write(bl, "block", id_col="GEOID", name_col="NAME")
    else:
        # Fallback is raw TIGER — no cb equivalent exists for blocks, so this
        # branch carries water. The demo tract is inland so it does not show,
        # but repoint DEMO_TRACTS at a waterfront tract and it will.
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
