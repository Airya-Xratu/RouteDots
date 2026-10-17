/**
 * Shared geometric / domain types used across RouteDots.
 */

/** A point on the globe in decimal degrees. */
export interface LatLon {
  /** Latitude in degrees, -90..90. */
  lat: number;
  /** Longitude in degrees, -180..180. */
  lng: number;
}

/**
 * Which world RouteDots renders:
 *
 * - `auto` — the 3D globe when WebGL is available, the flat world otherwise
 *   (the default).
 * - `globe` — always the 3D globe (falling back to the flat world when the
 *   browser has no WebGL).
 * - `flat` — always the flat world, with the optional 3D camera effect
 *   (`camera3d`).
 */
export type WorldMode = 'auto' | 'globe' | 'flat';

/**
 * Which map surface is drawn under the routes:
 *
 * - `countries` — grey country shapes with white borders (the default).
 *   Optional hexagon tiles can be overlaid inside country borders via the
 *   `hexTiles` option.
 * - `dots` — the classic dot lattice over the land mask.
 */
export type MapSurface = 'countries' | 'dots';

/**
 * Hexagon tile overlay drawn inside country borders on the `countries`
 * surface — the hex twin of the `dots` surface's dot lattice.
 *
 * Tiles are placed on a pointy-top grid of pitch `spacingDeg` and kept only
 * when the whole hexagon fits inside one country and stays `insetDeg` clear of
 * every country border line, so no tile ever paints over a border. Every
 * property is optional and falls back to the library defaults;
 * `enabled: false` hides the overlay.
 */
export interface HexTilesOptions {
  /** Render the hex overlay (default false). */
  enabled?: boolean;
  /** Center-to-center tile spacing in degrees (default 2.5). */
  spacingDeg?: number;
  /**
   * Tile size: the circum-radius (centre → vertex) in degrees. Defaults to
   * `0.85 · spacingDeg / √3` (a 15 % gap between neighbours);
   * `spacingDeg / √3` makes them touch. Larger values are clamped to that, so
   * tiles never overlap.
   */
  sizeDeg?: number;
  /**
   * Minimum clear distance between a tile's edge and any country border
   * line, in degrees (default `0.06 · spacingDeg` — tiles stay visibly clear
   * of the drawn border lines; `0` lets a tile touch one, never cross it).
   */
  insetDeg?: number;
  /** Tile fill colour (default white / pale-grey depending on theme). */
  color?: string;
  /** Tile opacity 0..1 (default 0.35). */
  opacity?: number;
}

/** A city (or any named point) that can be used as a route endpoint. */
export interface City extends LatLon {
  /** IATA airport code, e.g. "DXB". */
  code: string;
  /** Display name, e.g. "Dubai". */
  name: string;
  /** Country name, e.g. "United Arab Emirates". */
  country: string;
}
