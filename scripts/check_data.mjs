// check_data.mjs — validate data/*.json against the data.js manifest and the
// GEOID patterns declared in steps.js.
//
//     node scripts/check_data.mjs
//
// Catches the failure modes that are invisible until someone clicks: a
// TopoJSON object named after the input file instead of the manifest key, a
// layer whose properties didn't get normalised to GEOID/NAME, or a GEOID
// pattern in steps.js that doesn't add up to the digits actually in the data.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DATA } from "../data.js";
import { STEPS, TODO } from "../steps.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); bad++; };

console.log("layers");
for (const [key, spec] of Object.entries(DATA)) {
  const p = join(root, "data", spec.file);
  if (!existsSync(p)) { console.log(`  --    ${key} (not built)`); continue; }

  const topo = JSON.parse(readFileSync(p, "utf8"));
  const obj = topo.objects[spec.object];
  if (!obj) {
    fail(`${key}: expected object "${spec.object}", found ${Object.keys(topo.objects)}`);
    continue;
  }

  const geoms = obj.geometries || [];
  const props = geoms[0]?.properties || {};
  const missing = [spec.id, spec.name].filter((k) => k && !(k in props));
  if (missing.length) fail(`${key}: features lack ${missing.join(", ")}`);
  else console.log(`  ok    ${key.padEnd(13)} ${String(geoms.length).padStart(5)} features`);
}

console.log("\ngeoid patterns");
for (const step of STEPS) {
  const spec = DATA[step.layer];
  const g = step.callout.geoid;
  if (!spec || !g?.parts?.length) continue;

  const p = join(root, "data", spec.file);
  if (!existsSync(p) || !spec.id) continue;

  const topo = JSON.parse(readFileSync(p, "utf8"));
  const geoms = topo.objects[spec.object]?.geometries || [];
  const sample = geoms[0]?.properties?.[spec.id];
  if (sample == null) continue;

  const declared = g.parts.reduce((n, [, w]) => n + w, 0);
  const actual = String(sample).length;
  if (declared !== actual)
    fail(`${step.id}: pattern declares ${declared} digits, data has ${actual} (e.g. "${sample}")`);
  else console.log(`  ok    ${step.id.padEnd(13)} ${actual} digits`);
}

const todos = STEPS.flatMap((s) =>
  Object.entries(s.callout)
    .filter(([, v]) => v === TODO)
    .map(([k]) => `${s.id}.${k}`)
);
console.log(`\n${todos.length} callout fields still unwritten`);

process.exit(bad ? 1 : 0);
