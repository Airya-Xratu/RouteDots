import { describe, expect, it } from 'vitest';
import land from '../../data/land-110m.js';
import countries from '../../data/countries-110m.js';
import {
  countRingVertices,
  decodeBorderArcs,
  decodeRings,
  type TopoCountries,
  type TopoLand,
} from '../topojson.js';

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
