// ─────────────────────────────────────────────────────────────────────────────
//  app.js — the engine. Don't edit this to change what the tour says; edit
//  steps.js. Edit here only to change how the tour behaves.
// ─────────────────────────────────────────────────────────────────────────────

import { STEPS, NEST_KEYS, VINTAGE_NOTE, TODO } from "./steps.js";
import { DATA } from "./data.js";
import { mountDiagram, setActive, previewNodes } from "./diagram.js";
import { STEP_TO_NODES } from "./diagram-data.js";

const panesEl = document.getElementById("panes");

// A step is normally one map. `panes` makes it several, and they share one
// projection: the same ground at the same scale in each, which is the only way
// a side-by-side says anything. A pane inherits everything it does not
// override from the step, so a single-pane step needs no pane config at all.
//
// Group order per pane is load-bearing: context underneath, then the units,
// then roads, then overlay boundaries drawn *above* the units — context alone
// is not enough for a reference layer, because filled units cover it — then
// labels on top of everything.
let panes = [];
let paneSig = "";

function paneConfigs(step) {
  return (step.panes?.length ? step.panes : [{}]).map((p) => ({ ...step, ...p }));
}

function buildPanes(cfgs) {
  const sig = `${cfgs.length}:${cfgs.map((c) => c.title || "").join("|")}`;
  if (sig === paneSig) return;
  paneSig = sig;

  panesEl.innerHTML = "";
  panes = cfgs.map((cfg) => {
    const node = document.createElement("div");
    node.className = "pane";
    if (cfg.title) {
      const h = document.createElement("div");
      h.className = "pane-title";
      h.textContent = cfg.title;
      node.appendChild(h);
    }
    panesEl.appendChild(node);

    const svg = d3.select(node).append("svg");
    return {
      node,
      svg,
      gContext: svg.append("g").attr("class", "layer-context"),
      gMain: svg.append("g").attr("class", "layer-main"),
      gRoads: svg.append("g").attr("class", "layer-roads"),
      gOverlay: svg.append("g").attr("class", "layer-overlay"),
      gLabels: svg.append("g").attr("class", "layer-labels"),
    };
  });
}

const cache = new Map(); // layer key -> {spec, features}
const files = new Map(); // file name -> parsed topojson, so the four national
                         // layers sharing one archive fetch it once
let current = 0;
let width = 0;
let height = 0;

// ── projections ──────────────────────────────────────────────────────────────
// Two families. Albers USA for the national frames — equal-area, and it puts
// Alaska at something like its true size, which matters for a tool whose whole
// subject is how area and population get partitioned. A conic conformal tuned
// to New York for everything below.

function makeProjection(family) {
  return family === "albers-usa"
    ? d3.geoAlbersUsa()
    : d3.geoConicConformal().parallels([40.67, 41.03]).rotate([74, 0]);
}

let projection = makeProjection("albers-usa");
let path = d3.geoPath(projection);
let family = "albers-usa";

// ── data loading ─────────────────────────────────────────────────────────────

async function layer(key) {
  if (!key || !DATA[key]) return null;
  if (cache.has(key)) return cache.get(key);

  const spec = DATA[key];

  if (!files.has(spec.file)) {
    files.set(
      spec.file,
      fetch(`data/${spec.file}`).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
    );
  }

  const promise = files
    .get(spec.file)
    .then((topo) => {
      const obj = topo.objects[spec.object];
      if (!obj) throw new Error(`no object "${spec.object}" in ${spec.file}`);
      return { spec, features: topojson.feature(topo, obj).features };
    })
    .catch(() => null); // missing data is expected during authoring

  cache.set(key, promise);
  return promise;
}

// ── rendering ────────────────────────────────────────────────────────────────

// `pad` is the fraction of the viewport the fit target should occupy. Below 1
// it leaves room around the target, which is how a step frames one geography
// and still shows what surrounds it.
function fitTo(features, pad = 1) {
  const fc = { type: "FeatureCollection", features };
  const mx = 24 + (width * (1 - pad)) / 2;
  const my = 24 + (height * (1 - pad)) / 2;
  projection.fitExtent([[mx, my], [width - mx, height - my]], fc);
  path = d3.geoPath(projection);
}

