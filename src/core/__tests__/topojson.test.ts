import { describe, expect, it } from 'vitest';
import land from '../../data/land-110m.js';
import countries from '../../data/countries-110m.js';
import { isLandAt, rasterizeLand } from '../landRaster.js';
import {
  countRingVertices,
  decodeBorderArcs,
  decodeCountryPolygons,
  decodeRings,
  type PolygonRings,
  type Ring,
  type TopoCountries,
  type TopoLand,
} from '../topojson.js';

/** Even-odd point-in-polygon over one polygon (`[outer, ...holes]`). */
function pointInPolygon(rings: Ring[], lng: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > lat === yj > lat) continue;
      if (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** True when the point falls inside any of the decoded country polygons. */
function pointInCountries(polygons: PolygonRings[], lng: number, lat: number): boolean {
  return polygons.some((rings) => pointInPolygon(rings, lng, lat));
}

describe('decodeRings — bundled world land mask', () => {
  const polygons = decodeRings(land);

  it('decodes a large number of land polygons', () => {
    expect(polygons.length).toBeGreaterThan(50);
  });

  it('produces closed, non-degenerate rings with finite in-range coordinates', () => {
    for (const rings of polygons) {
      for (const ring of rings) {
        expect(ring.length).toBeGreaterThan(3);
        const first = ring[0]!;
        const last = ring[ring.length - 1]!;
        expect(first[0]).toBeCloseTo(last[0], 6);
        expect(first[1]).toBeCloseTo(last[1], 6);
        for (const [lng, lat] of ring) {
          expect(Number.isFinite(lng)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
          expect(Math.abs(lat)).toBeLessThanOrEqual(90 + 1e-6);
          expect(Math.abs(lng)).toBeLessThanOrEqual(180 + 1e-6);
        }
      }
    }
    expect(countRingVertices(polygons)).toBeGreaterThan(5000);
  });
});

describe('decodeRings — synthetic quantized topology', () => {
  it('decodes quantized delta arcs with transform and closes rings', () => {
    const topo: TopoLand = {
      type: 'Topology',
      transform: { scale: [1, 1], translate: [0, 0] },
      arcs: [
        [
          [1, 0],
          [1, 0],
          [0, 1],
          [0, -1],
        ],
      ],
      objects: {
        land: {
          type: 'GeometryCollection',
          geometries: [{ type: 'Polygon', arcs: [[0]] }],
        },
      },
    };
    const polygons = decodeRings(topo);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(1);
    // (1,0) -> (2,0) -> (2,1) -> (2,0) -> closed back to (1,0)
    expect(polygons[0]![0]).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 0],
      [1, 0],
    ]);
  });

  it('reuses and reverses shared arcs (topojson ~n encoding)', () => {
    const topo: TopoLand = {
      type: 'Topology',
      arcs: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [-1, 0],
        ],
      ],
      objects: {
        land: {
          type: 'GeometryCollection',
          geometries: [{ type: 'Polygon', arcs: [[0, ~0]] }],
        },
      },
    };
    // arc0: (0,0)->(1,0)->(1,1)->(0,1); ~0: (0,1)->(1,1)->(1,0)->(0,0)
    const polygons = decodeRings(topo);
    const ring = polygons[0]![0]!;
    expect(ring.length).toBeGreaterThan(3);
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    expect(first[0]).toBeCloseTo(last[0], 9);
    expect(first[1]).toBeCloseTo(last[1], 9);
  });
});

describe('decodeBorderArcs — bundled world countries', () => {
  const lines = decodeBorderArcs(countries);

  it('decodes one polyline per stored arc (shared borders drawn once)', () => {
    // 595 stored arcs, a couple degenerate ones dropped
    expect(lines.length).toBeGreaterThan(550);
    expect(lines.length).toBeLessThanOrEqual(countries.arcs.length);
  });

  it('produces plenty of border vertices with in-range coordinates', () => {
    let vertices = 0;
    for (const line of lines) {
      expect(line.length).toBeGreaterThanOrEqual(2);
      vertices += line.length;
      for (const [lng, lat] of line) {
        expect(Number.isFinite(lng)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90 + 1e-6);
        expect(Math.abs(lng)).toBeLessThanOrEqual(180 + 1e-6);
      }
    }
    expect(vertices).toBeGreaterThan(5000);
  });
});

