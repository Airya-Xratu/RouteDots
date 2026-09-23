import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEG, dot, latLngToVec, type Vec3 } from '../../core/greatCircle.js';
import { decodeCountryPolygons, type PolygonRings, type Ring } from '../../core/topojson.js';
import countries from '../../data/countries-110m.js';
import {
  DEFAULT_COUNTRY_COLOR,
  DEFAULT_MAX_EDGE_DEG,
  CountrySurfaceLayer,
  chordAngleDeg,
  midpointOnSphere,
  toPositions,
  triangulatePolygonOnSphere,
  triangulatePolygonsOnSphere,
} from '../countrySurface.js';
import { LAYER_RADIUS } from '../layerRadii.js';

const square = (minLng: number, minLat: number, size: number): Ring => [
  [minLng, minLat],
  [minLng + size, minLat],
  [minLng + size, minLat + size],
  [minLng, minLat + size],
  [minLng, minLat],
];

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * How many triangles of a flat corner list contain the point `p`.
 *
 * A point is inside a spherical triangle when it lies on the same side of all
 * three edge great circles *as the triangle itself* — comparing against the
 * centroid keeps the test correct for either winding (earcut emits both).
 */
function coveringTriangles(corners: Vec3[], p: Vec3): number {
  const side = (a: Vec3, b: Vec3, q: Vec3): number => Math.sign(dot(cross(a, b), q));
  let count = 0;
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    const c = corners[i + 2]!;
    const centroid: Vec3 = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
    const edges: [Vec3, Vec3][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const inside = edges.every(([u, v]) => {
      const expected = side(u, v, centroid);
      const actual = side(u, v, p);
      return expected !== 0 && actual === expected;
    });
    if (inside) count++;
  }
  return count;
}

function longestEdgeDeg(corners: Vec3[]): number {
  let longest = 0;
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    const c = corners[i + 2]!;
    longest = Math.max(longest, chordAngleDeg(a, b), chordAngleDeg(b, c), chordAngleDeg(c, a));
  }
  return longest;
}

describe('chordAngleDeg / midpointOnSphere', () => {
  it('measures the central angle between two sphere points', () => {
    expect(chordAngleDeg(latLngToVec(0, 0), latLngToVec(0, 90))).toBeCloseTo(90, 6);
    expect(chordAngleDeg(latLngToVec(0, 0), latLngToVec(0, 0))).toBeCloseTo(0, 6);
  });

  it('puts the midpoint back on the sphere, halfway along the arc', () => {
    const mid = midpointOnSphere(latLngToVec(0, 0), latLngToVec(0, 40));
    expect(Math.hypot(...mid)).toBeCloseTo(1, 9);
    expect(chordAngleDeg(latLngToVec(0, 0), mid)).toBeCloseTo(20, 6);
  });

  it('is idempotent for coincident points', () => {
    const a = latLngToVec(10, 20);
    expect(midpointOnSphere(a, a)).toEqual(a);
  });
});

describe('triangulatePolygonOnSphere', () => {
  it('splits a small square into two triangles on the unit sphere', () => {
    const corners = triangulatePolygonOnSphere([square(10, 10, 1)]);
    expect(corners).toHaveLength(6);
    for (const v of corners) expect(Math.hypot(...v)).toBeCloseTo(1, 9);
  });

  it('honours the requested radius', () => {
    const corners = triangulatePolygonOnSphere([square(10, 10, 1)], { radius: 1.0025 });
    for (const v of corners) expect(Math.hypot(...v)).toBeCloseTo(1.0025, 6);
  });

  it('subdivides until no edge exceeds maxEdgeDeg', () => {
    const corners = triangulatePolygonOnSphere([square(-30, -30, 60)], { maxEdgeDeg: 6 });
    expect(corners.length / 3).toBeGreaterThan(2);
    expect(longestEdgeDeg(corners)).toBeLessThanOrEqual(6 + 1e-9);
  });

  it('keeps large triangles when the budget is generous', () => {
    const corners = triangulatePolygonOnSphere([square(-30, -30, 20)], { maxEdgeDeg: 90 });
    expect(corners).toHaveLength(6);
  });

  it('leaves a hole empty', () => {
    const polygon: PolygonRings = [square(0, 0, 40), square(15, 15, 10)];
    const corners = triangulatePolygonOnSphere(polygon, { maxEdgeDeg: 90 });
    expect(coveringTriangles(corners, latLngToVec(20, 20))).toBe(0); // inside the hole
    expect(coveringTriangles(corners, latLngToVec(5, 5))).toBeGreaterThan(0); // inside the ring
  });

  it('skips degenerate polygons instead of throwing', () => {
    expect(triangulatePolygonOnSphere([])).toEqual([]);
    expect(triangulatePolygonOnSphere([[[0, 0]]])).toEqual([]);
  });
});

