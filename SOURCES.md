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
- **The remaining NYC layers still carry water**, measured against DCP
  Manhattan at 22.8 mi²: cb tracts and cb block groups are both 31.7 mi²
  (+38.9%), and TIGER PUMAs across the city are 346.5 mi² against 302.1
  (+14.7%). Worth replacing with DCP equivalents. Not visually obvious, because
  water tracts fill the same colour as land — trust the measurement, not the
  screenshot.
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
