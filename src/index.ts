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
export type { City, LatLon, MapSurface, WorldMode } from './types.js';

// Palette — every colour in one place
export * from './theme.js';

// Pure geo core
export * from './core/antimeridian.js';
export * from './core/topojson.js';
export * from './core/landRaster.js';
export * from './core/dotPattern.js';
export * from './core/greatCircle.js';

// Airport-city markers (blink timing + the tunable ripple)
export * from './markers/blinkPattern.js';
export * from './markers/rippleStyle.js';

// City-name label text style (pin badges + flat labels)
export * from './labels/textStyle.js';

// Globe renderer (three.js)
export * from './globe/cityShader.js';
export * from './globe/CityMarkersLayer.js';
export * from './globe/cameraRig.js';
export * from './globe/layerRadii.js';
export * from './globe/dotTexture.js';
export * from './globe/countrySurface.js';
export * from './globe/atmosphere.js';
export * from './globe/BordersLayer.js';
export * from './globe/GlobeRenderer.js';

// Route layer (three.js)
export * from './routes/arcPath.js';
export * from './routes/RouteModel.js';
export * from './routes/routeStyle.js';
export * from './routes/GreatCircleCurve.js';
export * from './routes/routeShader.js';
export * from './routes/PlaneIcon.js';
export * from './routes/easing.js';
export * from './routes/RouteLayer.js';
export * from './routes/cameraTracking.js';
export * from './routes/PlaneScheduler.js';
export * from './routes/planeSilhouette.js';
export * from './routes/PlaneLayer.js';

// Flat world
export * from './flat/layers.js';
export * from './flat/camera3d.js';
export * from './flat/routePath.js';
export * from './flat/borderPolylines.js';
export * from './flat/countryPaths.js';
export * from './flat/FlatRouteMap.js';

// Public API
export * from './cities.js';
export * from './RouteDots.js';
