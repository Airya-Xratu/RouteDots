/**
 * Minimal TopoJSON decoder (structural subset, no external dependencies).
 *
 * Just enough to turn a world-atlas `land-110m.json` topology into plain
 * rings of [lng, lat] coordinates for the rasterizer.
 */

/** A single [lng, lat] coordinate. */
export type Point = [number, number];
/** A ring (sequence of points). */
export type Ring = Point[];
/** One polygon: [outer ring, ...hole rings]. */
export type PolygonRings = Ring[];

export interface TopoTransform {
  scale: [number, number];
  translate: [number, number];
}

export interface TopoGeometry {
  type: 'Polygon' | 'MultiPolygon' | string;
  /** For Polygon: rings of arc indices. For MultiPolygon: polygons of rings. */
  arcs?: number[][] | number[][][];
}

export interface TopoLand {
  type: 'Topology';
  arcs: number[][][];
  transform?: TopoTransform;
  objects: {
    land: {
      type: string;
      geometries: TopoGeometry[];
    };
  };
}

/**
 * Decodes a quantized or absolute-coordinate topology into polygon rings.
 *
 * @returns An array of polygons, each `[outerRing, ...holes]`.
 */
export function decodeRings(topo: TopoLand): PolygonRings[] {
  const cache = new Map<number, Ring>();

  const decodeArc = (index: number): Ring => {
    const stored = cache.get(index);
    if (stored) return stored;

    const arc = topo.arcs[Math.abs(index >= 0 ? index : ~index)] ?? [];
    let x = 0;
    let y = 0;
    let ring: Ring;
    if (topo.transform) {
      const [sx, sy] = topo.transform.scale;
      const [tx, ty] = topo.transform.translate;
      ring = arc.map(([dx, dy]) => {
        x += dx ?? 0;
        y += dy ?? 0;
        return [x * sx + tx, y * sy + ty] as Point;
      });
    } else {
      ring = arc.map(([px, py]) => [px ?? 0, py ?? 0] as Point);
    }

    const resolved = index < 0 ? [...ring].reverse() : ring;
    cache.set(index, resolved);
    return resolved;
  };

  const buildRing = (arcIndices: number[]): Ring => {
    const ring: Ring = [];
    for (const arcIndex of arcIndices) {
      const arc = decodeArc(arcIndex);
      for (const point of arc) {
        const last = ring[ring.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) continue;
        ring.push(point);
      }
    }
    if (ring.length > 1) {
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    }
    return ring;
  };

  const polygons: PolygonRings[] = [];
  for (const geometry of topo.objects.land.geometries) {
    const raw = geometry.arcs ?? [];
    if (geometry.type === 'Polygon') {
      const rings = (raw as number[][]).map(buildRing);
      if (rings.some((r) => r.length > 2)) polygons.push(rings);
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of raw as number[][][]) {
        const rings = poly.map(buildRing);
        if (rings.some((r) => r.length > 2)) polygons.push(rings);
      }
    }
  }
  return polygons;
}

/** Total number of vertices across all rings (handy for profiling/tests). */
export function countRingVertices(polygons: PolygonRings[]): number {
  let count = 0;
  for (const rings of polygons) for (const ring of rings) count += ring.length;
  return count;
}
