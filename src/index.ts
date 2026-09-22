/**
 * RouteDots
 * ---------
 * Interactive dot-globe flight route visualizer.
 *
 * Public API surface grows across phases and is finalized (with full
 * documentation) in Phase 6 — see `docs/developer-guide.md`.
 *
 * @packageDocumentation
 */

/** Library version (kept in sync with `package.json`). */
export const VERSION = '0.1.0';

// Shared domain types
export type { City, LatLon } from './types.js';

// Pure geo core
export * from './core/topojson.js';
export * from './core/landRaster.js';
export * from './core/dotPattern.js';
export * from './core/greatCircle.js';

// Globe renderer (three.js)
export * from './globe/cameraRig.js';
export * from './globe/dotTexture.js';
export * from './globe/atmosphere.js';
export * from './globe/GlobeRenderer.js';

// Route layer (three.js)
export * from './routes/RouteModel.js';
export * from './routes/GreatCircleCurve.js';
export * from './routes/routeShader.js';
export * from './routes/RouteLayer.js';
