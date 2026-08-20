// ─────────────────────────────────────────────────────────────────────────────
//  data.js — manifest mapping layer keys to the TopoJSON files on disk.
//
//  Every file is a TopoJSON archive in data/ containing one named object.
//  Files are fetched lazily, once, the first time a step needs them, and
//  cached for the rest of the session. A missing file is not fatal: the app
//  draws a placeholder for that step and keeps working, so you can build the
//  tour and the data pipeline in either order.
//
//  build_data.py normalises every layer to exactly two properties, GEOID and
//  NAME, so there are no per-layer property names to track here. `id: null`
//  means the layer has no meaningful identifier to decompose — roads are drawn
//  for orientation only.
//
//  scripts/attach_population.py runs after simplify.sh and writes nine more
//  properties directly onto most layers' features: POP20 (2020 Census),
//  ACS1_POP/_M and ACS5_POP/_M (population estimate + margin of error), the
//  same pair for ACS1_INC/ACS5_INC (median household income), and ACS_YEAR.
//  None of that is declared here — app.js's showReadout() checks for POP20
//  directly, so a layer the script hasn't touched (context-only layers,
//  NTAs/CDTAs for now) just doesn't show a stats block, no per-layer flag
//  needed. See that script's docstring for which levels lack which product
//  and why, especially congressional districts, which are pinned to 2021
//  rather than the current year.
// ─────────────────────────────────────────────────────────────────────────────

const ID = "GEOID";
const NAME = "NAME";

export const DATA = {
  // All four share one file, and that is load-bearing rather than tidiness:
  // they are dissolved from the same geometry, so they must be simplified and
  // quantized as one topology or their shared edges stop lining up. See the
  // note at the top of scripts/simplify.sh.
  nation:        { file: "national.json",     object: "nation",   id: ID,   name: NAME },
  region:        { file: "national.json",     object: "region",   id: ID,   name: NAME },
  division:      { file: "national.json",     object: "division", id: ID,   name: NAME },
  // `short` is a fallback label used when the full name will not fit inside
  // the shape — only the states carry one.
  state:         { file: "national.json",     object: "state",    id: ID,   name: NAME, short: "STUSPS" },

  "state-ny":    { file: "state-ny.json",     object: "state",    id: ID,   name: NAME },
  "county-ny":   { file: "county-ny.json",    object: "county",   id: ID,   name: NAME },
  // `labelProp` is the property the map label prefers over NAME. Districts are
  // labelled "NY-01" on the map — the form anyone looking one up will have
  // seen — while the readout keeps the full "Congressional District 1".
  "cd-ny":       { file: "cd-ny.json",        object: "cd",       id: ID,   name: NAME, labelProp: "SHORT" },
  // `labelWhen` filters which features are eligible for a map label without
  // affecting what is drawn. Places include CDPs (LSAD 57), which are
  // statistical areas rather than municipalities; they stay on the map but do
  // not compete for label space.
  "county-metro":{ file: "county-metro.json", object: "county",   id: ID,   name: NAME },
  "place-metro": { file: "place-metro.json",  object: "place",    id: ID,   name: NAME,
                   labelWhen: (p) => p.LSAD !== "57", popProp: "POP" },

  msa:           { file: "msa.json",          object: "msa",      id: ID,   name: NAME },
  // Context only — never a step's own layer, never gets population data.
  // Spans three states (NY, NJ, PA), the first time this project has needed
  // county geometry outside New York.
  "county-msa":  { file: "county-msa.json",   object: "county",   id: ID,   name: NAME },
  borough:       { file: "borough.json",      object: "borough",  id: ID,   name: NAME },
  manhattan:     { file: "manhattan.json",    object: "manhattan",id: ID,   name: NAME },
  puma:          { file: "puma.json",         object: "puma",     id: ID,   name: NAME, labelProp: "SHORT" },
  cdta:          { file: "cdta.json",         object: "cdta",     id: ID,   name: NAME, labelProp: "SHORT" },
  nta:           { file: "nta.json",          object: "nta",      id: ID,   name: NAME },

  tract:         { file: "tract.json",        object: "tract",    id: ID,   name: NAME },
  zcta:          { file: "zcta.json",         object: "zcta",     id: ID,   name: NAME },
  "block-group": { file: "block-group.json",  object: "bg",       id: ID,   name: NAME },
  block:         { file: "block.json",        object: "block",    id: ID,   name: NAME },

  // Street centrelines, drawn only under the block step so a block reads as
  // a block. Clipped to the one demo neighbourhood — see scripts/build_data.py.
  roads:         { file: "roads.json",        object: "roads",    id: null, name: NAME },
};
