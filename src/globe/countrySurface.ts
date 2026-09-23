/**
 * CountrySurface — the grey country fills of the map.
 *
 * The bundled world-atlas `countries-110m` topology is decoded into polygons
 * (antimeridian-safe, see `core/antimeridian.ts`), triangulated in lng/lat
 * space with three.js' earcut, and every triangle is then projected onto the
 * sphere and recursively subdivided until its longest edge is short enough
 * that the flat chord cannot sag below the shell it floats on.
 *
 * Subdivision uses edge midpoints, which two neighbouring triangles compute
 * identically — so the mesh stays watertight (no hairline cracks between
 * countries) instead of tessellating each triangle independently.
 *
 * The whole world lands in a single non-indexed `BufferGeometry`
 * (~40k triangles, ~1.4 MB) drawn in one call, just above the ocean sphere.
 */
import * as THREE from 'three';
import { DEG, dot, latLngToVec, norm, type Vec3 } from '../core/greatCircle.js';
import { openRing } from '../core/antimeridian.js';
import { decodeCountryPolygons, type Point, type PolygonRings } from '../core/topojson.js';
import countriesTopo from '../data/countries-110m.js';
import { LAYER_RADIUS } from './layerRadii.js';

/**
 * Longest triangle edge allowed on the sphere, in degrees. A chord of this
 * length sags by `1 − cos(3°) ≈ 0.0014` globe radii — comfortably less than
 * the country shell's lift above the ocean sphere.
 */
export const DEFAULT_MAX_EDGE_DEG = 6;

/** Default country fill colour (a neutral grey). */
export const DEFAULT_COUNTRY_COLOR = '#c3c9d4';

const MAX_SUBDIVISION_DEPTH = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Central angle between two sphere vectors, in degrees. */
export function chordAngleDeg(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1)) / DEG;
}

/** Midpoint of the shorter great-circle arc a→b, back on the sphere. */
export function midpointOnSphere(a: Vec3, b: Vec3): Vec3 {
  const sum: Vec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const length = norm(sum);
  if (length < 1e-9) return a; // antipodal: any midpoint is as good
  return [sum[0] / length, sum[1] / length, sum[2] / length];
}

export interface SphericalTriangulationOptions {
  /** Longest allowed triangle edge in degrees (default 6). */
  maxEdgeDeg?: number;
  /** Sphere radius the corners are scaled out to (default 1 — the unit sphere). */
  radius?: number;
}

/** Appends `a, b, c` (recursively subdivided) to `out`. */
function tessellate(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  maxEdgeDeg: number,
  depth: number,
  out: Vec3[],
): void {
  const longest = Math.max(chordAngleDeg(a, b), chordAngleDeg(b, c), chordAngleDeg(c, a));
  if (longest <= maxEdgeDeg || depth >= MAX_SUBDIVISION_DEPTH) {
    out.push(a, b, c);
    return;
  }
  const ab = midpointOnSphere(a, b);
  const bc = midpointOnSphere(b, c);
  const ca = midpointOnSphere(c, a);
  tessellate(a, ab, ca, maxEdgeDeg, depth + 1, out);
  tessellate(ab, b, bc, maxEdgeDeg, depth + 1, out);
  tessellate(ca, bc, c, maxEdgeDeg, depth + 1, out);
  tessellate(ab, bc, ca, maxEdgeDeg, depth + 1, out);
}

/**
 * Triangulates one polygon (`[outerRing, ...holes]`) onto the sphere.
 *
 * @returns A flat list of triangle corners (3 vectors per triangle). A
 *   polygon that earcut cannot handle (self-intersecting input) yields none.
 */
export function triangulatePolygonOnSphere(
  polygon: PolygonRings,
  options: SphericalTriangulationOptions = {},
): Vec3[] {
  const maxEdgeDeg = options.maxEdgeDeg ?? DEFAULT_MAX_EDGE_DEG;
  const radius = options.radius ?? 1;
  const rings = polygon.map(openRing).filter((ring) => ring.length >= 3);
  const contour = rings[0];
  if (!contour) return [];
  const holes = rings.slice(1);

  const toVector2 = (ring: Point[]): THREE.Vector2[] =>
    ring.map(([lng, lat]) => new THREE.Vector2(lng, lat));

  let faces: number[][];
  try {
    faces = THREE.ShapeUtils.triangulateShape(toVector2(contour), holes.map(toVector2));
  } catch {
    // A malformed ring must not take the whole map down: skip the country.
    return [];
  }

  // Face indices address `contour` followed by the holes, in order — exactly
  // the layout three.js flattened before calling earcut.
  const points: Point[] = [...contour, ...holes.flat()];
  const spherePoints = points.map(([lng, lat]) => latLngToVec(lat, lng));

  // Tessellate on the unit sphere (so edge lengths are true angles and the
  // shared-edge midpoints of neighbouring triangles coincide), then scale out
  // to the requested shell radius.
  const out: Vec3[] = [];
  for (const face of faces) {
    const a = spherePoints[face[0]!];
    const b = spherePoints[face[1]!];
    const c = spherePoints[face[2]!];
    if (!a || !b || !c) continue;
    tessellate(a, b, c, maxEdgeDeg, 0, out);
  }
  if (radius === 1) return out;
  return out.map(([x, y, z]) => [x * radius, y * radius, z * radius] as Vec3);
}

/** Triangulates every polygon of a decoded country set onto the sphere. */
export function triangulatePolygonsOnSphere(
  polygons: PolygonRings[],
  options: SphericalTriangulationOptions = {},
): Vec3[] {
  const out: Vec3[] = [];
  for (const polygon of polygons) {
    out.push(...triangulatePolygonOnSphere(polygon, options));
  }
  return out;
}

/** Flattens triangle corners into a `position` attribute array. */
export function toPositions(vertices: Vec3[]): Float32Array {
  const positions = new Float32Array(vertices.length * 3);
  vertices.forEach(([x, y, z], i) => {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  });
  return positions;
}

export interface CountrySurfaceLayerOptions {
  /** Fill colour (default {@link DEFAULT_COUNTRY_COLOR}). */
  color?: string;
  /** Shell radius in globe radii (default {@link LAYER_RADIUS.countries}). */
  radius?: number;
  /** Longest triangle edge in degrees (default {@link DEFAULT_MAX_EDGE_DEG}). */
  maxEdgeDeg?: number;
  /** Replace the bundled country topology with pre-decoded polygons. */
  polygons?: PolygonRings[];
}

/** One draw call holding every country fill of the map. */
export class CountrySurfaceLayer {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Number of triangles the fills are built from. */
  readonly triangleCount: number;

  constructor(parent: THREE.Object3D, options: CountrySurfaceLayerOptions = {}) {
    const polygons = options.polygons ?? decodeCountryPolygons(countriesTopo);
    const vertices = triangulatePolygonsOnSphere(polygons, {
      maxEdgeDeg: options.maxEdgeDeg,
      radius: options.radius ?? LAYER_RADIUS.countries,
    });
    this.triangleCount = vertices.length / 3;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(toPositions(vertices), 3));
    geometry.computeBoundingSphere();

    // Earcut's winding depends on the input ring orientation, so the fills are
    // rendered double-sided rather than trusting a consistent front face.
    const material = new THREE.MeshBasicMaterial({
      color: options.color ?? DEFAULT_COUNTRY_COLOR,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    parent.add(this.mesh);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
