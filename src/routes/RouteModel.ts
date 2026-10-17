/**
 * Pure route model: turns an origin/destination pair (plus trip type) into
 * the list of arc specs the renderer draws.
 *
 * Round trips share **one edge** between the two cities — the plane flies
 * the same curve out and back, and the dash direction / trail visibility
 * flip direction each leg. (Older builds rendered two arcs with different
 * lifts to keep "there and back" readable; that proved visually noisy and
 * made the plane teleport between tubes.)
 *
 * Each arc also carries a **curve angle**: how far it is banked out of its
 * great-circle plane (see `arcPath.ts`). Outbound and return can still be
 * shaped independently when a developer explicitly disables the single-edge
 * mode via `dualEdge: true`.
 */
import type { LatLon } from '../types.js';
import { normalizeArcAngleDeg } from './arcPath.js';

export type ArcId = 'outbound' | 'return' | 'roundtrip';

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
  /** True when round-trip is drawn as one edge (default); false for two arcs. */
  singleEdge: boolean;
  arcs: RouteArcSpec[];
}

export interface BuildRouteOptions {
  roundTrip?: boolean;
  /**
   * Draw two separate arcs (outbound + return) for round trips instead of
   * sharing one edge. Default `false` — the modern single-edge behaviour.
   */
  dualEdge?: boolean;
  /** Outbound lift (default 0.10). */
  outboundLift?: number;
  /** Return lift (default 0.12) — used only with `dualEdge: true`. */
  returnLift?: number;
  /** Outbound curve angle in degrees (default 0 — a pure great circle). */
  outboundAngle?: number;
  /** Return curve angle in degrees (default 0) — used only with `dualEdge: true`. */
  returnAngle?: number;
}

/** Default outbound lift. */
export const DEFAULT_OUTBOUND_LIFT = 0.1;
/** Default return lift (slightly higher, for the dual-edge fallback). */
export const DEFAULT_RETURN_LIFT = 0.12;
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
  const dualEdge = (options.dualEdge ?? false) && roundTrip;
  const outboundLift = options.outboundLift ?? DEFAULT_OUTBOUND_LIFT;
  const returnLift = options.returnLift ?? DEFAULT_RETURN_LIFT;
  const outboundAngle = normalizeArcAngleDeg(options.outboundAngle);
  const returnAngle = normalizeArcAngleDeg(options.returnAngle);

  if (roundTrip && !dualEdge) {
    // Single shared edge — one tube; the plane/dash direction flips each leg.
    return {
      origin,
      dest,
      roundTrip: true,
      singleEdge: true,
      arcs: [
        {
          id: 'roundtrip',
          from: origin,
          to: dest,
          lift: outboundLift,
          angle: outboundAngle,
          order: 0,
        },
      ],
    };
  }

  const arcs: RouteArcSpec[] = [
    { id: 'outbound', from: origin, to: dest, lift: outboundLift, angle: outboundAngle, order: 0 },
  ];
  if (dualEdge) {
    arcs.push({
      id: 'return',
      from: dest,
      to: origin,
      lift: returnLift,
      angle: returnAngle,
      order: 1,
    });
  }
  return { origin, dest, roundTrip, singleEdge: false, arcs };
}
