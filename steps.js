// ─────────────────────────────────────────────────────────────────────────────
//  steps.js — ALL CONTENT LIVES HERE. This is the only file you need to edit.
//  (app.js is the engine; leave it alone unless you're changing how the tool
//  behaves rather than what it says.)
//
//  HOUSE RULE: never write a factual field from memory. Every `size`, `acs`,
//  and `geoid` value must come from Census or DCP documentation, and the URL
//  it came from goes in `source`. Log it in SOURCES.md at the same time.
//  Anything not yet verified stays as the TODO sentinel — the app renders
//  those visibly so unfinished copy can't quietly ship.
// ─────────────────────────────────────────────────────────────────────────────

export const TODO = "TODO";

// Vintage stamp shown in the page footer. This is a teaching tool, not a data
// browser: boundaries are illustrative and deliberately over-simplified.
export const VINTAGE_NOTE =
  "Boundaries shown are 2020-vintage and simplified for legibility. " +
  "They illustrate the shape and scale of each geography, not its exact extent.";

// Which levels the nesting badge reports against, in order.
export const NEST_KEYS = ["nation", "state", "county", "tract"];

// ─────────────────────────────────────────────────────────────────────────────
//  STEP SCHEMA
//
//  id        unique slug; also the deep link (#tract)
//  label     what appears in the stepper and the callout header
//  scope     short line under the label: where the camera is
//  layer     key into DATA (see data.js manifest) — the geography being taught
//  context   layer keys drawn beneath, dimmed, for orientation
//  fit       layer key the camera fits to (defaults to `layer`)
//  projection  "albers-usa" for the national frames, "local" once inside NY
//  emphasis  true for the steps that matter most to a novice audience —
//            the app gives these a fuller callout treatment
//
//  callout:
//    status    "Legal" | "Statistical" | "Locally defined"
//    nests     object keyed by NEST_KEYS; true = nests cleanly, false = crosses
//              boundaries, null = not applicable at this level
//    size      typical population / count range, VERBATIM from the source
//    acs       which ACS products publish it
//    geoid     { pattern, example, parts: [[label, chars], ...] } — powers the
//              map's hover readout (the coloured digit chunks) and is
//              validated by scripts/check_data.mjs. Not shown directly in
//              the callout; `ids` below is what readers see.
//    ids       prose for "What are the IDs?" — the digit/code pattern in
//              words, e.g. "5 digit FIPS code including state (36061)".
//              Usually restates geoid.example inline, so the two agree.
//    gotcha    ERIC WRITES THESE. The one thing people get wrong.
//    source    URL the factual fields came from
// ─────────────────────────────────────────────────────────────────────────────