async function draw(step, animate = true) {
  const wanted = step.projection === "albers-usa" ? "albers-usa" : "local";
  if (wanted !== family) {
    family = wanted;
    projection = makeProjection(family);
  }

  const cfgs = paneConfigs(step);
  buildPanes(cfgs);
  measure();

  const mains = await Promise.all(cfgs.map((c) => layer(c.layer)));
  if (!mains[0]) {
    renderMissing(step);
    return;
  }

  // The camera is shared across panes. A step may frame something other than
  // its own units — the PUMA step fits Manhattan so the island reads at a
  // useful size while the surrounding boroughs stay visible — and `fitIds`
  // narrows that to particular features, so a step can frame one PUMA rather
  // than all 55.
  const fitLayer = step.fit ? await layer(step.fit) : null;
  let fitFeatures = (fitLayer || mains[0]).features;
  if (fitLayer && step.fitIds?.length) {
    const want = new Set(step.fitIds);
    const subset = fitFeatures.filter((f) => want.has(f.properties[fitLayer.spec.id]));
    if (subset.length) fitFeatures = subset;
  }
  fitTo(fitFeatures, step.fitPad || 1);

  const drawn = [];
  for (let i = 0; i < panes.length; i++) {
    drawn[i] = await drawPane(panes[i], cfgs[i], mains[i], animate);
  }

  document.getElementById("missing").hidden = true;
  reportUnprojected(drawn[0] || [], mains[0]);
}

