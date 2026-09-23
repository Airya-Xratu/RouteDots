/**
 * Airport (route endpoint) styling — the source and destination markers.
 *
 * Every route ends on an airport: a solid dot pinned to the globe / flat map
 * (`RouteLayer.buildMarkers`, `FlatRouteMap.renderRoutes`), a one-shot pulse
 * ring when the route is set, and the dot of its city-name pin. This module
 * resolves one `airports` option into a style per endpoint, so the source and
 * the destination can be told apart at a glance.
 *
 * Pure data + pure functions: no DOM, no three.js — unit-tested.
 */
import type { RouteDotsPalette } from '../theme.js';

/** Style of one airport (the source or the destination). */
export interface AirportEndpointOptions {
  /** Marker dot colour (default: the palette's `marker`). */
  color?: string;
  /**
   * Marker dot radius — globe radii (globe, default 0.0075) / map px (flat,
   * default 5).
   */
  size?: number;
  /** Pulse-ring colour (default: the palette's `ring`). */
  ringColor?: string;
  /** Pulse the endpoint when the route is set (default `true`). */
  ring?: boolean;
}

/**
 * `airports` option shape — shared defaults for both endpoints, plus
 * per-endpoint overrides.
 */
export interface AirportsStyleOptions extends AirportEndpointOptions {
  /** The source (origin) airport's overrides. */
  source?: AirportEndpointOptions;
  /** The destination airport's overrides. */
  destination?: AirportEndpointOptions;
}

/** One endpoint's style with every value resolved. */
export interface ResolvedAirportEndpoint {
  color: string;
  /** Globe radii (globe) / map px (flat). */
  size: number;
  ringColor: string;
  ring: boolean;
}

/** Both endpoints, in route order. */
export interface ResolvedAirportsStyle {
  source: ResolvedAirportEndpoint;
  destination: ResolvedAirportEndpoint;
}

/** Default dot radius on the globe (globe radii). */
export const AIRPORT_DOT_RADIUS_GLOBE = 0.0075;
/** Default dot radius on the flat map (map px). */
export const AIRPORT_DOT_RADIUS_FLAT = 5;

function resolveEndpoint(
  shared: AirportsStyleOptions,
  specific: AirportEndpointOptions | undefined,
  palette: RouteDotsPalette,
  defaultSize: number,
): ResolvedAirportEndpoint {
  const o: AirportEndpointOptions = specific ?? {};
  // Empty strings (a cleared colour picker) fall through to the next source.
  const str = (value: string | undefined): string | undefined =>
    typeof value === 'string' && value ? value : undefined;
  return {
    color: str(o.color) ?? str(shared.color) ?? palette.marker,
    size: Number.isFinite(o.size)
      ? (o.size as number)
      : Number.isFinite(shared.size)
        ? (shared.size as number)
        : defaultSize,
    ringColor: str(o.ringColor) ?? str(shared.ringColor) ?? palette.ring,
    ring: o.ring ?? shared.ring ?? true,
  };
}

/**
 * Resolves the `airports` option (plus a flat-world default size) into a
 * style per endpoint. Every key is optional — anything left out keeps the
 * palette / historical look.
 */
export function resolveAirportsStyle(
  palette: RouteDotsPalette,
  options?: AirportsStyleOptions,
  defaultSize: number = AIRPORT_DOT_RADIUS_GLOBE,
): ResolvedAirportsStyle {
  const shared: AirportsStyleOptions = options ?? {};
  return {
    source: resolveEndpoint(shared, shared.source, palette, defaultSize),
    destination: resolveEndpoint(shared, shared.destination, palette, defaultSize),
  };
}
