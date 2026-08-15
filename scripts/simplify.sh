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

echo "national"
simplify nation       1%   nation
simplify division     1%   division
simplify state        1.5% state

echo "new york"
simplify state-ny     3%   state
simplify county-ny    4%   county
simplify cd-ny        4%   cd
simplify place-ny     3%   place

echo "new york city"
simplify borough      8%   borough
simplify puma         8%   puma
simplify cdta         10%  cdta
simplify nta          10%  nta

echo "small areas"
simplify tract        15%  tract
simplify zcta         10%  zcta
simplify block-group  25%  bg
simplify block        40%  block
simplify roads        30%  roads

echo
echo "total: $(du -ch $OUT/*.json 2>/dev/null | tail -1 | cut -f1)"
