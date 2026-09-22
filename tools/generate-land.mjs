#!/usr/bin/env node
/**
 * Generates `src/data/land-110m.ts` from world-atlas `land-110m.json`.
 *
 * Usage:
 *   node tools/generate-land.mjs [path-or-url-to-land-110m.json]
 *
 * Default source: https://unpkg.com/world-atlas@2.0.2/land-110m.json
 * (world-atlas is MIT licensed; the underlying Natural Earth data is public domain.)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const source = process.argv[2] ?? 'https://unpkg.com/world-atlas@2.0.2/land-110m.json';

const raw = /^https?:/.test(source)
  ? await (await fetch(source)).text()
  : readFileSync(source, 'utf8');

const topo = JSON.parse(raw);
if (topo.type !== 'Topology' || !topo.objects?.land) {
  throw new Error(`Unexpected TopoJSON shape in ${source}`);
}

const header = `/**
 * World land mask, ~1:110m (equirectangular TopoJSON, quantized).
 *
 * Source: world-atlas v2 (Natural Earth data, public domain; world-atlas MIT).
 * https://github.com/topojson/world-atlas
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *
 *     node tools/generate-land.mjs
 */
import type { TopoLand } from '../core/topojson.js';

const land = `;

writeFileSync(
  'src/data/land-110m.ts',
  header + JSON.stringify(topo, null, 0) + ` as TopoLand;\n\nexport default land;\n`,
);
console.log('wrote src/data/land-110m.ts');
