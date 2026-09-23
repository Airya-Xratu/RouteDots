/**
 * Pure route model: turns an origin/destination pair (plus trip type) into
 * the list of arc specs the renderer draws.
 *
 * Round trips produce two arcs with *different lifts* so the outbound and
 * return curves never overlap — each bulges a different amount, which is what
 * makes the "there and back" readable at a glance.
 *
 * Each arc also carries a **curve angle**: how far it is banked out of its
 * great-circle plane (see `arcPath.ts`). Outbound and return are shaped
 * independently, so a developer can curve one leg and keep the other a
 * textbook geodesic.
 */
import type { LatLon } from '../types.js';
import { normalizeArcAngleDeg } from './arcPath.js';

export type ArcId = 'outbound' | 'return';

export interface RouteArcSpec {
  id: ArcId;
  from: LatLon;
  to: LatLon;
  /** Arc lift as a fraction of the globe radius. */
  lift: number;
  /** Curve angle in degrees — banks the arc out of its great-circle plane. */
  angle: number;
  /** Draw order (0 first). */
  order: number;
}

export interface RouteSpec {
  origin: LatLon;
  dest: LatLon;
  roundTrip: boolean;
  arcs: RouteArcSpec[];
}

export interface BuildRouteOptions {
  roundTrip?: boolean;
  /** Outbound lift (default 0.10). */
  outboundLift?: number;
  /** Return lift (default 0.20) — must differ from the outbound lift. */
  returnLift?: number;
  /** Outbound curve angle in degrees (default 0 — a pure great circle). */
  outboundAngle?: number;
  /** Return curve angle in degrees (default 0). */
  returnAngle?: number;
}

/** Default outbound lift. */
export const DEFAULT_OUTBOUND_LIFT = 0.1;
/** Default return lift (visibly higher than outbound). */
export const DEFAULT_RETURN_LIFT = 0.2;
/** Default arc tube radius in globe units. */
export const DEFAULT_ARC_RADIUS = 0.0015;

const SAME_POINT_EPS = 0.01;

/**
 * Builds the arc list for a flight between two points.
 *
 * @throws {RangeError} when origin and destination (nearly) coincide.
 */
export function buildRoute(
  origin: LatLon,
  dest: LatLon,
  options: BuildRouteOptions = {},
): RouteSpec {
  const dLat = origin.lat - dest.lat;
  const dLng = ((origin.lng - dest.lng + 540) % 360) - 180;
  if (Math.hypot(dLat, dLng) < SAME_POINT_EPS) {
    throw new RangeError('buildRoute: origin and destination must be different points');
  }

  const roundTrip = options.roundTrip ?? false;
  const outboundLift = options.outboundLift ?? DEFAULT_OUTBOUND_LIFT;
  const returnLift = options.returnLift ?? DEFAULT_RETURN_LIFT;
  const outboundAngle = normalizeArcAngleDeg(options.outboundAngle);
  const returnAngle = normalizeArcAngleDeg(options.returnAngle);

  const arcs: RouteArcSpec[] = [
    { id: 'outbound', from: origin, to: dest, lift: outboundLift, angle: outboundAngle, order: 0 },
  ];
  if (roundTrip) {
    arcs.push({
      id: 'return',
      from: dest,
      to: origin,
      lift: returnLift,
      angle: returnAngle,
      order: 1,
    });
  }
  return { origin, dest, roundTrip, arcs };
}
