#!/usr/bin/env node
/**
 * Generates `src/data/countries-110m.ts` from world-atlas `countries-110m.json`.
 *
 * Usage:
 *   node tools/generate-countries.mjs [path-or-url-to-countries-110m.json]
 *
 * Default source: https://unpkg.com/world-atlas@2.0.2/countries-110m.json
 * (world-atlas is MIT licensed; the underlying Natural Earth data is public domain.)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const source = process.argv[2] ?? 'https://unpkg.com/world-atlas@2.0.2/countries-110m.json';

const raw = /^https?:/.test(source)
  ? await (await fetch(source)).text()
  : readFileSync(source, 'utf8');

const topo = JSON.parse(raw);
if (topo.type !== 'Topology' || !topo.objects?.countries) {
  throw new Error(`Unexpected TopoJSON shape in ${source}`);
}

const header = `/**
 * World country borders, ~1:110m (equirectangular TopoJSON, quantized).
 *
 * Source: world-atlas v2 (Natural Earth data, public domain; world-atlas MIT).
 * https://github.com/topojson/world-atlas
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *
 *     node tools/generate-countries.mjs
 */
import type { TopoCountries } from '../core/topojson.js';

const countries = `;

writeFileSync(
  'src/data/countries-110m.ts',
  header + JSON.stringify(topo, null, 0) + ` as TopoCountries;\n\nexport default countries;\n`,
);
console.log('wrote src/data/countries-110m.ts');
