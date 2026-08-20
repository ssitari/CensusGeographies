// ─────────────────────────────────────────────────────────────────────────────
//  diagram-data.js — the geometry and relationships for the nav rail in
//  diagram.js. Every edge here is a fact already verified while building the
//  tour (steps.js `nests` flags, SOURCES.md) — nothing asserted from memory.
//
//  This file has no prose. The rail exists to move between steps and show
//  what nests in what; the explanation of *why* lives in each step's own
//  callout, not duplicated here.
// ─────────────────────────────────────────────────────────────────────────────

// The one chain that always nests, Nation through Block.
export const SPINE = [
  { id: "nation",     label: "Nation",       y: 48 },
  { id: "region",      label: "Region",       y: 116 },
  { id: "division",   label: "Division",     y: 184 },
  { id: "state",      label: "State",        y: 252 },
  { id: "county",     label: "County",       y: 338 },
  { id: "tract",      label: "Tract",        y: 808 },
  { id: "blockgroup", label: "Block Group",  y: 880 },
  { id: "block",      label: "Block",        y: 947 },
];

// Everything that attaches at one or two points on the spine and stops.
// `up`/`down` are the real edges; `local` marks a not-a-Census-product dot.
export const ANCILLARY = [
  { id: "cd", label: "Cong. District", y: 364, up: ["state"], down: ["block"], local: false },
  // Crosses three states by definition (this tour's example, New York-Newark-
  // Jersey City, is NY-NJ-PA), which is why it nests in Nation rather than
  // State like every other legal geography in this column — there is no
  // single state for it to nest under. Built from whole counties, hence the
  // downward edge straight to County rather than anything in between.
  { id: "msa", label: "MSA", y: 426, up: ["nation"], down: ["county"], local: false },
  { id: "place", label: "Place", y: 488, up: ["state"], down: ["block"], local: false },
  // ZCTAs ship as one national file with no state subset (verified building
  // this tour — see SOURCES.md), which is why this nests in Nation rather
  // than State like everything else in the column.
  { id: "zcta", label: "ZCTA", y: 550, up: ["nation"], down: ["block"], local: false },
  { id: "puma", label: "PUMA", y: 612, up: ["state"], down: ["tract"], local: false },
  { id: "cdta", label: "CDTA", y: 674, up: ["county"], down: ["nta"], local: true },
  { id: "nta", label: "NTA", y: 736, up: ["cdta"], down: ["tract"], local: true },
];

export const NODES = {};
for (const n of SPINE) NODES[n.id] = { ...n, family: "spine" };
for (const n of ANCILLARY) NODES[n.id] = { ...n, family: "ancillary" };

// Which tour step each node navigates to on click. Region and Division both
// live inside the combined "Regions & Divisions" step; CDTA and NTA both
// live inside the combined "NTAs and CDTAs" step — clicking either box in
// either pair lands on the same step, matching how the tour already teaches
// them together.
export const NODE_TO_STEP = {
  nation: "nation",
  region: "region-division",
  division: "region-division",
  state: "state",
  county: "county",
  tract: "tract",
  blockgroup: "block-group",
  block: "block",
  cd: "congressional-district",
  msa: "msa",
  place: "place",
  zcta: "zcta",
  puma: "puma",
  cdta: "nta-cdta",
  nta: "nta-cdta",
};

// Which node(s) light up as "you are here" for each step. Every step but one
// maps to exactly one node: the combined NTA/CDTA step lights up both of its
// panes.
export const STEP_TO_NODES = {
  "nation": ["nation"],
  "region-division": ["division"],
  "state": ["state"],
  "county": ["county"],
  "congressional-district": ["cd"],
  "msa": ["msa"],
  "place": ["place"],
  "puma": ["puma"],
  "nta-cdta": ["nta", "cdta"],
  "zcta": ["zcta"],
  "tract": ["tract"],
  "block-group": ["blockgroup"],
  "block": ["block"],
};

// ── geometry ─────────────────────────────────────────────────────────────
export const SPINE_X = 114, SPINE_W = 180, SPINE_H = 44;
export const ANC_X = 360, ANC_W = 204, ANC_H = 36;
export const VIEW_W = 486, VIEW_H = 993;

export function box(node) {
  return node.family === "spine"
    ? { x: SPINE_X, w: SPINE_W, h: SPINE_H, y: node.y }
    : { x: ANC_X, w: ANC_W, h: ANC_H, y: node.y };
}

// Real edges, both directions turned into graph edges — a node's `down`
// list has to become an edge exactly like its `up` list, or half the
// relationship never draws. Declaring the same pair from both ends (CDTA's
// down and NTA's up both say "CDTA contains NTA") is deduplicated below.
const rawEdges = [];
for (let i = 0; i < SPINE.length - 1; i++) rawEdges.push([SPINE[i].id, SPINE[i + 1].id]);
for (const n of ANCILLARY) {
  for (const parent of n.up) rawEdges.push([parent, n.id]);
  for (const child of n.down) rawEdges.push([n.id, child]);
}
const seen = new Set();
export const EDGES = rawEdges.filter(([a, b]) => {
  const key = a + "|" + b;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Undirected adjacency, for highlighting.
export const ADJ = {};
for (const id in NODES) ADJ[id] = new Set();
for (const [a, b] of EDGES) { ADJ[a].add(b); ADJ[b].add(a); }