describe('triangulatePolygonsOnSphere — bundled countries', () => {
  const polygons = decodeCountryPolygons(countries);
  const corners = triangulatePolygonsOnSphere(polygons, {
    maxEdgeDeg: DEFAULT_MAX_EDGE_DEG,
    radius: LAYER_RADIUS.countries,
  });

  it('builds a watertight shell of small triangles', () => {
    expect(corners.length / 3).toBeGreaterThan(10_000);
    expect(corners.length / 3).toBeLessThan(60_000);
    expect(longestEdgeDeg(corners)).toBeLessThanOrEqual(DEFAULT_MAX_EDGE_DEG + 1e-9);
    for (const v of corners) {
      expect(Math.hypot(...v)).toBeCloseTo(LAYER_RADIUS.countries, 5);
    }
  });

  it('covers known land and leaves known ocean empty', () => {
    // Inland points: at 1:110m a coastal city centre (Manhattan, say) can
    // legitimately fall on water, so the samples stay away from the coast.
    const land: [number, number][] = [
      [51.5, -0.1], // London
      [48.85, 2.35], // Paris
      [35.7, 51.4], // Tehran
      [28.6, 77.2], // Delhi
      [39.74, -104.99], // Denver
      [-15.8, -47.9], // Brasília
      [-23.7, 133.9], // Alice Springs
      [-1.29, 36.82], // Nairobi
      [62, 100], // central Siberia
      [-80, 0], // Antarctica
    ];
    for (const [lat, lng] of land) {
      expect(
        coveringTriangles(corners, latLngToVec(lat, lng)),
        `land at ${lat},${lng}`,
      ).toBeGreaterThan(0);
    }

    const ocean: [number, number][] = [
      [0, -140], // mid Pacific
      [30, -40], // mid Atlantic
      [-20, 80], // Indian Ocean
      [60, -20], // North Atlantic
    ];
    for (const [lat, lng] of ocean) {
      expect(coveringTriangles(corners, latLngToVec(lat, lng)), `ocean at ${lat},${lng}`).toBe(0);
    }
  });

  it('is deterministic', () => {
    const again = triangulatePolygonsOnSphere(polygons, {
      maxEdgeDeg: DEFAULT_MAX_EDGE_DEG,
      radius: LAYER_RADIUS.countries,
    });
    expect(toPositions(again)).toEqual(toPositions(corners));
  });

  it('builds in well under a frame budget of a few hundred ms', () => {
    const started = performance.now();
    triangulatePolygonsOnSphere(polygons, { maxEdgeDeg: DEFAULT_MAX_EDGE_DEG });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('toPositions', () => {
  it('flattens corners into xyz triples', () => {
    const positions = toPositions([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(positions).toBeInstanceOf(Float32Array);
    expect([...positions]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('CountrySurfaceLayer', () => {
  it('adds one mesh with the whole world to its parent', () => {
    const parent = new THREE.Group();
    const layer = new CountrySurfaceLayer(parent);

    expect(layer.triangleCount).toBeGreaterThan(10_000);
    expect(layer.mesh.geometry.getAttribute('position').count).toBe(layer.triangleCount * 3);
    expect(layer.mesh.material.color.getHexString()).toBe(DEFAULT_COUNTRY_COLOR.slice(1));
    expect(layer.mesh.material.side).toBe(THREE.DoubleSide);
    expect(layer.mesh.parent).toBe(parent);

    layer.dispose();
    expect(layer.mesh.parent).toBeNull();
  });

  it('accepts pre-decoded polygons and a custom colour/radius', () => {
    const parent = new THREE.Group();
    const layer = new CountrySurfaceLayer(parent, {
      polygons: [[square(0, 0, 2)]],
      color: '#ff0000',
      radius: 1.5,
    });
    expect(layer.triangleCount).toBe(2);
    expect(layer.mesh.material.color.getHexString()).toBe('ff0000');
    const positions = layer.mesh.geometry.getAttribute('position');
    expect(Math.hypot(positions.getX(0), positions.getY(0), positions.getZ(0))).toBeCloseTo(1.5, 6);
    layer.dispose();
  });
});

describe('chord sag stays above the shell below', () => {
  it('keeps the default edge budget inside the country lift', () => {
    const sag = 1 - Math.cos((DEFAULT_MAX_EDGE_DEG / 2) * DEG);
    expect(sag).toBeLessThan(LAYER_RADIUS.countries - LAYER_RADIUS.globe);
  });
});
