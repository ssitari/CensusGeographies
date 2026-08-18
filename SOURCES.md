# Sources

Every factual claim in `steps.js` gets a row here before it ships. If a field
is filled in but has no row below, that's a bug — the whole point of this file
is that a reader in 2030 can check whether a number is still true.

Quote verbatim where possible. Paraphrase drifts.

| Step | Field | Value as published | Source | Checked |
|---|---|---|---|---|
| tract | Typical size | "generally have a population size between 1,200 and 8,000 people, with an optimum size of 4,000 people" | [Census Geography Program Glossary](https://www.census.gov/programs-surveys/geography/about/glossary.html) | 2026-08-15 |
| tract | Status | Statistical — "small, relatively permanent statistical subdivisions of a county or statistically equivalent entity" | [Census Geography Program Glossary](https://www.census.gov/programs-surveys/geography/about/glossary.html) | 2026-08-15 |
| block-group | Typical size | "generally defined to contain between 600 and 3,000 people" | [Census Geography Program Glossary](https://www.census.gov/programs-surveys/geography/about/glossary.html) | 2026-08-15 |

## Terms of use — checked 2026-08-15

| Source | Status | Obligation |
|---|---|---|
| NYC Boroughs 2023 (`sources/nycp_nybb_2023.gpkg`) | Rights: None; access: public | New York (N.Y.). Department of City Planning, *New York City Boroughs, 2023*. Via Columbia University Libraries, [geodata.library.columbia.edu/catalog/nycp-nybb-2023](https://geodata.library.columbia.edu/catalog/nycp-nybb-2023) |
| NYC Census Tracts 2020 (`sources/cul_nyc_tracts_2020.gpkg`) | Rights: None; access: public | New York (N.Y.). Department of City Planning and Columbia University Libraries, *New York City Census Tracts with Multiple Tract Identifiers, 2020*. [geodata.library.columbia.edu/catalog/cul-nyc-tracts-2020](https://geodata.library.columbia.edu/catalog/cul-nyc-tracts-2020) |
| NYC Block Groups 2020 — **Manhattan extract** (`sources/nyc_blockgroups_manhattan.gpkg`) | Via Columbia University Libraries | Cut from `census_nyc_2020_blockgroups` by `scripts/extract_sources.py`. Confirm the catalog record before publishing a citation. |
| NYC Blocks 2020 — **Manhattan extract** (`sources/nyc_blocks_manhattan.gpkg`) | Via Columbia University Libraries | Cut from `nycp_2020_blocks` (NYC DCP) by `scripts/extract_sources.py`. Confirm the catalog record before publishing a citation. |
| Place population (`sub-est2024.csv`) | Public domain (U.S. Government work) | U.S. Census Bureau, *Subcounty Resident Population Estimates*, vintage 2024. Column `ESTIMATESBASE2020` = the April 1, 2020 estimates base. [Direct download](https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv) |
| Census TIGER/Line | Public domain — "Copyright protection is not available for any work of the United States Government (Title 17 U.S.C., Section 105)" | Cite the Bureau; trademark notice; conspicuous statement on repackaging — all in the page footer. [Tech doc ch. 1](https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2020/TGRSHP2020_TechDoc_Ch1.pdf) |
| NYC Open Data | No warranty of "completeness, accuracy, content, or fitness for any particular purpose"; agencies may add terms | Confirm DCP's own terms before enabling the NTA/CDTA layers. [Overview](https://opendata.cityofnewyork.us/overview/) |

## Vintages actually built — checked 2026-08-15

Recorded because a couple of these will read as errors later if the reason
isn't written down.

- Everything is `year=2020` via `pygris`.
- **Cartographic boundary files, not raw TIGER**, wherever they exist. TIGER
  includes open water out to the legal boundary, which looks wrong at every
  scale and is unusable for NYC. Measured effect on the boroughs:

  | Borough | TIGER mi² | CB mi² | water removed |
  |---|---|---|---|
  | Richmond | 102.9 | 57.7 | 43.9% |
  | Queens | 181.5 | 123.1 | 32.2% |
  | Kings | 96.8 | 79.3 | 18.1% |
  | Bronx | 57.4 | 47.5 | 17.1% |
  | New York | 33.9 | 31.7 | 6.3% |

  Manhattan's 6.3% is the tell: **cb clips to the outer coastline, not to local
  shorelines**, so the Hudson out to the New Jersey line stays inside the
  county. The NYC steps still want DCP's water-trimmed files.
- **PUMAs stay raw TIGER.** Cartographic boundary PUMAs stop at 2019, and 2019
  means 2010-vintage PUMAs — different shapes, not cleaner ones. Not worth
  trading a cosmetic problem for a factual one.
- **Blocks and roads have no cb equivalent** and stay raw TIGER. The demo tract
  is inland so no water shows; a waterfront tract would.
- **States are built at 1:5,000,000, not 1:20,000,000.** The 20m file omits
  American Samoa, Guam, the Northern Marianas and the U.S. Virgin Islands —
  52 features instead of 56.
- **Only 51 of those 56 actually draw.** `d3.geoAlbersUsa` covers the lower 48,
  Alaska and Hawaii and returns null elsewhere, so Puerto Rico and the island
  areas cannot be placed. The app counts them and shows a notice on the map
  rather than dropping them silently. If the states callout cites a count, say
  which count it is.
- **Boroughs come from NYC DCP, not Census.** Cartographic boundary counties
  still keep the Hudson out to the New Jersey line. Measured against the DCP
  water-excluded file, in square miles:

  | Borough | TIGER | CB | DCP | further gain |
  |---|---|---|---|---|
  | Manhattan | 33.9 | 31.7 | 22.8 | 28.0% |
  | Brooklyn | 96.9 | 79.3 | 69.4 | 12.6% |
  | Queens | 181.5 | 123.1 | 109.1 | 11.4% |
  | Bronx | 57.4 | 47.5 | 42.6 | 10.4% |
  | Staten Island | 102.9 | 57.7 | 58.2 | −0.9% |

  The county GEOID is recovered by spatial join rather than hard-coding
  BoroCode 1–5 to FIPS, so a mislabel fails loudly instead of silently. Labels
  read "Brooklyn (Kings County)" to make the inversion visible on hover.
  Simplified at 1.5% rather than 8%: the DCP file has ~83k vertices where the
  Census layers arrive pre-generalized.
- **Tracts, NTAs, CDTAs and PUMAs all come from one DCP file.** The tract file
  carries `NTA2020`, `CDTA2020` and `PUMA` columns beside the federal `GEOID`,
  and NTAs are defined as aggregations of 2020 tracts, so the neighbourhood
  layers are dissolves of that file rather than separate downloads. Yields 262
  NTAs, 71 CDTAs, 55 PUMAs. Citywide area is 302.1 mi², identical to the
  borough file, so water treatment is consistent across every NYC layer.
  Manhattan tract GEOIDs were verified identical to the Census cb set (310 of
  310) — same tracts, 22.8 mi² instead of 31.7.
- **PUMAs are 2020 vintage, and this was previously wrong.** `pygris
  pumas(year=2020)` returns a `GEOID10` column: those are *2010*-vintage PUMAs,
  because 2020 PUMAs were not delineated until 2022 and the TIGER 2020 release
  predates them. Only 8 of 55 codes overlap between the two sets. The DCP
  file's codes match TIGER 2022 and 2023 at 55 of 55. Everything else in the
  build is 2020 vintage, so the old layer was silently the odd one out.
- **Block groups and blocks now come from DCP/CUL too**, and every NYC layer
  measures 22.8 mi² across Manhattan — tracts, block groups, blocks, and the
  borough file all agree. No Census layer with water remains inside the city.
  Block groups are 1,278 features against the Census cb file's 1,286; the
  difference is water-only block groups, which have no land and nothing to
  teach.
- **The committed NYC block and block group files are extracts, not the
  published files.** `scripts/extract_sources.py` cuts the citywide originals
  to Manhattan: 22.8 MB reduced to 2.6 MB, with no loss to anything the tour
  draws. Trimming does not change what the data is, but the committed file is
  not the distributed one, and that should never be silently true.
- **The DCP PUMA file is not used.** It measures 302.1 mi², identical to
  dissolving the tract file on its own PUMA column, so the dissolve already
  reproduces it and carries names the standalone file lacks.

- **Place population comes from the estimates series, not the API.** The Census
  API now returns "Missing Key" for keyless requests, so population is read
  from the subcounty estimates CSV, which is a plain download. The field used
  is `ESTIMATESBASE2020` — the April 1, 2020 base, i.e. the 2020 census count
  carried into the estimates series, which is the right vintage for a tour
  pinned to 2020. Covers incorporated places (SUMLEV 162) only: 595 in New
  York. CDPs have no population here, and are not labelled anyway.
- **New York city 8,805,594; Yonkers 211,575.** Those are the only two places
  in the metro at or above 200,000, which is what the Places step labels. Next
  largest in the metro is New Rochelle at 79,751, so the threshold has a wide
  margin before it starts adding labels.

## Verified structure — checked 2026-08-15

Computed from `sources/cul_nyc_tracts_2020.gpkg`, not recalled. These are the
kind of claims a callout will want to make, so they are measured and dated.

- **NTAs nest perfectly within CDTAs**: 0 of 262 NTAs span more than one CDTA.
  CDTAs contain 1 to 9 NTAs, mean 3.7. So a CDTA is an aggregate of NTAs, which
  are themselves aggregates of tracts.
- **Two CDTAs cross borough lines**, which is why CDTA totals will not sum to
  borough totals for the three boroughs involved:
  - `BX08` Riverdale-Kingsbridge-Marble Hill — Bronx and Manhattan
  - `QN01` Astoria-Queensbridge — Bronx and Queens
- **4 regions, 9 divisions**, both dissolved from the 5m states and assigned by
  spatial join. Regions: West 13 states, South 17 (incl. DC), Midwest 12,
  Northeast 9.
- **The five territories belong to no region or division.** Assigning states to
  divisions by spatial join matches 51 of 56; American Samoa, Guam, the
  Northern Marianas, Puerto Rico and the U.S. Virgin Islands match nothing.
  That is a fact about census geography, not a gap in the data, and it is the
  same five that `d3.geoAlbersUsa` cannot draw. Division counts by name:
  South Atlantic 9, Mountain 8, West North Central 7, New England 6, East North
  Central 5, Pacific 5, East South Central 4, West South Central 4, Middle
  Atlantic 3.
- **PUMA 03802 is now 3604109.** The Columbia area — Manhattan Community
  District 9, Morningside Heights and Hamilton Heights — was PUMA 03802 under
  the 2010 vintage. The 2020 delineation renumbered it. The old code does not
  appear anywhere in the current layer, so anyone searching for 03802 in recent
  ACS microdata will find nothing. Worth being the gotcha on that step.
- **NTAs do *not* nest within PUMAs**: 4 of 262 span a PUMA boundary
  (`BK1502`, `BK1704`, `BX0702`, `BX0802`). Worth knowing before writing any
  callout that implies the local and federal statistical geographies line up.
- **The two county-crossing CDTAs cross for different reasons — checked
  2026-08-16.** Drafting a relationship diagram surfaced this; it wasn't
  previously verified at the NTA level, only the CDTA level.
  - `BX08` crosses because one of its own NTAs, `BX0802`, itself spans the
    Bronx and Manhattan — the Marble Hill anomaly. Of all 262 NTAs, this is
    the *only* one that spans two counties.
  - `QN01` crosses for an unrelated reason: it contains `QN0151` (Rikers
    Island), an NTA that sits wholly within the Bronx but carries a
    Queens-family code. No NTA-level crossing there — the mismatch is
    between the NTA's borough and its code prefix, not its geometry.
  - So "NTAs nest in County" is true for 261 of 262, not all of them — don't
    round that up to "always" in a callout.
- **Spatial filters use water-inclusive TIGER masks**, never the trimmed cb
  ones — filtering PUMAs against a shoreline-clipped borough silently dropped
  3 of 55 whose representative point sits over water.
- **Congressional districts: 27 features.** That is the 116th Congress, the
  districts in effect for the 2020 vintage. New York has had 26 districts since
  the 2022 redistricting. Either state the Congress explicitly in the callout
  or rebuild against a later vintage — but do not leave it ambiguous.
- **ZCTAs are national-only for 2020.** No state subset is published; the build
  pulls the generalized cartographic-boundary file and clips to Manhattan (69
  features). This is the one layer where the download extent and the drawn
  extent differ most.
- **PUMAs: 55** inside the five boroughs, filtered spatially from 145 statewide.
- **Blocks: 12**, all within Manhattan tract 014500, with 29 clipped road
  segments. Swap `DEMO_TRACTS` in `build_data.py` to teach with a different one.

## Still to source

Everything else. The fields that most need care, roughly in order of how often
they get stated wrong:

- **ACS product coverage per level** — which levels appear in 1-year vs. 5-year
  estimates, and the population threshold that governs it. This is the single
  most common point of confusion and must be quoted, not remembered.
- **PUMA minimum population** and how PUMAs relate to tracts.
- **ZCTA construction** — how they are built from blocks, and why they are not
  ZIP Codes.
- **NTA / CDTA definitions** — from NYC DCP, not Census. Includes the caveat
  that CDTAs cross borough boundaries for the Bronx, Queens and Manhattan, and
  DCP's own note that NTAs are not intended to definitively represent
  neighborhoods.
- **Congressional district vintage** — which Congress the boundaries are for.
  This one dates faster than anything else on the page.
- **GEOID digit patterns** for every level except tract, block group and block.

## Useful starting points

- [Census Geography Program Glossary](https://www.census.gov/programs-surveys/geography/about/glossary.html)
- [Geographic Areas Reference Manual (GARM)](https://www.census.gov/programs-surveys/geography/guidance/geographic-areas-reference-manual.html)
- [Understanding Geographic Identifiers (GEOIDs)](https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html)
- [NYC Department of City Planning open data](https://www.nyc.gov/site/planning/data-maps/open-data.page)
