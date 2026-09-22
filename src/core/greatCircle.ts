/**
 * Great-circle (spherical) geometry. Pure math — no three.js, no DOM.
 *
 * All vectors are plain `[x, y, z]` triples; the conversion between lat/lng
 * and 3D matches the equirectangular convention used by the globe renderer.
 */
import type { LatLon } from '../types.js';

export const DEG = Math.PI / 180;
/** Mean Earth radius in kilometres (IUGG). */
export const EARTH_RADIUS_KM = 6371;

export type Vec3 = [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Converts degrees to a unit-sphere vector. */
export function latLngToVec(lat: number, lng: number, r = 1): Vec3 {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Inverse of {@link latLngToVec}. */
export function vecToLatLng(v: Vec3): LatLon {
  const r = Math.hypot(v[0], v[1], v[2]);
  if (r === 0) return { lat: 0, lng: 0 };
  const lat = 90 - Math.acos(clamp(v[1] / r, -1, 1)) / DEG;
  let lng = Math.atan2(v[2], -v[0]) / DEG - 180;
  lng = ((lng + 540) % 360) - 180;
  return { lat: clamp(lat, -90, 90), lng };
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/**
 * Spherical linear interpolation between two unit vectors.
 *
 * @throws {RangeError} when the points are (nearly) antipodal — the
 *   great-circle path between antipodes is not unique.
 */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = Math.acos(clamp(dot(a, b), -1, 1));
  if (omega < 1e-6) return [a[0], a[1], a[2]];
  if (omega > Math.PI - 1e-4) {
    throw new RangeError('slerp: antipodal endpoints have no unique great-circle path');
  }
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return [wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]];
}

/** Central angle (radians) between two points on the sphere. */
export function angularDistance(a: LatLon, b: LatLon): number {
  return Math.acos(clamp(dot(latLngToVec(a.lat, a.lng), latLngToVec(b.lat, b.lng)), -1, 1));
}

/** Great-circle distance in kilometres. */
export function greatCircleDistanceKm(a: LatLon, b: LatLon): number {
  return EARTH_RADIUS_KM * angularDistance(a, b);
}

/** Midpoint of the shorter great-circle arc from `a` to `b`. */
export function greatCircleMidpoint(a: LatLon, b: LatLon): LatLon {
  return vecToLatLng(slerp(latLngToVec(a.lat, a.lng), latLngToVec(b.lat, b.lng), 0.5));
}

export interface ArcOptions {
  /** Number of segments (default 64). */
  segments?: number;
  /**
   * Arc lift: extra radius at the arc's midpoint as a fraction of the globe
   * radius (0 = flat great circle hugging the surface, default 0.2).
   * Endpoints always stay on the surface.
   */
  lift?: number;
}

/**
 * Samples the lifted great-circle arc from `a` to `b`.
 *
 * Radius along the arc follows `1 + lift * sin(π t)`, so the arc departs
 * from the surface at the origin, peaks at the midpoint and lands at the
 * destination — the classic airline-map "bulge".
 *
 * @returns `segments + 1` points in unit-sphere coordinates.
 */
export function greatCircleArc(a: LatLon, b: LatLon, options: ArcOptions = {}): Vec3[] {
  const segments = Math.max(2, Math.floor(options.segments ?? 64));
  const lift = options.lift ?? 0.2;
  const va = latLngToVec(a.lat, a.lng);
  const vb = latLngToVec(b.lat, b.lng);
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = slerp(va, vb, t);
    const f = 1 + lift * Math.sin(Math.PI * t);
    points.push([p[0] * f, p[1] * f, p[2] * f]);
  }
  return points;
}
