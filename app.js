// ─────────────────────────────────────────────────────────────────────────────
//  app.js — the engine. Don't edit this to change what the tour says; edit
//  steps.js. Edit here only to change how the tour behaves.
// ─────────────────────────────────────────────────────────────────────────────

import { STEPS, NEST_KEYS, VINTAGE_NOTE, TODO } from "./steps.js";
import { DATA } from "./data.js";

const svg = d3.select("#map");
const gContext = svg.append("g").attr("class", "layer-context");
const gMain = svg.append("g").attr("class", "layer-main");
const gRoads = svg.append("g").attr("class", "layer-roads");
// Reference boundaries drawn *above* the units. Context sits underneath and
// gets covered by filled shapes, which is wrong when the reference is what
// orients the reader — state lines under the divisions being the case in
// point, since students recognise state shapes and read the divisions through
// them.
const gOverlay = svg.append("g").attr("class", "layer-overlay");

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

function fitTo(features) {
  const fc = { type: "FeatureCollection", features };
  projection.fitExtent(
    [
      [24, 24],
      [width - 24, height - 24],
    ],
    fc
  );
  path = d3.geoPath(projection);
}

async function draw(step, animate = true) {
  const wanted = step.projection === "albers-usa" ? "albers-usa" : "local";
  const familyChanged = wanted !== family;
  if (familyChanged) {
    family = wanted;
    projection = makeProjection(family);
  }

  const main = await layer(step.layer);

  // The basemap layer is drawn separately in gRoads with line styling. If it
  // also appeared in `context` it would be drawn a second time as a filled
  // polygon, which for street centrelines looks like garbage.
  const contextKeys = (step.context || []).filter((k) => k !== step.basemap);
  const contexts = await Promise.all(contextKeys.map(layer));

  if (!main) {
    renderMissing(step);
    return;
  }

  fitTo(main.features);

  // Context layers sit underneath, dimmed, purely for orientation.
  const ctxFeatures = contexts.filter(Boolean).flatMap((l) => l.features);
  const ctx = gContext.selectAll("path").data(ctxFeatures);
  ctx.exit().remove();
  ctx.enter().append("path").merge(ctx).attr("d", path).attr("class", "context");

  // Roads only appear where a step asks for them.
  gRoads.selectAll("path").remove();
  if (step.basemap === "roads") {
    const roads = await layer("roads");
    if (roads) {
      gRoads
        .selectAll("path")
        .data(roads.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("class", "road");
    }
  }

  const sel = gMain.selectAll("path").data(main.features, (d, i) =>
    main.spec.id ? d.properties[main.spec.id] : i
  );
  sel.exit().transition().duration(animate ? 250 : 0).style("opacity", 0).remove();

  // How a unit is drawn describes the shapes on screen; the callout describes
  // the step's subject. Usually they agree, so the style defaults to the
  // callout's nesting answer. The NYC step is where they come apart: the
  // callout is about NYC the *place*, which does not nest in a county, but the
  // shapes drawn are the five boroughs, which are counties and do nest.
  // Drawing those as dashed "crosses boundaries" outlines would be a lie about
  // what the reader is looking at, so a step can set unitStyle explicitly.
  const style = step.unitStyle || (step.callout.nests.county === false ? "outline" : "fill");

  const entered = sel
    .enter()
    .append("path")
    .attr("class", "unit")
    .classed("local-unit", !!step.local)
    .classed("no-nest", style === "outline")
    .style("opacity", 0)
    .on("mouseenter", (event, d) => showReadout(main.spec, d))
    .on("mouseleave", clearReadout);

  const all = entered.merge(sel).attr("d", path);
  all.transition().duration(animate ? 500 : 0).style("opacity", 1);

  gOverlay.selectAll("path").remove();
  // When a reference layer is drawn on top, the units underneath need a
  // stronger edge or the two read as one undifferentiated mesh — the division
  // boundaries have to be obviously the bolder of the two.
  gMain.classed("has-overlay", !!(step.overlay || []).length);

  for (const key of step.overlay || []) {
    const ov = await layer(key);
    if (!ov) continue;
    gOverlay
      .selectAll(`path.ov-${key}`)
      .data(ov.features)
      .enter()
      .append("path")
      .attr("class", `overlay-line ov-${key}`)
      .attr("d", path);
  }

  document.getElementById("missing").hidden = true;
  reportUnprojected(all, main);
}

// d3.geoAlbersUsa covers the lower 48, Alaska and Hawaii and returns null for
// anything else, so Puerto Rico and the island areas vanish from the national
// frames — 5 of the 56 state-equivalents. Dropping them silently would be a
// lie of omission on a page whose subject is what counts as a state, so count
// what failed to project and say so on the map.
function reportUnprojected(selection, main) {
  const el = document.getElementById("offmap");
  const missed = [];
  selection.each(function (d) {
    if (!this.getAttribute("d")) missed.push(d.properties[main.spec.name]);
  });

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
  gMain.selectAll("path").remove();
  gContext.selectAll("path").remove();
  gRoads.selectAll("path").remove();
  const el = document.getElementById("missing");
  el.hidden = false;
  el.textContent = `No geometry yet for “${step.layer}”. Run scripts/build_data.py, then reload.`;
}

// ── GEOID readout ────────────────────────────────────────────────────────────
// Clicking or hovering a unit decomposes its GEOID into labelled runs. This is
// the single highest-value thing on the page: it turns an opaque 11-digit
// string into a thing with visible parts.

function showReadout(spec, feature) {
  const box = document.getElementById("readout");
  const step = STEPS[current];
  const raw = spec.id ? feature.properties[spec.id] : null;
  const name = feature.properties[spec.name];

  if (!raw) {
    box.innerHTML = name ? `<div class="ro-name">${name}</div>` : "";
    return;
  }

  let at = 0;
  const chunks = (step.callout.geoid.parts || [])
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
  nav.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => go(+b.dataset.i))
  );

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
}

function fromHash() {
  const id = location.hash.replace(/^#/, "");
  const i = STEPS.findIndex((s) => s.id === id);
  return i >= 0 ? i : 0;
}

// ── resize ───────────────────────────────────────────────────────────────────

function measure() {
  const box = document.getElementById("map-wrap").getBoundingClientRect();
  width = box.width;
  height = box.height;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
}

function resize() {
  measure();
  draw(STEPS[current], false);
}

// ── boot ─────────────────────────────────────────────────────────────────────

document.getElementById("prev").addEventListener("click", () => go(current - 1));
document.getElementById("next").addEventListener("click", () => go(current + 1));

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") go(current + 1);
  if (e.key === "ArrowLeft") go(current - 1);
});

window.addEventListener("hashchange", () => go(fromHash(), false));
window.addEventListener("resize", debounce(resize, 150));

document.getElementById("vintage").textContent = VINTAGE_NOTE;

measure();
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
