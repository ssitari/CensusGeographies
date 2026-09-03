# Census Geographies — A Guided Tour through selected (NYC-centric) census geographies

This website is a short interactive demonstration of select geographies used for US Census data, in particular the Decennial Census and the American Community Survey (ACS). Built initially for the [Columbia University Libraries census research guide](https://guides.library.columbia.edu/census), this guide is designed for researchers and students that are complete novices to working with Census geographies.  

To be sure, this guide is non-comprehensive and only includes a limited sample of geographic types.  It is designed with a NYC-centric audience and includes neighborhood delineations (including NTAs and CDTAs) that may not be applicable to other parts of the US.  That said, all data here is open for reuse with attribution.

Built with [D3.js](https://d3js.org). No build step required — plain HTML, CSS,
and ES modules.

---

## Live demo

[View on GitHub Pages](https://ssitari.github.io/CensusGeographies/)

---

## What it does

The website highlights 15 different geographies on 13 different pages, navigated with prev/next buttons or the arrow keys, each page highlighting a single geography and explaining what it is, typical size, and identifiers. A few population and income totals or estimates are provided to give an idea of the typical size (and MOEs) of the units.  Every step has its own URL fragment, so a guide can link straight to `#puma`.  The geographies are ordered approximately and imperfectly in terms of hierarchy.  There is also a hierarchical schematic to the left of the page which indicates the relationships of the variant geographies, this schematic may be used to navigate through the pages. 

The design rests on two decisions worth stating plainly:

**It teaches the idea, not the boundaries.** Geometry is heavily simplified and
pinned to the 2020 vintage. If a tract is redrawn in 2030 the tool is not
wrong — it was never claiming to be a data browser. The vintage is stated in the
footer so nobody mistakes it for one.

**Nesting is shown, not implied.** The census hierarchy is not a clean tree, and
most introductions hide that. Every step carries a `nests in` badge reading
`state ✓ · county ✗`, stated in words rather than encoded in a color key the
reader would have to learn.

**One set of marks, every frame.** The step's own geography is a red outline;
the called-out example is a translucent blue wash; whatever lies underneath is
grey with white edges; the canvas is lighter than that grey. Six consecutive
steps then frame the same few blocks of Morningside Heights, so what changes
between them is the boundaries, not the styling.

The six steps that matter most to a beginner — PUMAs, NTAs and CDTAs, ZCTAs,
tracts, block groups, blocks — are marked as key levels and get a fuller
treatment.

Hovering any unit decomposes its GEOID into labelled runs
(`36061014500` → `36` state · `061` county · `014500` tract), which is the
fastest way to make an opaque identifier legible.

When possible, the same hover also shows 2020 Census population
plus ACS 1-year and 5-year estimates — with margins of error — and median
household income. Gaps show rather than hide: tracts and block groups always
read "not published at this level" for the 1-year figures, which is the
Census's own rule (below the sampling threshold, always), not a hole in the
data. That gap is most of the point — a beginner sees directly which
geographies are too small for annual estimates, rather than being told.

---

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page shell and all styling |
| `app.js` | The engine — stepper, projections, rendering, GEOID readout |
| `steps.js` | **All content.** The only file to edit when writing the tour |
| `data.js` | Manifest mapping layer keys to TopoJSON files |
| `scripts/extract_sources.py` | Cuts large citywide GeoPackages down to `sources/` |
| `scripts/build_data.py` | Fetches boundaries via `pygris` → `data/_raw/*.geojson` |
| `scripts/simplify.sh` | Simplifies and converts to `data/*.json` (TopoJSON) |
| `scripts/check_data.mjs` | Validates the built data against `data.js` and `steps.js` |
| `scripts/attach_population.py` | Attaches 2020 Census / ACS stats to the built data |
| `SOURCES.md` | Citation log — every published fact gets a row |

Same split as the choropleth tools in this account: `app.js` is the engine,
`steps.js` is the config. Missing data files are non-fatal — the app renders a
placeholder for that step, so the tour and the data pipeline can be built in
either order.

---

## Writing the tour

Each step in `steps.js` has a callout with these fields. Labels on the page
are plain-language, aimed at the research guide audience rather than a GIS
one; the field names in the code (in parentheses below) are the technical
ones and haven't changed, so this is also the map from what you see on the
page back to what to edit in `steps.js`.

- **What is it?** (`size`) — population or count range, quoted verbatim from the source
- **What can you get?** (`acs`) — which ACS products publish this level
- **What are the IDs?** (`geoid`) — the digit pattern and a worked example
- **What else should I know?** (`gotcha`) — the one thing people get wrong

These labels are the one piece of UI copy likely to get revised by whoever
edits this tour next — they live in a single place, the four `field(...)`
calls in `renderCallout()` in `app.js`, so relabeling again later is a
four-line change.

Unfilled fields carry the `TODO` sentinel and render on the page in red as
*not written yet*, so unfinished copy is impossible to ship by accident.

**House rule: no factual field gets written from memory.** Sizes, thresholds and
GEOID patterns come from Census or DCP documentation, the URL goes in `source`,
and a row goes in `SOURCES.md` at the same time. All fields across all 13 steps
are filled in; `SOURCES.md` carries a citation for every factual claim.

---

## Building the data

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install pygris geopandas   # Windows
# source .venv/bin/activate && pip install pygris geopandas  # macOS/Linux

.venv/Scripts/python.exe scripts/build_data.py   # → data/_raw/*.geojson

npm install mapshaper
bash scripts/simplify.sh                          # → data/*.json
node scripts/check_data.mjs                       # validate

export CENSUS_API_KEY=...                          # free: census.gov/data/key_signup.html
.venv/Scripts/python.exe scripts/attach_population.py  # writes stats onto data/*.json
```

The last step attaches 2020 Census totals plus ACS 1-year and 5-year
population (with margins of error) and median household income to every
hoverable layer it can — see that script's docstring for exactly which
levels get which product, and why congressional districts are pinned to
2021 rather than the current year. Requires a
[free Census API key](https://api.census.gov/data/key_signup.html); never
commit it — the script reads it from the `CENSUS_API_KEY` environment
variable only.

Census layers come through `pygris` so the TIGER/Line URLs are constructed
rather than hand-written. The two NYC DCP layers (NTAs, CDTAs) are not Census
products — their URLs are marked `UNVERIFIED` in `build_data.py` and need
confirming against the DCP open data page before use.

Two layers can't be downloaded at the extent we draw them and are filtered
spatially instead of by ID range, so the code survives a vintage change:
PUMAs come statewide, and **2020 ZCTAs are published nationally only** — there
is no state subset. Both are cut to NYC by centroid.

`check_data.mjs` is worth running after any change to `steps.js`. It verifies
each TopoJSON object is named as `data.js` expects, that properties normalised
to `GEOID`/`NAME`, and — the useful one — that each step's declared GEOID
pattern sums to the digit count actually present in the data. It also reports
how many callout fields are still unwritten.

`data/_raw/`, `.venv/` and `node_modules/` are gitignored; only the simplified
TopoJSON is committed.

Current build: 18 layers, ~1.1 MB of TopoJSON, no network calls after load.

---

## Running locally

ES modules are loaded over `fetch()`, so this must be served over HTTP —
opening `index.html` as a `file://` URL will not work.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

---

## Embedding in LibGuides

Add a Media/Widget box and paste an iframe pointing at the Pages URL. Add
`#puma` or any other step id to open the guide at a specific level.

**When this moves to the CUL RDS organization**, the iframe `src` in LibGuides
is the one thing that has to change by hand. Everything in this repo uses
relative paths and there is no `CNAME` file, so the move itself is just a new
remote and a push.

---

## Libraries and tools

| Library | Use | License |
|---|---|---|
| [D3.js v7](https://d3js.org) | Projection, rendering, transitions | ISC |
| [TopoJSON](https://github.com/topojson/topojson) | Compact boundary encoding | BSD-3 |
| [pygris](https://walker-data.com/pygris/) | TIGER/Line access | MIT |
| [mapshaper](https://mapshaper.org) | Simplification and conversion | MPL-2.0 |

---

## Licensing and attribution

Two different things are licensed here and they should not be conflated.

### The code — MIT

`index.html`, `app.js`, `steps.js`, `data.js` and the scripts are MIT, © 2026
Eric Glass. See [LICENSE](LICENSE). All four runtime and build dependencies are
MIT-compatible: D3 (ISC), TopoJSON (BSD-3-Clause), pygris (MIT), mapshaper
(MPL-2.0 — a build tool, not redistributed in the published page).

### The boundary data — U.S. Census Bureau, public domain

> "Copyright protection is not available for any work of the United States
> Government (Title 17 U.S.C., Section 105). Thus, you are free to reproduce
> census materials as you see fit. We would ask, however, that you cite the
> Census Bureau as the source."
>
> — [2020 TIGER/Line Technical Documentation, ch. 1](https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2020/TGRSHP2020_TechDoc_Ch1.pdf)

So the derived TopoJSON in `data/` is not encumbered and redistributing it
under this repo is fine. There are three obligations attached, and all three
are met in the page footer rather than buried here:

1. **Cite the Census Bureau as the source.** Requested, not required.
2. **Trademark.** TIGER/Line® is a registered trademark of the Census Bureau
   and "may only be used to refer to the nature of such a product" — it cannot
   appear in a product name. Hence *Census Geographies*, not *TIGER Explorer*.
3. **Conspicuous statement on repackaging.** The Bureau "requests that any
   repackaging of the TIGER/Line Shapefile data […] include a conspicuously
   placed statement to this effect on the product's cover, the first page of
   the website, or elsewhere of comparable visibility." This is why the
   disclaimer sits in the always-visible footer and not behind a toggle.
   Don't move it.

The accuracy disclaimer is reproduced too: boundaries are "for statistical data
collection and tabulation purposes only", do not constitute "a determination of
jurisdictional authority or rights of ownership", and are "not legal land
descriptions". Given that this tool deliberately over-simplifies geometry, that
disclaimer is more than pro forma — it is accurate.

### The NYC layers — NYC Department of City Planning

Every New York City layer comes from two DCP files obtained through Columbia
University Libraries, both committed under `sources/`:

> New York (N.Y.). Department of City Planning. *New York City Boroughs, 2023.*
> [geodata.library.columbia.edu/catalog/columbia-nycp-nybb-2023](https://geodata.library.columbia.edu/catalog/columbia-nycp-nybb-2023)

> New York (N.Y.). Department of City Planning and Columbia University
> Libraries. *New York City Census Tracts with Multiple Tract Identifiers,
> 2020.* [geodata.library.columbia.edu/catalog/columbia-cul-nyc-tracts-2020](https://geodata.library.columbia.edu/catalog/columbia-cul-nyc-tracts-2020)

Both catalog records list rights as *None* and access as *public*. They are
committed rather than downloaded at build time so the pipeline cannot break
when a URL moves; the build falls back to Census layers if either is absent.

The tract file carries `NTA2020`, `CDTA2020` and `PUMA` columns beside the
federal `GEOID`, so tracts, NTAs, CDTAs and PUMAs are all dissolves of that one
file. That keeps every NYC layer on identical geometry and reduces four
citations to one.

Block groups and blocks come from two further CUL/DCP files. Those arrive
citywide and are cut to Manhattan by `scripts/extract_sources.py` before being
committed — 22.8 MB reduced to 2.6 MB, with no loss to anything the tour draws.
The committed extracts are therefore not the published files, which
[SOURCES.md](SOURCES.md) records explicitly.

Every NYC layer now measures 22.8 mi² across Manhattan — tracts, block groups,
blocks and the borough file all agree — so no Census layer carrying open water
remains inside the city.

### Written copy

The callout text is yours. Where it quotes Census or DCP documentation it is
quoted verbatim and cited in `SOURCES.md`, which is the point of that file.

---

## Acknowledgements

Most of the code written with assistance from [Claude](https://claude.ai) (Anthropic).

---

## License

Code MIT (see [LICENSE](LICENSE)). Boundary data is a work of the U.S.
Government and not subject to copyright; see *Licensing and attribution* above.
