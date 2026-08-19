#!/usr/bin/env python3
"""
attach_population.py — pull 2020 Decennial totals plus ACS 1-year and 5-year
population (with margins of error) and median household income, and write
them directly onto the properties of the already-built TopoJSON files.

    export CENSUS_API_KEY=...        (never commit this)
    python scripts/attach_population.py

Runs *after* build_data.py and simplify.sh — it edits data/*.json in place
rather than touching the geometry pipeline, so a bad API response or a
revoked key can never break the map itself, only the stats layered on top.

Every property this script writes is documented in data.js and consumed by
app.js's showReadout(). Missing data is not a bug: it is the majority of
what this script is actually teaching. ACS 1-year is never published for
tracts or block groups, and never for a place or county under about 65,000
people — those cells are meant to come back empty, and the readout shows
"not published at this level" rather than a number. That gap is exactly what
makes hovering a hamlet versus New York City instructive.

Two deliberate exceptions to "just use the latest year":

  Congressional districts. NY redistricted in 2022 — the boundaries this
  tour draws (pygris's 2020-vintage cb file) are the pre-2022, 27-district
  116th Congress map, the same map the 2020 Census itself was tabulated
  against. Every ACS vintage from 2022 onward reports on the *current*
  26-district map, a different set of shapes with the same district
  numbers. Joining that data onto these boundaries by district number would
  silently attach the wrong population to several districts. Verified by
  querying every vintage back to 2019: 2021 is the last year (both ACS1 and
  ACS5) still tabulated on 27 districts. CD's ACS figures pin to 2021 for
  this reason; POP20 already matches by construction, since the 2020 Census
  reference date falls inside the 116th Congress.

  Blocks. No ACS product has ever existed at the block level, by rule, not
  by omission. POP20 is the only figure blocks get.
"""

import json
import os
import time
import pathlib
import urllib.request
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data"

KEY = os.environ.get("CENSUS_API_KEY")
if not KEY:
    raise SystemExit("Set CENSUS_API_KEY first — see the docstring. Never commit it.")

NY = "36"
DEMO_COUNTY = "061"

# Every vintage in this build is 2024 except congressional districts — see
# the module docstring for why.
ACS_YEAR = 2024
CD_ACS_YEAR = 2021

POP_VARS = "B01003_001E,B01003_001M"
INC_VARS = "B19013_001E,B19013_001M"

# Census MOE sentinels for "not computed" / "not applicable" — never real
# numbers. Anything at or below this magnitude gets treated as absent.
SENTINEL_FLOOR = 500000000


def clean(v):
    if v is None:
        return None
    n = int(v)
    return None if abs(n) >= SENTINEL_FLOOR else n