describe('decodeBorderArcs — synthetic quantized topology', () => {
  it('delta-decodes arcs to absolute coordinates and drops degenerate arcs', () => {
    const topo: TopoCountries = {
      type: 'Topology',
      transform: { scale: [1, 1], translate: [0, 0] },
      arcs: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ], // (0,0) (1,0) (1,1)
        [
          [5, 5],
          [2, 0],
          [0, 0],
          [0, 1],
        ], // (5,5) (7,5) (7,5) (7,6) — duplicate point
        [[3, 3]], // degenerate: single point
      ],
      objects: {
        countries: {
          type: 'GeometryCollection',
          geometries: [
            { type: 'Polygon', arcs: [[0]], id: '001', properties: { name: 'A' } },
            { type: 'Polygon', arcs: [[1]], id: '002', properties: { name: 'B' } },
          ],
        },
      },
    };

    const lines = decodeBorderArcs(topo);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    // consecutive duplicates collapse
    expect(lines[1]).toEqual([
      [5, 5],
      [7, 5],
      [7, 6],
    ]);
  });

  it('ignores geometry objects entirely (arcs are already the borders)', () => {
    const topo: TopoCountries = {
      type: 'Topology',
      arcs: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
      objects: {
        countries: { type: 'GeometryCollection', geometries: [] },
      },
    };
    expect(decodeBorderArcs(topo)).toEqual([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
  });
});

describe('decodeCountryPolygons — bundled countries', () => {
  const polygons = decodeCountryPolygons(countries);
  const landPolygons = decodeRings(land);

  it('decodes every country part, splitting multi-polygons and the seam', () => {
    expect(polygons.length).toBeGreaterThan(280);
    expect(polygons.length).toBeGreaterThan(countries.objects.countries.geometries.length);
    expect(countRingVertices(polygons)).toBeGreaterThan(10_000);
  });

  it('produces seam-safe rings: no jump across ±180° anywhere', () => {
    let seamTouchingParts = 0;
    for (const rings of polygons) {
      for (const ring of rings) {
        expect(ring.length).toBeGreaterThan(3);
        for (let i = 1; i < ring.length; i++) {
          const [lng] = ring[i]!;
          const [prevLng] = ring[i - 1]!;
          expect(Math.abs(lng - prevLng)).toBeLessThanOrEqual(180);
          expect(Math.abs(lng)).toBeLessThanOrEqual(180);
        }
        for (const [, lat] of ring) expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        if (ring.some(([lng]) => Math.abs(lng) === 180)) seamTouchingParts++;
      }
    }
    // Russia + Fiji (+ Antarctica's seam vertices) are cut along ±180°.
    expect(seamTouchingParts).toBeGreaterThanOrEqual(3);
  });

  it('covers the same land as the bundled land topology', () => {
    // Country polygons share their borders (TopoJSON arcs are referenced from
    // both sides), so they are tested per polygon rather than through the
    // even-odd land raster, which assumes disjoint rings.
    const fromLand = rasterizeLand(landPolygons, 1);

    let sampled = 0;
    let agreeing = 0;
    for (let lat = 87.5; lat > -87.5; lat -= 5) {
      for (let lng = -177.5; lng < 180; lng += 5) {
        sampled++;
        if (pointInCountries(polygons, lng, lat) === isLandAt(fromLand, lat, lng)) agreeing++;
      }
    }
    // Same Natural Earth source: the disagreements are coastal sample points
    // (a 5° grid lands in the sea right next to a coastline) and the odd
    // island only one of the two topologies keeps.
    expect(agreeing / sampled).toBeGreaterThan(0.95);
  });

  it('keeps South Africa’s hole (Lesotho)', () => {
    const [southAfrica] = polygons.filter((rings) => rings.length > 1);
    expect(southAfrica).toBeDefined();
    // The hole is a hole in South Africa…
    expect(pointInPolygon(southAfrica!, 26, -29)).toBe(true);
    expect(pointInPolygon(southAfrica!, 28.5, -29.5)).toBe(false);
    // …and Lesotho itself is its own country polygon.
    expect(pointInCountries(polygons, 28.5, -29.5)).toBe(true);
  });
});
