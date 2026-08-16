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
//    geoid     { pattern, example, parts: [[label, chars], ...] }
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
      size: TODO,
      acs: TODO,
      // TIGER gives the nation feature the literal GEOID "US", not a digit.
      geoid: { pattern: "US", example: "US", parts: [["nation", 2]] },
      gotcha: TODO,
      source: null,
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
      size: TODO,
      acs: TODO,
      geoid: { pattern: "D", example: "1", parts: [["division", 1]] },
      gotcha: TODO,
      source: null,
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
    projection: "albers-usa",
    callout: {
      status: "Legal",
      nests: { nation: true, state: null, county: null, tract: null },
      size: TODO,
      acs: TODO,
      geoid: { pattern: "SS", example: "36", parts: [["state", 2]] },
      gotcha: TODO,
      source: null,
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
    callout: {
      status: "Legal",
      nests: { nation: true, state: true, county: null, tract: null },
      size: TODO,
      acs: TODO,
      geoid: { pattern: "SSCCC", example: "36061", parts: [["state", 2], ["county", 3]] },
      gotcha: TODO,
      source: null,
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
      size: TODO,
      acs: TODO,
      geoid: { pattern: "SSDD", example: "3623", parts: [["state", 2], ["district", 2]] },
      gotcha: TODO,
      source: null,
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
      size: TODO,
      acs: TODO,
      geoid: { pattern: "SSPPPPP", example: "3655948", parts: [["state", 2], ["place", 5]] },
      gotcha: TODO,
      source: null,
    },
  },

  // ── transition: the inversion. NYC is one place holding five counties. ─────
  {
    id: "nyc",
    label: "New York City",
    scope: "One place, five counties",
    layer: "borough",
    // Metro counties outside the city only. The boroughs come from DCP's
    // water-excluded file, so Census counties underneath them put a coarse
    // grey collar of open water around each borough that lined up with
    // nothing. Stopping at the city line keeps Westchester and Nassau for
    // orientation without the mismatch.
    context: ["county-outer"],
    // Labels strip the "(Kings County)" half, so these read as Brooklyn,
    // Queens, Manhattan — the names people actually use, against a readout
    // that still shows the county underneath.
    labels: ["borough"],
    projection: "local",
    transition: true,
    inversion: true, // app draws this one differently — see note in README
    // The shapes here are counties and they nest; the callout's subject, NYC
    // the place, does not. Style follows the shapes. See app.js draw().
    unitStyle: "fill",
    callout: {
      status: "Legal",
      nests: { nation: true, state: true, county: false, tract: null },
      size: TODO,
      acs: TODO,
      // The units drawn here are the five counties, so the readout decomposes
      // a county GEOID. That mismatch with the step's subject — NYC the
      // *place* — is the lesson; say so in `gotcha`.
      geoid: { pattern: "SSCCC", example: "36061", parts: [["state", 2], ["county", 3]] },
      gotcha: TODO,
      source: null,
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
      size: TODO,
      acs: TODO,
      geoid: { pattern: "SSPPPPP", example: "3604308", parts: [["state", 2], ["puma", 5]] },
      gotcha: TODO,
      source: null,
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
        highlight: ["MN0901"],
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
      size: TODO,
      acs: TODO,
      // DCP's own codes, not federal ones — and they decompose too: a borough
      // prefix followed by a four-digit number. Worth pointing at, since the
      // contrast with an 11-digit federal GEOID is the visible difference
      // between a local and a Census geography.
      geoid: {
        pattern: "BBNNNN",
        example: "MN0901",
        parts: [["borough", 2], ["nta", 4]],
      },
      gotcha: TODO,
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
      size: TODO,
      acs: TODO,
      geoid: { pattern: "ZZZZZ", example: "10027", parts: [["zcta", 5]] },
      gotcha: TODO,
      source: null,
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
      acs: TODO,
      geoid: {
        pattern: "SSCCCTTTTTT",
        example: "36061020500",
        parts: [["state", 2], ["county", 3], ["tract", 6]],
      },
      gotcha: TODO,
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
      acs: TODO,
      geoid: {
        pattern: "SSCCCTTTTTTB",
        example: "360610205001",
        parts: [["state", 2], ["county", 3], ["tract", 6], ["bg", 1]],
      },
      gotcha: TODO,
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
    basemap: "roads", // the one step where streets are required for sense
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: true },
      size: TODO,
      acs: TODO,
      geoid: {
        pattern: "SSCCCTTTTTTBBBB",
        example: "360610205001000",
        parts: [["state", 2], ["county", 3], ["tract", 6], ["block", 4]],
      },
      gotcha: TODO,
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
];
