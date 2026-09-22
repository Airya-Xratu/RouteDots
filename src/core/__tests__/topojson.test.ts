import { describe, expect, it } from 'vitest';
import land from '../../data/land-110m.js';
import { countRingVertices, decodeRings, type TopoLand } from '../topojson.js';

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