async function drawPane(pane, cfg, main, animate) {
  if (!main) {
    pane.gMain.selectAll("path").remove();
    pane.gContext.selectAll("path").remove();
    pane.gLabels.selectAll("*").remove();
    return;
  }

  // The basemap layer is drawn separately with line styling. If it also
  // appeared in `context` it would be drawn a second time as a filled polygon,
  // which for street centrelines looks like garbage.
  const contextKeys = (cfg.context || []).filter((k) => k !== cfg.basemap);
  const contexts = (await Promise.all(contextKeys.map(layer))).filter(Boolean);

  const ctxFeatures = contexts.flatMap((l) => l.features);
  const ctx = pane.gContext.selectAll("path").data(ctxFeatures);
  ctx.exit().remove();
  ctx.enter().append("path").merge(ctx).attr("d", path).attr("class", "context");

  pane.gRoads.selectAll("path").remove();
  if (cfg.basemap === "roads") {
    const roads = await layer("roads");
    if (roads) {
      pane.gRoads
        .selectAll("path")
        .data(roads.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("class", "road");
    }
  }

  const sel = pane.gMain.selectAll("path.unit").data(main.features, (d, i) =>
    main.spec.id ? d.properties[main.spec.id] : i
  );
  sel.exit().transition().duration(animate ? 250 : 0).style("opacity", 0).remove();

  // How a unit is drawn describes the shapes on screen; the callout describes
  // the step's subject. Usually they agree, so the style defaults to the
  // callout's nesting answer. The NYC step is where they come apart: the
  // callout is about NYC the *place*, which does not nest in a county, but the
  // shapes drawn are the five boroughs, which are counties and do nest.
  // Drawing those as dashed "crosses boundaries" outlines would be a lie about
  // what the reader is looking at, so a pane can set unitStyle explicitly.
  const style = cfg.unitStyle || (cfg.callout.nests.county === false ? "outline" : "fill");

  // A pane can call out particular features by id. Highlighted units are
  // filled darker, and where the pane also labels, only the highlighted ones
  // are named — calling something out and then naming it is one intent.
  const spotlight = new Set(cfg.highlight || []);
  const geoid = cfg.geoid || cfg.callout.geoid;

  const entered = sel
    .enter()
    .append("path")
    .attr("class", "unit")
    .classed("local-unit", !!cfg.local)
    .classed("no-nest", style === "outline")
    .style("opacity", 0)
    .on("mouseenter", (event, d) => showReadout(main.spec, d, geoid))
    .on("mouseleave", clearReadout);

  const all = entered.merge(sel).attr("d", path);
  all.classed("spotlight", (d) =>
    spotlight.size ? spotlight.has(d.properties[main.spec.id]) : false
  );
  all.transition().duration(animate ? 500 : 0).style("opacity", 1);

  pane.gOverlay.selectAll("path").remove();
  // When a reference layer is drawn on top, the units underneath need a
  // stronger edge or the two read as one undifferentiated mesh — the division
  // boundaries have to be obviously the bolder of the two.
  pane.gMain.classed("has-overlay", !!(cfg.overlay || []).length);

  for (const key of cfg.overlay || []) {
    const ov = await layer(key);
    if (!ov) continue;
    pane.gOverlay
      .selectAll(`path.ov-${key}`)
      .data(ov.features)
      .enter()
      .append("path")
      .attr("class", `overlay-line ov-${key}`)
      .attr("d", path);
  }

  await renderLabels(cfg, pane);

  // Hand back the features that failed to project. Reading this off the DOM
  // instead would also catch the previous step's units, which are still in the
  // document mid-exit — that is how the states step's "5 not shown" notice
  // ended up on the frames after it.
  return main.features.filter((f, i) => {
    const node = all.nodes()[i];
    return node && !node.getAttribute("d");
  });
}

// ── map labels ───────────────────────────────────────────────────────────────
// Labels are keyed to their boundary's colour rather than to a legend, so the
// hierarchy is readable without a key: heavy dark outline and dark label are
// the region, lighter teal outline and teal label are the division inside it.

// Pick the feature's largest polygon, measured after projection. Whole-feature
// centroids drift into open water for anything with islands, and in Albers USA
// the Pacific division would be dragged toward Alaska — measuring projected
// area accounts for the composite's insets.
function largestPolygon(feature) {
  const g = feature.geometry;
  if (!g) return null;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;

  let best = null;
  let bestArea = -Infinity;
  for (const coordinates of polys) {
    const poly = { type: "Polygon", coordinates };
    const area = path.area(poly);
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return best ? { poly: best, area: bestArea } : null;
}

// Project a polygon's rings to screen space: [outer, ...holes].
function projectRings(poly) {
  const rings = poly.coordinates.map((ring) =>
    ring.map((c) => projection(c)).filter((p) => p && !Number.isNaN(p[0]))
  );
  return rings.filter((r) => r.length > 2);
}

function inside(pt, rings) {
  if (!rings.length || !d3.polygonContains(rings[0], pt)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (d3.polygonContains(rings[i], pt)) return false; // in a hole
  }
  return true;
}

function distToEdges(pt, rings) {
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = dx * dx + dy * dy;
      let t = len ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = a[0] + t * dx - pt[0];
      const cy = a[1] + t * dy - pt[1];
      min = Math.min(min, Math.hypot(cx, cy));
    }
  }
  return min;
}

// Pole of inaccessibility: the interior point furthest from any edge. A
// centroid is the wrong anchor for a concave shape — Florida's lands in the
// Gulf, Michigan's in the lake — so labels placed there straddle a boundary
// or sit outside their own state. Coarse grid, then refine around the winner.
function poleOfInaccessibility(rings) {
  const xs = rings[0].map((p) => p[0]);
  const ys = rings[0].map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);

  let best = null;
  let bestD = -Infinity;

  for (let pass = 0; pass < 3; pass++) {
    const n = 12;
    const sx = (x1 - x0) / n;
    const sy = (y1 - y0) / n;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const pt = [x0 + i * sx, y0 + j * sy];
        if (!inside(pt, rings)) continue;
        const d = distToEdges(pt, rings);
        if (d > bestD) {
          bestD = d;
          best = pt;
        }
      }
    }
    if (!best) return null;
    // Tighten the window around the current best and go again.
    x0 = best[0] - sx; x1 = best[0] + sx;
    y0 = best[1] - sy; y1 = best[1] + sy;
  }
  return best ? { point: best, clearance: bestD, rings } : null;
}

