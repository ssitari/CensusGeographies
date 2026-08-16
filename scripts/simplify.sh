#!/usr/bin/env bash
# simplify.sh — simplify the raw GeoJSON and convert to quantized TopoJSON.
#
#   npm install -g mapshaper
#   bash scripts/simplify.sh
#
# Simplification here is aggressive on purpose. This is a teaching tool: the
# shape and relative scale of a PUMA is the point, its exact vertices are not.
# The whole tour should stay comfortably under a megabyte so it loads once and
# then makes no network calls at all.
#
# If a layer looks too coarse, raise its percentage rather than lowering it
# globally — the small-area steps need more detail than the national ones.

set -euo pipefail
cd "$(dirname "$0")/.."

RAW=data/_raw
OUT=data

# Prefer a project-local mapshaper (npm install mapshaper) over a global one,
# so the pinned version travels with the repo.
if [ -x node_modules/.bin/mapshaper ]; then
  MAPSHAPER=node_modules/.bin/mapshaper
elif command -v mapshaper >/dev/null 2>&1; then
  MAPSHAPER=mapshaper
else
  echo "mapshaper not found — run: npm install mapshaper" >&2
  exit 1
fi

simplify () {
  local name=$1 pct=$2 obj=$3
  [ -f "$RAW/$name.geojson" ] || { echo "  skip $name (not built)"; return; }
  # -rename-layers runs before output, so the TopoJSON object comes out named
  # after the manifest key in data.js rather than after the input filename.
  "$MAPSHAPER" "$RAW/$name.geojson" \
    -rename-layers "$obj" \
    -simplify "$pct" keep-shapes \
    -clean \
    -o "$OUT/$name.json" format=topojson id-field=GEOID quantization=1e5 \
    >/dev/null 2>&1
  echo "  $(printf '%-14s' "$name") $(du -h "$OUT/$name.json" | cut -f1)"
}

# The national frames are simplified together, into one file, on purpose.
#
# Nation, region and division are all dissolved from the same states, so their
# boundaries are the same lines. Simplified as separate files they stop being
# the same lines: each gets its own vertex removal and, worse, its own
# quantization grid derived from its own bounding box. The result is a national
# outline that misses the state coastline by a pixel or two and division edges
# that drift off the states they are made of.
#
# combine-files loads all four into a single dataset, so mapshaper builds one
# shared arc table. A boundary between two divisions is then literally one arc,
# simplified once, quantized once, and shared by every layer that uses it.
echo "national (shared topology)"
"$MAPSHAPER" \
  "$RAW/nation.geojson" "$RAW/region.geojson" \
  "$RAW/division.geojson" "$RAW/state.geojson" \
  combine-files \
  -simplify 1.5% keep-shapes target=* \
  -clean target=* \
  -o "$OUT/national.json" format=topojson id-field=GEOID quantization=1e5 \
  >/dev/null 2>&1
echo "  $(printf '%-14s' national.json) $(du -h "$OUT/national.json" | cut -f1)"

echo "new york"
simplify state-ny     3%   state
simplify county-ny    4%   county
simplify cd-ny        4%   cd
simplify county-metro 4%   county
simplify place-metro  4%   place

echo "new york city"
# 1.5%, far below the others: the DCP borough file is a survey-grade boundary
# with ~83k vertices, where the Census layers are already generalised before
# we see them. At 8% it cost 72 KB for five polygons. Percentages here are
# relative to each source's own detail, not a shared scale.
simplify county-outer 2%   county
simplify borough      1.5% borough
# The NYC layers below are all dissolved from the DCP tract file, which carries
# survey-grade detail like the borough boundary — hence percentages an order of
# magnitude below the Census layers.
simplify puma         2%   puma
simplify cdta         2%   cdta
simplify nta          3%   nta

echo "small areas"
simplify tract        3%   tract
simplify zcta         10%  zcta
# Also survey-grade rather than pre-generalized, hence the low percentages.
simplify block-group  4%   bg
simplify block        15%  block
simplify roads        30%  roads

echo
echo "total: $(du -ch $OUT/*.json 2>/dev/null | tail -1 | cut -f1)"
