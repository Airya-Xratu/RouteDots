/**
 * Arc geometry — how a route gets from A to B in the air.
 *
 * Two independent controls shape a path, and both work the same way for
 * one-way and round-trip legs:
 *
 * - **lift** — the classic airline-map bulge: the arc leaves the surface at
 *   the origin and peaks at `1 + lift·sin(πt)` above its midpoint.
 * - **angle** — the *curve angle*, in degrees: the arc is banked out of its
 *   great-circle plane by rotating it about the chord (the straight line
 *   between the two endpoints), exactly like a plane flying a curved
 *   procedure rather than the geodesic. `0` is a pure great circle, positive
 *   and negative values bank to either side, and both endpoints stay put
 *   however large the angle is.
 *
 * Pure math — no three.js, no DOM — so the globe, the plane and the flat
 * world all fly the very same curve and it is unit-testable.
 */
import { DEG, latLngToVec, norm, slerp, type Vec3 } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';

/** Shape of one arc: how far it bulges (`lift`) and how far it banks (`angle`). */
export interface ArcShape {
  /**
   * Extra radius at the arc's midpoint, as a fraction of the globe radius
   * (default 0 — a great circle that hugs the surface).
   */
  lift?: number;
  /**
   * Curve angle in degrees (default 0). Banks the whole arc out of its
   * great-circle plane around the chord axis; clamped to ±85° so the curve
   * never folds back onto itself.
   */
  angle?: number;
}

/** Curve angle of an unbent great-circle arc. */
export const DEFAULT_ARC_ANGLE_DEG = 0;

/**
 * Largest curve angle the geometry accepts. Beyond ~90° the arc would start
 * curling back over its own endpoints, which is never what a route wants.
 */
export const MAX_ARC_ANGLE_DEG = 85;

/** Segments used when sampling an arc into points (tube + flat world). */
export const ARC_SEGMENTS = 128;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Normalizes a vector; returns null for (near) zero vectors. */
export function unit(v: Vec3): Vec3 | null {
  const length = norm(v);
  if (!Number.isFinite(length) || length < 1e-9) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * The chord axis of the a→b pair: the (unit) direction of `b − a`.
 *
 * This is the axis a banked arc rotates around, and it passes through both
 * endpoints — which is exactly why banking never moves them.
 */
export function chordAxis(a: Vec3, b: Vec3): Vec3 | null {
  return unit(sub(b, a));
}

/** Rodrigues' rotation formula: rotates `v` around a unit `axis` by `angleRad`. */
export function rotateAroundAxis(v: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dot = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  const cross: Vec3 = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];
  return [
    v[0] * cos + cross[0] * sin + axis[0] * dot * (1 - cos),
    v[1] * cos + cross[1] * sin + axis[1] * dot * (1 - cos),
    v[2] * cos + cross[2] * sin + axis[2] * dot * (1 - cos),
  ];
}

/** Clamps a curve angle into the supported range (non-finite → 0). */
export function normalizeArcAngleDeg(angle: number | undefined): number {
  if (!Number.isFinite(angle)) return DEFAULT_ARC_ANGLE_DEG;
  const value = angle as number;
  return Math.min(MAX_ARC_ANGLE_DEG, Math.max(-MAX_ARC_ANGLE_DEG, value));
}

/**
 * Point at parameter `t` (0 → 1) on the arc from `a` to `b`.
 *
 * Both inputs are unit vectors; the result is a point on the (lifted) arc:
 * `|result| = 1 + lift·sin(πt)`.
 */
export function arcPoint(a: Vec3, b: Vec3, t: number, shape: ArcShape = {}): Vec3 {
  const lift = Number.isFinite(shape.lift) ? (shape.lift as number) : 0;
  const angle = normalizeArcAngleDeg(shape.angle);
  let p = slerp(a, b, t);

  if (angle !== 0) {
    const axis = chordAxis(a, b);
    if (axis) {
      const rotated = rotateAroundAxis(sub(p, a), axis, angle * DEG);
      // Re-project onto the sphere: the rotation leaves the chord axis but
      // moves points off the surface, and the lifted profile must start from
      // a surface point.
      p = unit(add(a, rotated)) ?? p;
    }
  }

  const f = 1 + lift * Math.sin(Math.PI * t);
  return [p[0] * f, p[1] * f, p[2] * f];
}

/** Same as {@link arcPoint}, taking lat/lng endpoints. */
export function arcPointBetween(from: LatLon, to: LatLon, t: number, shape: ArcShape = {}): Vec3 {
  return arcPoint(latLngToVec(from.lat, from.lng), latLngToVec(to.lat, to.lng), t, shape);
}

/** Samples the arc from `from` to `to` into `segments + 1` points. */
export function arcSamples(
  from: LatLon,
  to: LatLon,
  shape: ArcShape = {},
  segments: number = ARC_SEGMENTS,
): Vec3[] {
  const count = Math.max(2, Math.floor(segments));
  const a = latLngToVec(from.lat, from.lng);
  const b = latLngToVec(to.lat, to.lng);
  const points: Vec3[] = [];
  for (let i = 0; i <= count; i++) points.push(arcPoint(a, b, i / count, shape));
  return points;
}

/**
 * How far the arc's midpoint sits above (or beside) the straight chord,
 * in globe radii — the "bulge" a flat-world or layout calculation wants.
 */
export function arcBulge(from: LatLon, to: LatLon, shape: ArcShape = {}): number {
  const a = latLngToVec(from.lat, from.lng);
  const b = latLngToVec(to.lat, to.lng);
  const mid = arcPoint(a, b, 0.5, shape);
  const chordMid = unit(add(a, b));
  if (!chordMid) return norm(mid) - 1;
  const projected = [mid[0] - chordMid[0], mid[1] - chordMid[1], mid[2] - chordMid[2]] as Vec3;
  return norm(projected);
}