function labelPoint(feature) {
  const big = largestPolygon(feature);
  if (!big) return null;
  const rings = projectRings(big.poly);
  if (!rings.length) return null;

  const pole = poleOfInaccessibility(rings);
  if (pole) return { ...pole, area: big.area };

  const c = path.centroid(big.poly);
  return Number.isNaN(c[0]) ? null : { point: c, clearance: 0, rings, area: big.area };
}

// Every corner of the label box inside the polygon, plus the midpoints of the
// long edges — corners alone let a narrow inlet cut under the middle of a word.
function boxInside(b, rings) {
  const mx = b.x + b.width / 2;
  const pts = [
    [b.x, b.y], [b.x + b.width, b.y],
    [b.x, b.y + b.height], [b.x + b.width, b.y + b.height],
    [mx, b.y], [mx, b.y + b.height],
  ];
  return pts.every((p) => inside(p, rings));
}

function overlaps(a, b, pad = 2) {
  return !(
    a.x + a.width + pad < b.x ||
    b.x + b.width + pad < a.x ||
    a.y + a.height + pad < b.y ||
    b.y + b.height + pad < a.y
  );
}

async function renderLabels(step, pane) {
  const gLabels = pane.gLabels;
  gLabels.selectAll("*").remove();
  const keys = step.labels || [];
  if (!keys.length) return;

  const placed = [];

  // Earlier keys win the space they want. Listing region before division in
  // steps.js therefore means a region label is never the one nudged aside.
  for (const key of keys) {
    const l = await layer(key);
    if (!l) continue;

    // "inside" additionally requires the whole label to sit within its own
    // polygon, so nothing straddles a boundary. Where the full name will not
    // fit, fall back to the postal abbreviation, then give up — which is what
    // a printed atlas does with Rhode Island.
    const mustFitInside = step.labelFit === "inside";

    // Largest first, so the biggest feature gets first claim on the space and
    // a crowded frame labels the major municipalities rather than whichever
    // hamlet happened to come first in the file. With `labelMax` this is what
    // makes "label the larger ones" work without needing a population cut-off.
    const only = new Set(key === step.layer ? step.highlight || [] : []);

    const eligible = l.features.filter((f) => {
      if (only.size && !only.has(f.properties[l.spec.id])) return false;
      if (l.spec.labelWhen && !l.spec.labelWhen(f.properties)) return false;
      if (step.labelMinPop) {
        const pop = +f.properties[l.spec.popProp];
        if (!Number.isFinite(pop) || pop < step.labelMinPop) return false;
      }
      return true;
    });

    const ranked = eligible
      .map((f) => ({ f, anchor: labelPoint(f) }))
      .filter((d) => d.anchor)
      .sort((a, b) => b.anchor.area - a.anchor.area);

    let count = 0;
    for (const { f, anchor } of ranked) {
      if (step.labelMax && count >= step.labelMax) break;
      const [px, py] = anchor.point;

      // getBBox returns an SVGRect, whose x/y/width/height live on the
      // prototype rather than as own properties — spreading it yields {} and
      // every collision test then compares against undefined and reports a
      // hit. Copy the fields explicitly.
      const rect = (r, dy = 0) => ({ x: r.x, y: r.y + dy, width: r.width, height: r.height });

      // A layer may name a property it prefers on the map (districts read as
      // "NY-01" rather than "Congressional District 1"); otherwise the label
      // is the same NAME the readout shows.
      const preferred = l.spec.labelProp ? f.properties[l.spec.labelProp] : null;
      const full = (preferred || f.properties[l.spec.name] || "")
        // Drop any "(Region)" suffix on the map — the region is labelled in
        // its own colour a few pixels away, so repeating it on every division
        // is noise. The hover readout keeps the full form, where there is no
        // region label beside it to supply the context.
        .replace(/\s*\(.*\)$/, "");
      const short = l.spec.short ? f.properties[l.spec.short] : null;
      const candidates = short && short !== full ? [full, short] : [full];

      const text = gLabels
        .append("text")
        .attr("class", `map-label lab-${key}`)
        .attr("x", px)
        .attr("y", py);
      const node = text.node();

      let placedIt = false;

      for (const candidate of candidates) {
        text.text(candidate);
        const box = rect(node.getBBox());

        // Nudge vertically out of a collision; a label that still will not fit
        // is dropped rather than stacked on another. Dropped labels remain
        // reachable on hover.
        for (const dy of [0, -11, 11, -22, 22, -33, 33]) {
          const test = rect(box, dy);
          if (placed.some((p) => overlaps(test, p))) continue;
          if (mustFitInside && !boxInside(test, anchor.rings)) continue;
          text.attr("y", py + dy);
          placed.push(rect(node.getBBox()));
          placedIt = true;
          count++;
          break;
        }
        if (placedIt) break;
      }

      if (!placedIt) text.remove();
    }
  }
}

