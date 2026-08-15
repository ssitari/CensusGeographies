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
// ─────────────────────────────────────────────────────────────────────────────

const ID = "GEOID";
const NAME = "NAME";

export const DATA = {
  nation:        { file: "nation.json",       object: "nation",   id: ID,   name: NAME },
  division:      { file: "division.json",     object: "division", id: ID,   name: NAME },
  state:         { file: "state.json",        object: "state",    id: ID,   name: NAME },

  "state-ny":    { file: "state-ny.json",     object: "state",    id: ID,   name: NAME },
  "county-ny":   { file: "county-ny.json",    object: "county",   id: ID,   name: NAME },
  "cd-ny":       { file: "cd-ny.json",        object: "cd",       id: ID,   name: NAME },
  "place-ny":    { file: "place-ny.json",     object: "place",    id: ID,   name: NAME },

  borough:       { file: "borough.json",      object: "borough",  id: ID,   name: NAME },
  puma:          { file: "puma.json",         object: "puma",     id: ID,   name: NAME },
  cdta:          { file: "cdta.json",         object: "cdta",     id: ID,   name: NAME },
  nta:           { file: "nta.json",          object: "nta",      id: ID,   name: NAME },

  tract:         { file: "tract.json",        object: "tract",    id: ID,   name: NAME },
  zcta:          { file: "zcta.json",         object: "zcta",     id: ID,   name: NAME },
  "block-group": { file: "block-group.json",  object: "bg",       id: ID,   name: NAME },
  block:         { file: "block.json",        object: "block",    id: ID,   name: NAME },

  // Street centrelines, drawn only under the block step so a block reads as
  // a block. Clipped to the one demo neighbourhood — see scripts/build_data.py.
  roads:         { file: "roads.json",        object: "roads",    id: null, name: NAME },
};
