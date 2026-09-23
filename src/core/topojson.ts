/**
 * Minimal TopoJSON decoder (structural subset, no external dependencies).
 *
 * Just enough to turn a world-atlas `land-110m.json` / `countries-110m.json`
 * topology into plain rings of [lng, lat] coordinates for the rasterizer, the
 * country fills and the border lines.
 */
import { splitPolygonAtAntimeridian } from './antimeridian.js';

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

/** Optional per-feature metadata carried by world-atlas country geometries. */
export interface TopoGeometryProperties {
  /** Feature name, e.g. "Fiji". */
  name?: string;
}

/** One country geometry in a world-atlas `countries-110m` topology. */
export interface TopoCountryGeometry extends TopoGeometry {
  /** ISO 3166-1 numeric code, e.g. "242". */
  id?: string;
  properties?: TopoGeometryProperties;
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

export interface TopoCountries {
  type: 'Topology';
  arcs: number[][][];
  transform?: TopoTransform;
  bbox?: [number, number, number, number];
  objects: {
    countries: {
      type: string;
      geometries: TopoCountryGeometry[];
    };
  };
}

/**
 * Decodes a stored (possibly quantized, delta-encoded) arc into absolute
 * [lng, lat] points.
 */
function decodeStoredArc(arc: number[][], transform?: TopoTransform): Ring {
  if (!transform) return arc.map(([px, py]) => [px ?? 0, py ?? 0] as Point);
  const [sx, sy] = transform.scale;
  const [tx, ty] = transform.translate;
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx ?? 0;
    y += dy ?? 0;
    return [x * sx + tx, y * sy + ty] as Point;
  });
}

/** Builds a closed ring from a list of arc indices (shared-arc aware). */
type RingBuilder = (arcIndices: number[]) => Ring;

/**
 * Creates a memoized ring builder for a topology: arcs are decoded once and
 * reused (with reversal for negative indices), then concatenated into closed
 * rings.
 */
function createRingBuilder(topo: { arcs: number[][][]; transform?: TopoTransform }): RingBuilder {
  const cache = new Map<number, Ring>();

  const decodeArc = (index: number): Ring => {
    const stored = cache.get(index);
    if (stored) return stored;

    const arc = topo.arcs[Math.abs(index >= 0 ? index : ~index)] ?? [];
    const ring = decodeStoredArc(arc, topo.transform);

    const resolved = index < 0 ? [...ring].reverse() : ring;
    cache.set(index, resolved);
    return resolved;
  };

  return (arcIndices: number[]): Ring => {
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
}

/** Walks Polygon / MultiPolygon geometries into `[outerRing, ...holes]` polygons. */
function collectPolygons(geometries: TopoGeometry[], buildRing: RingBuilder): PolygonRings[] {
  const polygons: PolygonRings[] = [];
  for (const geometry of geometries) {
    const raw = geometry.arcs ?? [];
    const candidates: number[][][] =
      geometry.type === 'Polygon' ? [raw as number[][]] : (raw as number[][][]);
    for (const poly of candidates) {
      const rings = poly.map(buildRing);
      if (rings.some((r) => r.length > 2)) polygons.push(rings);
    }
  }
  return polygons;
}

/**
 * Decodes a quantized or absolute-coordinate topology into polygon rings.
 *
 * @returns An array of polygons, each `[outerRing, ...holes]`.
 */
export function decodeRings(topo: TopoLand): PolygonRings[] {
  return collectPolygons(topo.objects.land.geometries, createRingBuilder(topo));
}

/**
 * Decodes a countries topology into fillable polygons: every country polygon
 * (holes included), split at the antimeridian so no part crosses ±180° and
 * degenerate clipping slivers are dropped.
 *
 * @returns An array of polygons, each `[outerRing, ...holes]`.
 */
export function decodeCountryPolygons(topo: TopoCountries): PolygonRings[] {
  const polygons = collectPolygons(topo.objects.countries.geometries, createRingBuilder(topo));
  return polygons.flatMap((polygon) => splitPolygonAtAntimeridian(polygon));
}

/** Total number of vertices across all rings (handy for profiling/tests). */
export function countRingVertices(polygons: PolygonRings[]): number {
  let count = 0;
  for (const rings of polygons) for (const ring of rings) count += ring.length;
  return count;
}

/**
 * Decodes every stored arc of a countries topology into absolute-coordinate
 * polylines of [lng, lat].
 *
 * In a TopoJSON topology arcs are shared between the polygons on both sides
 * of a border, so the decoded polylines are exactly the country border lines
 * — each drawn once, with no duplicates. Degenerate arcs (fewer than two
 * distinct points) are dropped.
 */
export function decodeBorderArcs(topo: TopoCountries): Ring[] {
  const lines: Ring[] = [];
  for (const arc of topo.arcs) {
    const decoded = decodeStoredArc(arc, topo.transform);
    const line: Ring = [];
    for (const point of decoded) {
      const last = line[line.length - 1];
      if (last && last[0] === point[0] && last[1] === point[1]) continue;
      line.push(point);
    }
    if (line.length > 1) lines.push(line);
  }
  return lines;
}
