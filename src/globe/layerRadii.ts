/**
 * Painter radii for everything that hugs the globe surface.
 *
 * The surface stack is drawn as concentric shells a hair apart, so layers
 * never z-fight and the reading order is always the same:
 * ocean → country fills → borders → city pulses → endpoint markers → pulses
 * → route arcs (which lift far above the surface) → plane.
 *
 * Radii are multiples of the globe radius; the gaps are chosen so that a
 * chord of up to {@link DEFAULT_MAX_EDGE_DEG} degrees still clears the shell
 * below it (a chord sags by `1 − cos(halfAngle)`).
 */

/** Radius of each surface-hugging layer, in globe radii. */
export const LAYER_RADIUS = {
  /** The opaque ocean sphere. */
  globe: 1,
  /** Grey country fills. */
  countries: 1.0025,
  /** White country border lines. */
  borders: 1.004,
  /** Blinking airport-city circles. */
  cities: 1.006,
  /** Route endpoint markers. */
  markers: 1.008,
  /** Route endpoint pulse rings. */
  pulses: 1.009,
} as const;

/** Name of a surface-hugging layer. */
export type LayerName = keyof typeof LAYER_RADIUS;