def fetch(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def acs(year, dataset, geo_for, geo_in=None):
    """One ACS call, both population and income in one request. Returns
    {geo_tuple: {pop, pop_moe, inc, inc_moe}}, keyed by whatever the trailing
    geography columns are — caller reassembles the real GEOID."""
    params = {"get": f"NAME,{POP_VARS},{INC_VARS}", "for": geo_for, "key": KEY}
    if geo_in:
        params["in"] = geo_in
    url = f"https://api.census.gov/data/{year}/acs/{dataset}?" + urllib.parse.urlencode(params, safe=":*,+")
    try:
        rows = fetch(url)
    except Exception as e:
        print(f"    acs/{dataset} {year} {geo_for} -> {e}")
        return {}
    header, *data = rows
    idx = {h: i for i, h in enumerate(header)}
    out = {}
    for row in data:
        key = tuple(row[idx[c]] for c in header if c not in ("NAME",) + tuple(POP_VARS.split(",")) + tuple(INC_VARS.split(",")))
        out[key] = {
            "pop": clean(row[idx["B01003_001E"]]),
            "pop_moe": clean(row[idx["B01003_001M"]]),
            "inc": clean(row[idx["B19013_001E"]]),
            "inc_moe": clean(row[idx["B19013_001M"]]),
        }
    return out


def decennial(geo_for, geo_in=None):
    params = {"get": "P1_001N", "for": geo_for, "key": KEY}
    if geo_in:
        params["in"] = geo_in
    url = f"https://api.census.gov/data/2020/dec/pl?" + urllib.parse.urlencode(params, safe=":*,+")
    try:
        rows = fetch(url)
    except Exception as e:
        print(f"    dec/pl {geo_for} -> {e}")
        return {}
    header, *data = rows
    idx = {h: i for i, h in enumerate(header)}
    out = {}
    for row in data:
        key = tuple(row[idx[c]] for c in header if c not in ("NAME", "P1_001N"))
        out[key] = clean(row[idx["P1_001N"]])
    return out


def build_lookup(geoid_fn, acs1, acs5, dec, year):
    """Merge decennial + acs1 + acs5 dicts (all keyed by the same geography
    tuple) into one {GEOID: {...}} table using geoid_fn to build the real
    GEOID string from that tuple."""
    keys = set(acs1) | set(acs5) | set(dec)
    out = {}
    for k in keys:
        geoid = geoid_fn(k)
        a1, a5 = acs1.get(k), acs5.get(k)
        out[geoid] = {
            "POP20": dec.get(k),
            "ACS1_POP": a1["pop"] if a1 else None,
            "ACS1_POP_M": a1["pop_moe"] if a1 else None,
            "ACS1_INC": a1["inc"] if a1 else None,
            "ACS1_INC_M": a1["inc_moe"] if a1 else None,
            "ACS5_POP": a5["pop"] if a5 else None,
            "ACS5_POP_M": a5["pop_moe"] if a5 else None,
            "ACS5_INC": a5["inc"] if a5 else None,
            "ACS5_INC_M": a5["inc_moe"] if a5 else None,
            "ACS_YEAR": year,
        }
    return out


def merge_into_file(rel_path, object_name, lookup, id_field="GEOID"):
    p = OUT / rel_path
    if not p.exists():
        print(f"  skip {rel_path} — not built")
        return
    topo = json.loads(p.read_text(encoding="utf-8"))
    geoms = topo["objects"][object_name]["geometries"]
    hit = 0
    for g in geoms:
        row = lookup.get(g["properties"].get(id_field))
        if row:
            g["properties"].update(row)
            hit += 1
    p.write_text(json.dumps(topo, separators=(",", ":")), encoding="utf-8")
    print(f"  {rel_path:22s} {object_name:10s} {hit:>5}/{len(geoms):<5} features matched")


def main():
    print(f"national frames — decennial 2020, ACS {ACS_YEAR}")
    dec = decennial("us:*")
    a1 = acs(ACS_YEAR, "acs1", "us:*")
    a5 = acs(ACS_YEAR, "acs5", "us:*")
    # Single-feature levels: no real key-matching needed, just attach directly.
    nation_row = build_lookup(lambda k: "US", a1, a5, dec, ACS_YEAR)
    lookup = {"US": next(iter(nation_row.values()))} if nation_row else {}
    merge_into_file("national.json", "nation", lookup)

    dec = decennial("division:*")
    a1 = acs(ACS_YEAR, "acs1", "division:*")
    a5 = acs(ACS_YEAR, "acs5", "division:*")
    lookup = build_lookup(lambda k: k[-1], a1, a5, dec, ACS_YEAR)
    merge_into_file("national.json", "division", lookup)

    dec = decennial("state:*")
    a1 = acs(ACS_YEAR, "acs1", "state:*")
    a5 = acs(ACS_YEAR, "acs5", "state:*")
    lookup = build_lookup(lambda k: k[-1], a1, a5, dec, ACS_YEAR)
    print(f"  (states/territories matched: {len(lookup)} of 56 — no ACS or decennial API")
    print(f"   product covers the five territories under this endpoint, same five")
    print(f"   Albers USA can't draw; see the map's own off-map notice)")
    merge_into_file("national.json", "state", lookup)

    print(f"\nnew york state")
    dec = decennial("county:*", f"state:{NY}")
    a1 = acs(ACS_YEAR, "acs1", "county:*", f"state:{NY}")
    a5 = acs(ACS_YEAR, "acs5", "county:*", f"state:{NY}")
    lookup = build_lookup(lambda k: NY + k[-1], a1, a5, dec, ACS_YEAR)
    merge_into_file("county-ny.json", "county", lookup)
    county_lookup = lookup  # boroughs share this exactly — they ARE these counties

    print(f"  congressional districts — pinned to {CD_ACS_YEAR}, see docstring")
    dec = decennial("congressional district:*", f"state:{NY}")
    a1 = acs(CD_ACS_YEAR, "acs1", "congressional district:*", f"state:{NY}")
    a5 = acs(CD_ACS_YEAR, "acs5", "congressional district:*", f"state:{NY}")
    lookup = build_lookup(lambda k: NY + k[-1].zfill(2), a1, a5, dec, CD_ACS_YEAR)
    merge_into_file("cd-ny.json", "cd", lookup)

    dec = decennial("place:*", f"state:{NY}")
    a1 = acs(ACS_YEAR, "acs1", "place:*", f"state:{NY}")
    a5 = acs(ACS_YEAR, "acs5", "place:*", f"state:{NY}")
    lookup = build_lookup(lambda k: NY + k[-1].zfill(5), a1, a5, dec, ACS_YEAR)
    merge_into_file("place-metro.json", "place", lookup)

    merge_into_file("borough.json", "borough", county_lookup)

    print(f"\nnew york city")
    dec = decennial("public use microdata area:*", f"state:{NY}")
    a1 = acs(ACS_YEAR, "acs1", "public use microdata area:*", f"state:{NY}")
    a5 = acs(ACS_YEAR, "acs5", "public use microdata area:*", f"state:{NY}")
    lookup = build_lookup(lambda k: NY + k[-1].zfill(5), a1, a5, dec, ACS_YEAR)
    merge_into_file("puma.json", "puma", lookup)

    print(f"\nsmall areas")
    dec = decennial("zip code tabulation area:*")
    a1 = acs(ACS_YEAR, "acs1", "zip code tabulation area:*")
    a5 = acs(ACS_YEAR, "acs5", "zip code tabulation area:*")
    lookup = build_lookup(lambda k: k[-1], a1, a5, dec, ACS_YEAR)
    merge_into_file("zcta.json", "zcta", lookup)

    tract_in = f"state:{NY}+county:{DEMO_COUNTY}"
    dec = decennial("tract:*", tract_in)
    a1 = acs(ACS_YEAR, "acs1", "tract:*", tract_in)
    a5 = acs(ACS_YEAR, "acs5", "tract:*", tract_in)
    lookup = build_lookup(lambda k: NY + DEMO_COUNTY + k[-1].zfill(6), a1, a5, dec, ACS_YEAR)
    merge_into_file("tract.json", "tract", lookup)

    bg_in = f"state:{NY}+county:{DEMO_COUNTY}+tract:*"
    dec = decennial("block group:*", bg_in)
    a5 = acs(ACS_YEAR, "acs5", "block group:*", bg_in)  # ACS1 never exists here
    lookup = build_lookup(lambda k: NY + DEMO_COUNTY + k[-2].zfill(6) + k[-1], {}, a5, dec, ACS_YEAR)
    merge_into_file("block-group.json", "bg", lookup)

    # Blocks: decennial only, no ACS product has ever existed at this level.
    block_in = f"state:{NY}+county:{DEMO_COUNTY}+tract:020500"
    dec = decennial("block:*", block_in)
    lookup = {
        NY + DEMO_COUNTY + "020500" + k[-1].zfill(4): {
            "POP20": v, "ACS1_POP": None, "ACS1_POP_M": None, "ACS1_INC": None, "ACS1_INC_M": None,
            "ACS5_POP": None, "ACS5_POP_M": None, "ACS5_INC": None, "ACS5_INC_M": None, "ACS_YEAR": None,
        }
        for k, v in dec.items()
    }
    merge_into_file("block.json", "block", lookup)

    print("\ndone")


if __name__ == "__main__":
    main()
