// ─────────────────────────────────────────────────────────────────────────────
//  diagram.js — the geography relationship rail. Renders once into a
//  container, then exposes setActive() so app.js can keep it in sync with
//  whichever step is on screen. No text panel: the callout already carries
//  the prose for the current step, so this only ever needs to show and
//  navigate structure.
// ─────────────────────────────────────────────────────────────────────────────

import { NODES, EDGES, ADJ, NODE_TO_STEP, box, VIEW_W, VIEW_H } from "./diagram-data.js";

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function edgePath(fromId, toId) {
  const a = box(NODES[fromId]), b = box(NODES[toId]);
  if (NODES[fromId].family === "spine" && NODES[toId].family === "spine") {
    return `M ${a.x} ${a.y + a.h / 2} L ${a.x} ${b.y - b.h / 2}`;
  }
  // Join whichever edges actually face each other — needed both ways, since
  // State connects rightward to PUMA while PUMA connects leftward to Tract.
  const startX = a.x < b.x ? a.x + a.w / 2 : a.x - a.w / 2;
  const endX = a.x < b.x ? b.x - b.w / 2 : b.x + b.w / 2;
  const midX = (startX + endX) / 2;
  return `M ${startX} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${endX} ${b.y}`;
}

let nodeEls = {}, edgeEls = {};
let activeIds = [];
let onNavigate = null;

export function mountDiagram(container, opts) {
  onNavigate = opts.onNavigate;

  const svg = el("svg", {
    id: "gd-svg", viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, role: "img",
    "aria-label": "How the census geographies in this tour relate to each other. Click any box to go to that step.",
  });
  const edgeLayer = el("g", { class: "gd-edges" });
  const nodeLayer = el("g", { class: "gd-nodes" });
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);
  container.appendChild(svg);

  edgeEls = {};
  for (const [a, b] of EDGES) {
    const isSpine = NODES[a].family === "spine" && NODES[b].family === "spine";
    const p = el("path", { class: "gd-edge" + (isSpine ? " gd-spine-edge" : ""), d: edgePath(a, b) });
    edgeLayer.appendChild(p);
    edgeEls[a + "|" + b] = p;
    edgeEls[b + "|" + a] = p;
  }

  nodeEls = {};
  for (const id in NODES) {
    const n = NODES[id], b = box(n);
    const g = el("g", {
      class: "gd-node gd-" + n.family, tabindex: "0", role: "button",
      "aria-label": "Go to " + n.label,
    });
    g.appendChild(el("rect", { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: 4 }));
    const t = el("text", { x: b.x + (n.local ? 4 : 0), y: b.y + 1 });
    t.textContent = n.label;
    g.appendChild(t);
    if (n.local) g.appendChild(el("circle", { class: "gd-dot", cx: b.x - b.w / 2 + 10, cy: b.y, r: 2.6 }));

    g.addEventListener("mouseenter", () => preview(id));
    g.addEventListener("focus", () => preview(id));
    g.addEventListener("mouseleave", () => preview(null));
    g.addEventListener("blur", () => preview(null));
    g.addEventListener("click", () => onNavigate?.(NODE_TO_STEP[id]));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.(NODE_TO_STEP[id]); }
    });

    nodeLayer.appendChild(g);
    nodeEls[id] = g;
  }

  paint(activeIds);
}

// Hovering a different node previews its connections without losing the
// "you are here" state — releasing the pointer reverts to it rather than to
// nothing, since there is no placeholder panel to fall back to.
function preview(id) {
  paint(id ? [id] : activeIds);
}

function paint(ids) {
  const svg = document.getElementById("gd-svg");
  if (!svg) return;
  const related = new Set();
  for (const id of ids) for (const nb of ADJ[id]) related.add(nb);

  svg.classList.toggle("gd-focused", ids.length > 0);
  for (const nid in nodeEls) {
    nodeEls[nid].classList.toggle("gd-current", ids.includes(nid));
    nodeEls[nid].classList.toggle("gd-related", !ids.includes(nid) && related.has(nid));
  }
  for (const k in edgeEls) edgeEls[k].classList.remove("gd-related");
  for (const id of ids) {
    for (const nb of ADJ[id]) {
      const e = edgeEls[id + "|" + nb];
      if (e) e.classList.add("gd-related");
    }
  }
}

// Called from go() every time the step changes, so the rail always shows
// where the tour currently is — via the stepper buttons, arrow keys, or a
// click on the rail itself.
export function setActive(nodeIds) {
  activeIds = nodeIds || [];
  paint(activeIds);
  nodeEls[activeIds[0]]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