// d3.geoAlbersUsa covers the lower 48, Alaska and Hawaii and returns null for
// anything else, so Puerto Rico and the island areas vanish from the national
// frames — 5 of the 56 state-equivalents. Dropping them silently would be a
// lie of omission on a page whose subject is what counts as a state, so count
// what failed to project and say so on the map.
function reportUnprojected(features, main) {
  const el = document.getElementById("offmap");
  const missed = features.map((f) => f.properties[main.spec.name]);

  if (!missed.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML =
    `<b>${missed.length} not shown</b> — this projection cannot place ` +
    missed.slice(0, 6).join(", ") +
    (missed.length > 6 ? `, and ${missed.length - 6} more` : "");
}

function renderMissing(step) {
  for (const pane of panes) {
    pane.gMain.selectAll("path").remove();
    pane.gContext.selectAll("path").remove();
    pane.gRoads.selectAll("path").remove();
    pane.gLabels.selectAll("*").remove();
  }
  const el = document.getElementById("missing");
  el.hidden = false;
  el.textContent = `No geometry yet for “${step.layer}”. Run scripts/build_data.py, then reload.`;
}

// ── GEOID readout ────────────────────────────────────────────────────────────
// Clicking or hovering a unit decomposes its GEOID into labelled runs. This is
// the single highest-value thing on the page: it turns an opaque 11-digit
// string into a thing with visible parts.

function showReadout(spec, feature, geoid) {
  const box = document.getElementById("readout");
  const raw = spec.id ? feature.properties[spec.id] : null;
  const name = feature.properties[spec.name];

  // Where a layer carries population, show it — the readout is the one place
  // in the tour with room for an actual number rather than a description.
  const pop = spec.popProp ? +feature.properties[spec.popProp] : NaN;
  const popLine = Number.isFinite(pop)
    ? `<div class="ro-pop">${pop.toLocaleString()} people <span>2020 estimates base</span></div>`
    : "";

  if (!raw) {
    box.innerHTML = name ? `<div class="ro-name">${name}</div>${popLine}` : "";
    return;
  }

  let at = 0;
  const chunks = (geoid?.parts || [])
    .map(([label, n]) => {
      const piece = String(raw).slice(at, at + n);
      at += n;
      return piece
        ? `<span class="chunk"><b>${piece}</b><i>${label}</i></span>`
        : "";
    })
    .join("");

  // Anything the declared pattern didn't account for still gets shown, so a
  // mismatch between steps.js and the actual data is visible rather than silent.
  const rest = String(raw).slice(at);
  const tail = rest ? `<span class="chunk unclaimed"><b>${rest}</b><i>?</i></span>` : "";

  box.innerHTML =
    `<div class="ro-name">${name || ""}</div>` +
    popLine +
    `<div class="ro-geoid">${chunks}${tail}</div>`;
}

function clearReadout() {
  document.getElementById("readout").innerHTML = "";
}

// ── callout panel ────────────────────────────────────────────────────────────

function field(label, value) {
  const missing = !value || value === TODO;
  const body = missing
    ? `<span class="todo">not written yet</span>`
    : escapeHtml(value);
  return `<div class="field"><dt>${label}</dt><dd>${body}</dd></div>`;
}

function nestBadge(nests) {
  const cells = NEST_KEYS.map((k) => {
    if (nests[k] === null || nests[k] === undefined) return "";
    const ok = nests[k];
    return `<span class="nest ${ok ? "yes" : "no"}">${k} ${ok ? "✓" : "✗"}</span>`;
  }).join("");
  return cells ? `<div class="nest-badge"><span class="nest-label">nests in</span>${cells}</div>` : "";
}

function renderCallout(step) {
  const c = step.callout;
  const el = document.getElementById("callout");

  el.innerHTML = `
    <header>
      <div class="step-count">Step ${current + 1} of ${STEPS.length}</div>
      <h2>${step.label}</h2>
      <div class="scope">${step.scope}</div>
      <div class="tags">
        <span class="tag status-${c.status.split(" ")[0].toLowerCase()}">${c.status}</span>
        ${step.emphasis ? '<span class="tag key">key level</span>' : ""}
      </div>
      ${nestBadge(c.nests)}
    </header>
    <dl>
      ${field("Typical size", c.size)}
      ${field("Available in", c.acs)}
      ${field("GEOID", c.geoid.example === TODO ? null : c.geoid.example)}
      ${field("The gotcha", c.gotcha)}
    </dl>
    ${
      c.source
        ? `<a class="source" href="${c.source}" target="_blank" rel="noopener">source</a>`
        : `<span class="source todo">source not recorded</span>`
    }
  `;
}

function renderStepper() {
  const nav = document.getElementById("stepper");
  nav.innerHTML = STEPS.map(
    (s, i) =>
      `<button data-i="${i}" class="${i === current ? "on" : ""}${
        s.emphasis ? " emph" : ""
      }" title="${s.label}"><span>${s.label}</span></button>`
  ).join("");
  nav.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => go(+b.dataset.i));
    // Hovering a stepper button previews that step's node(s) on the rail —
    // the same preview a hovered rail box gives, just triggered from the
    // other side of the pairing. Reverts to the real current step on
    // mouseleave via previewNodes(null), same as leaving a rail node.
    const nodeIds = STEP_TO_NODES[STEPS[+b.dataset.i].id] || [];
    b.addEventListener("mouseenter", () => previewNodes(nodeIds));
    b.addEventListener("mouseleave", () => previewNodes(null));
  });

  document.getElementById("prev").disabled = current === 0;
  document.getElementById("next").disabled = current === STEPS.length - 1;
}

