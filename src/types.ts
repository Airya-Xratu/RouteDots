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
 * Which map surface is drawn under the routes:
 *
 * - `countries` — grey country shapes with white borders (the default).
 * - `dots` — the classic dot lattice over the land mask.
 */
export type MapSurface = 'countries' | 'dots';

/** A city (or any named point) that can be used as a route endpoint. */
export interface City extends LatLon {
  /** IATA airport code, e.g. "DXB". */
  code: string;
  /** Display name, e.g. "Dubai". */
  name: string;
  /** Country name, e.g. "United Arab Emirates". */
  country: string;
}
