/**
 * The flat world's DOM layers.
 *
 * Each layer is its own absolutely-positioned element (not just a group in
 * one SVG) so the 3D camera effect can float them at different `translateZ`
 * depths — the routes and the plane genuinely hang above the map, with real
 * parallax, instead of being flattened into a single image.
 *
 * The `data-rd-layer` attribute makes every layer addressable from CSS and
 * from tests: `[data-rd-layer='routes']`.
 */

/** Attribute name every flat-world layer carries. */
export const FLAT_LAYER_ATTR = 'data-rd-layer';

/** Layer names, bottom to top. */
export const FLAT_LAYER_NAME = {
  /** Country fills / dot lattice (canvas). */
  surface: 'surface',
  /** Country border polylines. */
  borders: 'borders',
  /** City dots + ripple rings. */
  cities: 'cities',
  /** Route arcs, endpoint markers, labels and the plane. */
  routes: 'routes',
} as const;

/** Name of a flat-world layer. */
export type FlatLayerName = (typeof FLAT_LAYER_NAME)[keyof typeof FLAT_LAYER_NAME];