// ── navigation ───────────────────────────────────────────────────────────────

function go(i, push = true) {
  current = Math.max(0, Math.min(STEPS.length - 1, i));
  const step = STEPS[current];
  if (push) history.replaceState(null, "", `#${step.id}`);
  renderStepper();
  renderCallout(step);
  clearReadout();
  draw(step);
  setActive(STEP_TO_NODES[step.id] || []);
}

function fromHash() {
  const id = location.hash.replace(/^#/, "");
  const i = STEPS.findIndex((s) => s.id === id);
  return i >= 0 ? i : 0;
}

// ── resize ───────────────────────────────────────────────────────────────────

// Panes are equal width, so measuring one gives the drawing area every pane
// shares — and because they also share the projection, the same ground lands
// on the same pixel in each.
function measure() {
  if (!panes.length) return;
  const box = panes[0].node.getBoundingClientRect();
  width = box.width;
  height = box.height;
  for (const pane of panes) pane.svg.attr("viewBox", `0 0 ${width} ${height}`);
}

function resize() {
  measure();
  draw(STEPS[current], false);
}

// ── boot ─────────────────────────────────────────────────────────────────────

mountDiagram(document.getElementById("geo-nav"), {
  onNavigate: (stepId) => go(STEPS.findIndex((s) => s.id === stepId)),
});

document.getElementById("prev").addEventListener("click", () => go(current - 1));
document.getElementById("next").addEventListener("click", () => go(current + 1));

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") go(current + 1);
  if (e.key === "ArrowLeft") go(current - 1);
});

window.addEventListener("hashchange", () => go(fromHash(), false));
window.addEventListener("resize", debounce(resize, 150));

document.getElementById("vintage").textContent = VINTAGE_NOTE;

go(fromHash(), false);

// ── utilities ────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
