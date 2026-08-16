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
    // Neighbouring counties, not all 1,293 NY places: at this zoom the places
    // layer is visual noise, while Westchester and Nassau orient the reader.
    context: ["county-ny"],
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
    scope: "New York City",
    layer: "puma",
    context: ["borough"],
    projection: "local",
    emphasis: true,
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
    id: "cdta-nta",
    label: "CDTAs & NTAs",
    scope: "New York City",
    layer: "nta",
    context: ["cdta", "borough"],
    projection: "local",
    emphasis: true,
    local: true, // locally defined, not a Census product — app flags this
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
        example: "MN0191",
        parts: [["borough", 2], ["nta", 4]],
      },
      gotcha: TODO,
      source: "https://geodata.library.columbia.edu/catalog/cul-nyc-tracts-2020",
    },
  },
  {
    id: "tract",
    label: "Census Tracts",
    scope: "Manhattan",
    layer: "tract",
    context: ["borough"],
    projection: "local",
    emphasis: true,
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: null },
      size: "1,200–8,000 people, with an optimum size of 4,000 people",
      acs: TODO,
      geoid: {
        pattern: "SSCCCTTTTTT",
        example: "36061014500",
        parts: [["state", 2], ["county", 3], ["tract", 6]],
      },
      gotcha: TODO,
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "zcta",
    label: "ZCTAs",
    scope: "Manhattan — drawn over the tracts",
    layer: "zcta",
    context: ["tract"],
    projection: "local",
    emphasis: true,
    // Deliberately drawn on top of the tract layer from the previous step:
    // the contrast with something that *does* nest is the entire lesson.
    overlayPrevious: true,
    callout: {
      status: "Statistical",
      nests: { nation: true, state: false, county: false, tract: false },
      size: TODO,
      acs: TODO,
      geoid: { pattern: "ZZZZZ", example: "10003", parts: [["zcta", 5]] },
      gotcha: TODO,
      source: null,
    },
  },
  {
    id: "block-group",
    label: "Block Groups",
    scope: "Manhattan",
    layer: "block-group",
    context: ["tract"],
    projection: "local",
    emphasis: true,
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: true },
      size: "generally defined to contain between 600 and 3,000 people",
      acs: TODO,
      geoid: {
        pattern: "SSCCCTTTTTTB",
        example: "360610183007",
        parts: [["state", 2], ["county", 3], ["tract", 6], ["bg", 1]],
      },
      gotcha: TODO,
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
  {
    id: "block",
    label: "Census Blocks",
    scope: "One neighborhood",
    layer: "block",
    context: ["block-group", "roads"],
    projection: "local",
    emphasis: true,
    basemap: "roads", // the one step where streets are required for sense
    callout: {
      status: "Statistical",
      nests: { nation: true, state: true, county: true, tract: true },
      size: TODO,
      acs: TODO,
      geoid: {
        pattern: "SSCCCTTTTTTBBBB",
        example: "360610145004002",
        parts: [["state", 2], ["county", 3], ["tract", 6], ["block", 4]],
      },
      gotcha: TODO,
      source: "https://www.census.gov/programs-surveys/geography/about/glossary.html",
    },
  },
];