export const STEPS = [
  {
    id: "nation",
    label: "The Nation",
    scope: "United States",
    layer: "nation",
    context: [],
    projection: "albers-usa",
    callout: {
      status: "Legal",
      nests: { nation: null, state: null, county: null, tract: null },
      size: "Not surprisingly, the broadest geographic unit is the entire country",
      acs: "Decennial Census totals and ACS estimates for all samples",
      // TIGER gives the nation feature the literal GEOID "US", not a digit.
      geoid: { pattern: "US", example: "US", parts: [["nation", 2]] },
      ids: "No FIPS code, summary level 010",
      gotcha: "National level downloads include data for all 50 states and Washington D.C. (not Puerto Rico or other territories, which will need separate extraction).",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "region-division",
    label: "Regions & Divisions",
    scope: "United States",
    layer: "division",
    // Three levels in one frame, ordered by weight so they stay separable:
    // faint white state lines (recognisable shapes to read the rest through),
    // medium division edges, heavy region boundaries on top. Without the
    // region lines the step names something the map never shows.
    // Division labels also carry their region — "New England (Northeast)" —
    // so a single hover answers it without decoding line weights.
    context: [],
    overlay: ["state", "region"],
    // Region first: earlier entries win the space when two labels collide, so
    // a division is what gets nudged, never a region.
    labels: ["region", "division"],
    projection: "albers-usa",
    callout: {
      status: "Statistical",
      nests: { nation: true, state: null, county: null, tract: null },
      size: "The Census divides the 50 states into four regions, which are in turn comprised of nine divisions.",
      acs: "Decennial Census totals and ACS estimates for all samples",
      geoid: { pattern: "D", example: "1", parts: [["division", 1]] },
      ids: "No FIPS code, summary level 020 (region) and 030 (division)",
      gotcha: "These definitions are generally persistent and primarily used by the Census itself to represent what it considers to be socioeconomically and culturally coherent areas. Your mileage will vary.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "state",
    label: "States",
    scope: "United States",
    layer: "state",
    context: [],
    labels: ["state"],
    // Every label must sit wholly inside its own state. Where a name will not
    // fit, the postal abbreviation is used instead, and where even that will
    // not fit the label is dropped — the same call a printed atlas makes for
    // Rhode Island. Hovering still names any state.
    labelFit: "inside",
    // New Jersey's "NJ" label lands right on the Columbia marker at this
    // scale. Dropped rather than nudged — hovering still names the state.
    labelExclude: ["34"],
    projection: "albers-usa",
    callout: {
      status: "Legal",
      nests: { nation: true, state: null, county: null, tract: null },
      size: "The first-level administrative districts in the US.",
      acs: "Decennial Census totals and ACS estimates for all samples",
      geoid: { pattern: "SS", example: "36", parts: [["state", 2]] },
      ids: "2 digit FIPS code (NY is 36), summary level 040",
      gotcha: "The 50 states and Washington DC. These tend to be persistent. U.S. territories use the same leading 2-digit FIPS pattern and tend to be treated the same way in most databases.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },

  {
    id: "county",
    label: "Counties",
    scope: "New York State",
    // First step in the local projection now that the New York State frame is
    // gone: the camera descends straight from the national view to the counties.
    transition: true,
    layer: "county-ny",
    context: ["state-ny"],
    projection: "local",
    // The only step with a map title — every other step's own label already
    // says what's on screen via the stepper and callout header, but a wall of
    // 62 unlabelled counties benefits from stating the state outright.
    title: "New York State",
    // No labelFit: "inside" here, unlike state/CD — tried it, and it drops
    // every single county at this zoom (62 shapes across one state frame are
    // too small on average for a full "___ County" name to fit wholly inside
    // its own polygon). Left unconstrained, 51 of 62 place cleanly; the rest
    // stay reachable on hover, same fallback as everywhere else labels drop.
    labels: ["county-ny"],
    // Queens County's label lands right on the Columbia marker at this
    // scale. Dropped rather than nudged — hovering still names the county.
    labelExclude: ["36081"],
    callout: {
      status: "Legal",
      nests: { nation: true, state: true, county: null, tract: null },
      size: "The second-level administrative districts.",
      acs: "Decennial Census totals and ACS 5-year samples. 1-year samples for larger counties.",
      geoid: { pattern: "SSCCC", example: "36061", parts: [["state", 2], ["county", 3]] },
      ids: "5 digit FIPS code including the state code (New York County is 36061), summary level 050",
      gotcha: "These tend to be persistent. Nest in and wholly comprise states, including water surfaces. Counties range very widely in population — from under 100 to almost 10 million — so ACS 1-year and 3-year samples are only available for larger counties. Second-level administrative units that aren't counties (parishes in Louisiana, for example) still show up here.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "congressional-district",
    label: "Congressional Districts",
    scope: "New York State",
    layer: "cd-ny",
    context: ["county-ny"],
    // Only districts with room get labelled, which upstate mostly means yes and
    // in the city mostly means no. That is the honest picture: the districts
    // too small to label are exactly the ones drawn tightest around population.
    labels: ["cd-ny"],
    labelFit: "inside",
    projection: "local",
    callout: {
      status: "Legal",
      nests: { nation: true, state: true, county: false, tract: null },
      size: "US House of Representatives political districts.",
      acs: "Decennial Census totals and ACS estimates for all samples",
      geoid: { pattern: "SSDD", example: "3623", parts: [["state", 2], ["district", 2]] },
      ids: "4 digit FIPS code (NY's northernmost CD is 3621), summary level 500",
      gotcha: "The Decennial Census is used to inform the delineation of Congressional (and other state legislative) districts, and also uses those districts to release summaries. By law, Congressional Districts have roughly similar populations — currently over 700,000 people — and are redrawn at least every 10 years. Redistricting has become more common than that in practice. State legislative district summaries are also available.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "msa",
    label: "Metro Area",
    scope: "New York-Newark-Jersey City, NY-NJ-PA",
    layer: "msa",
    // The 23 counties this MSA is built from — 10 in New York, 12 in New
    // Jersey, 1 in Pennsylvania (Pike County) — drawn as context underneath
    // the metro outline. The first step in this tour whose context reaches
    // outside New York.
    context: ["county-msa"],
    projection: "local",
    callout: {
      status: "Statistical",
      // Crosses three states by definition, which is why this is the only
      // step in the tour with no county or state to nest under — see the
      // rail, where this connects straight to Nation.
      nests: { nation: true, state: false, county: false, tract: null },
      size: "Metropolitan areas as determined by the Census Bureau.",
      acs: "Decennial Census totals and ACS 5-year samples. 1-year samples for larger areas.",
      // CBSA codes are a flat 5-digit number, not built from state+county
      // like most of this tour's other IDs.
      geoid: { pattern: "CCCCC", example: "35620", parts: [["cbsa", 5]] },
      ids: "5-digit CBSA code (New York-Newark-Jersey City MSA is 35620), summary level 310",
      gotcha: "The Census Bureau uses a number of geographic definitions to describe urban and metropolitan areas, of which Metropolitan Statistical Areas (MSAs) are just one. MSAs are a type of Core Based Statistical Area (CBSA) and are an aggregation of economically and socially related counties named after a central urban area. New York-Newark-Jersey City is the largest of these, comprised of 23 counties across New York, New Jersey, and Pennsylvania, and is in turn incorporated into the larger New York-Newark, NY-NJ-CT-PA Combined Statistical Area (CSA).",
      source: "https://www.census.gov/programs-surveys/metro-micro/about.html",
    },
  },
  {
    id: "place",
    label: "Places",
    scope: "New York metropolitan area",
    layer: "place-metro",
    context: ["county-metro"],
    projection: "local",
    // Zoomed to the metro rather than the whole state: 1,293 places at state
    // scale is an unreadable stipple. The metro still puts New York City beside
    // small villages, which is the range this step exists to show.
    //
    // Only places at least as populous as Yonkers get a label, which in this
    // metro means New York City and Yonkers and nothing else. Long Island is
    // in frame precisely so the reader can see how many places go unlabelled:
    // a legible map of a few named cities reads better here than a hundred
    // village names, and the point of the step is what a "place" is, not an
    // inventory of them.
    //
    // Yonkers is 211,575, so 200,000 makes it the smallest labelled place.
    // Nothing else in the metro falls between the two — the next is New
    // Rochelle at 79,751 — so lower this number to add more.
    labels: ["place-metro"],
    labelMinPop: 200000,
    callout: {
      status: "Legal",
      nests: { nation: true, state: true, county: false, tract: null },
      size: "A population concentration, often a municipality, that the Census designates or recognizes.",
      acs: "Decennial Census totals and ACS 5-year samples. 1-year samples for larger places.",
      geoid: { pattern: "SSPPPPP", example: "3655948", parts: [["state", 2], ["place", 5]] },
      ids: "7 digit FIPS code (New York City is 3651000), summary level 160",
      gotcha: "May or may not be persistent. Nests in states, including water surfaces. The Census splits this geography into two categories — incorporated places and census-designated places. This is what you'd typically use to extract data by municipality or city, not metropolitan area. Places range very widely in population, so ACS 1-year and 3-year samples are only available for larger ones. Places don't overlap or cross state lines, and not all areas or populations are inside a place.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },

  // ── the levels a novice actually needs (steps 9–14) ────────────────────────
  {
    id: "puma",
    label: "PUMAs",
    scope: "Manhattan and its neighbours",
    layer: "puma",
    context: ["borough"],
    projection: "local",
    emphasis: true,
    // Framed on Manhattan at 80% of the viewport, so the island reads at a
    // useful size and the neighbouring boroughs stay visible around it.
    fit: "manhattan",
    fitPad: 0.8,
    // 2020 PUMA 3604109 is Manhattan Community District 9, Morningside Heights
    // and Hamilton Heights — Columbia's Morningside campus. Under the 2010
    // PUMAs this was 03802; the codes were renumbered for the 2020 vintage,
    // which is worth a sentence in the gotcha.
    highlight: ["3604109"],
    labels: ["puma"],
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: false, tract: true },
      size: "Census-designated neighborhoods used for microdata samples.",
      acs: "Decennial Census totals and ACS estimates for all samples, including microdata extracts",
      geoid: { pattern: "SSPPPPP", example: "3604109", parts: [["state", 2], ["puma", 5]] },
      ids: "7 digit FIPS code (this one is 3604109), summary level 795",
      gotcha: "PUMAs are Census-derived neighborhoods created for microdata samples, though Census and ACS summary data are available for them too. A PUMA typically has between 100,000 and 200,000 people and nests within a state. Boundaries may change every 10 years and their area can vary widely with population density. In NYC, PUMA boundaries are usually drawn to line up fairly closely with Community District planning areas and CDTAs.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "nta-cdta",
    // Named in pane order — NTAs left, CDTAs right — so the heading reads the
    // same way the map does.
    label: "NTAs and CDTAs",
    scope: "Morningside Heights and around",
    layer: "nta",
    context: ["cdta", "borough"],
    projection: "local",
    emphasis: true,
    local: true, // locally defined, not a Census product — app flags this
    // Framed on the same ground as the previous step: PUMA 3604109, shown at
    // 55% of the viewport so the neighbouring NTAs stay in view. Arriving here
    // from the PUMA step, the reader sees the same place subdivided.
    fit: "puma",
    fitIds: ["3604109"],
    fitPad: 0.55,
    // Two maps of the same ground, side by side, sharing one projection so the
    // shapes are directly comparable. Reading across, the three NTAs on the
    // left are the one CDTA on the right — the nesting is the picture rather
    // than a claim in the text.
    //
    // CDTA codes are four characters against the NTA's six, so the right pane
    // carries its own GEOID decomposition for the readout.
    panes: [
      {
        title: "NTAs",
        layer: "nta",
        // All three NTAs that make up CDTA MN09: Morningside Heights,
        // Manhattanville-West Harlem, Hamilton Heights-Sugar Hill. Matches
        // the single highlighted patch on the CDTA pane — three pieces on
        // the left tiling the one piece on the right.
        highlight: ["MN0901", "MN0902", "MN0903"],
        labels: ["nta"],
      },
      {
        title: "CDTAs",
        layer: "cdta",
        highlight: ["MN09"],
        labels: ["cdta"],
        geoid: {
          pattern: "BBNN",
          example: "MN09",
          parts: [["borough", 2], ["district", 2]],
        },
      },
    ],
    callout: {
      status: "Locally defined",
      nests: { nation: true, state: true, county: false, tract: true },
      size: "New York City Planning Department–designated neighborhood constructs.",
      acs: "Decennial Census totals and ACS 5-year samples",
      // DCP's own codes, not federal ones — and they decompose too: a borough
      // prefix followed by a four-digit number. Worth pointing at, since the
      // contrast with an 11-digit federal GEOID is the visible difference
      // between a local and a Census geography.
      geoid: {
        pattern: "BBNNNN",
        example: "MN0901",
        parts: [["borough", 2], ["nta", 4]],
      },
      ids: "NTAs use a 4–6 digit alphanumeric code (example: MN0901); CDTAs use a 4 digit alphanumeric code (example: MN09)",
      gotcha: "These neighborhood constructs are aggregations of census tracts designated by NYC Planning to approximate neighborhood units. Neighborhood Tabulation Areas (NTAs) are meant to approximate vernacular neighborhoods — ones with names residents would recognize and boundaries that make sense — and typically hold a few tens of thousands of people across 8 or 9 tracts. Community District Tabulation Areas (CDTAs) are aggregations of NTAs meant to approximate NYC Planning's Community District areas, which city agencies widely use. There are 71 of these, typically over 100,000 people and 3–4 NTAs each. An individual CDTA usually lines up reasonably closely with a Census PUMA, which can let researchers use microdata samples as a CDTA approximation.",
      source: "https://geodata.library.columbia.edu/catalog/cul-nyc-tracts-2020",
    },
  },
  {
    id: "zcta",
    label: "ZCTAs",
    scope: "Morningside Heights and around",
    layer: "zcta",
    context: ["tract"],
    projection: "local",
    // Same ground as the two steps before it, so this is the fourth different
    // way of cutting up one neighbourhood rather than a new place.
    fit: "puma",
    fitIds: ["3604109"],
    fitPad: 0.55,
    // 10027 covers Morningside Heights and Manhattanville. Spotlit like the
    // PUMA and the NTA before it, but translucent rather than solid — the
    // tract boundaries underneath are the point of the comparison, and a
    // filled highlight would hide exactly the thing worth seeing.
    highlight: ["10027"],
    labels: ["zcta"],
    emphasis: true,
    // Deliberately drawn on top of the tract layer from the previous step:
    // the contrast with something that *does* nest is the entire lesson.
    overlayPrevious: true,
    callout: {
      status: "Statistical",
      nests: { nation: true, state: false, county: false, tract: false },
      size: "Areal approximations of USPS ZIP Code designations.",
      acs: "Decennial Census totals and ACS 5-year samples",
      geoid: { pattern: "ZZZZZ", example: "10027", parts: [["zcta", 5]] },
      ids: "5 digit code matching the USPS designation (example: 10027), summary level 860",
      gotcha: "ZIP Codes as used by the U.S. Postal Service have no official areal definition — they're lists of mailing addresses. They're commonly used for neighborhood analysis anyway, especially in business research, so since 2000 the Census Bureau has built ZIP Code Tabulation Areas (ZCTAs) to approximate them, updated every 10 years. They vary widely in population, typically thousands to tens of thousands of people, and their relationship to current ZIP Codes may drift from USPS usage, which can also change at any time. A ZCTA may split a census tract and can span county or state boundaries. Unless you need data at the ZIP Code level specifically, consider a tract instead as your neighborhood unit.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "tract",
    label: "Census Tracts",
    scope: "Morningside Heights and around",
    layer: "tract",
    context: ["borough"],
    projection: "local",
    emphasis: true,
    // Same frame as the three steps before it. PUMA, NTA, ZCTA and tract all
    // land on one neighbourhood, so stepping through them shows four different
    // ways of cutting the same ground rather than four separate places.
    fit: "puma",
    fitIds: ["3604109"],
    fitPad: 0.55,
    // Tract 205 sits in NTA Morningside Heights, CDTA MN09, PUMA 3604109 —
    // the same chain the previous steps spotlit, now at its federal level.
    highlight: ["36061020500"],
    labels: ["tract"],
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: null },
      size: "1,200–8,000 people, with an optimum size of 4,000 people",
      acs: "Decennial Census totals and ACS 5-year samples",
      geoid: {
        pattern: "SSCCCTTTTTT",
        example: "36061020500",
        parts: [["state", 2], ["county", 3], ["tract", 6]],
      },
      ids: "11 digit FIPS code (this tract is 36061020500), summary level 140",
      gotcha: "Census tracts are likely the best known and most widely used of the “neighborhood” level census geographies. They're delineated by the Census Bureau and may change every 10 years alongside the Decennial Census. Tracts are designed to hold roughly 4,000 people (typical range 1,000–8,000), so their physical size varies widely with population density.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "block-group",
    label: "Block Groups",
    scope: "Tract 205 and its neighbours",
    layer: "block-group",
    context: ["tract"],
    projection: "local",
    emphasis: true,
    // Closer than the tract step: framed on tract 205 itself, so its three
    // block groups are the subject and the surrounding tracts give context.
    fit: "tract",
    fitIds: ["36061020500"],
    fitPad: 0.45,
    // Block group 1 is 60 acres against about 4 each for the other two — the
    // same tract split very unevenly, which is worth a sentence about why
    // block groups are sized by population rather than area.
    highlight: ["360610205001"],
    labels: ["block-group"],
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: true },
      size: "generally defined to contain between 600 and 3,000 people",
      acs: "Decennial Census totals and ACS 5-year samples (usually)",
      geoid: {
        pattern: "SSCCCTTTTTTB",
        example: "360610205001",
        parts: [["state", 2], ["county", 3], ["tract", 6], ["bg", 1]],
      },
      ids: "12 digit FIPS code (this block group is 360610205001), summary level 150",
      gotcha: "There are typically 1–9 block groups per tract. Like tracts, they may change every 10 years. The ACS provides 5-year estimates at the block group level, but use of these is sometimes controversial — estimates can be highly uncertain at this scale, and data is often suppressed for small sample sizes.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "block",
    label: "Census Blocks",
    scope: "Inside tract 205",
    layer: "block",
    context: ["block-group", "roads"],
    projection: "local",
    emphasis: true,
    // Fits its own blocks, which are now only tract 205's — the last frame of
    // a descent that has stayed on one neighbourhood since the PUMA step.
    fitPad: 0.8,
    // Block 1011, inside block group 1 of tract 205 — the block group spotlit
    // on the previous step. The spotlight has followed the same ground down
    // every level from the PUMA, and this is where it stops.
    highlight: ["360610205001011"],
    labels: ["block"],
    basemap: "roads", // the one step where streets are required for sense
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: true },
      size: "The smallest census unit and the building block of all other geographies.",
      acs: "Decennial Census totals only",
      geoid: {
        pattern: "SSCCCTTTTTTBBBB",
        example: "360610205001011",
        parts: [["state", 2], ["county", 3], ["tract", 6], ["block", 4]],
      },
      ids: "15 digit FIPS code (this block is 360610205001011), summary level 750",
      gotcha: "This is the most atomistic census geography, and every other geography here is an aggregate of it. Blocks can be city blocks, but may be much smaller, and their boundaries can be drawn from a variety of different features. Population can be as low as zero. Only tabulations from the full Decennial Census enumeration are available at the block level — there's no ACS data here.",
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
];
