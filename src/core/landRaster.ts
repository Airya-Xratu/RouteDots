/**
 * Even-odd scanline rasterization of land polygons onto a latitude/longitude
 * grid (equirectangular). Pure TypeScript — no DOM, fully unit-testable.
 */
import type { PolygonRings } from './topojson.js';

/** A rasterized land mask. */
export interface LandGrid {
  /** Columns (longitude), covering 360°. */
  cols: number;
  /** Rows (latitude), covering 180°. */
  rows: number;
  /** Grid resolution in degrees per cell. */
  resDeg: number;
  /** Row-major 0/1 mask; (0,0) = (lng -180, lat +90). */
  data: Uint8Array;
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** First row (inclusive) the edge can intersect. */
  r0: number;
  /** Last row (inclusive) the edge can intersect. */
  r1: number;
}

/**
 * Rasterizes land polygons onto a regular lat/lng grid using the classic
 * even-odd (parity) scanline fill.
 *
 * Polygons are assumed to be antimeridian-safe (world-atlas guarantees this:
 * landmasses crossing ±180° are split into multiple polygons).
 */
export function rasterizeLand(polygons: PolygonRings[], resDeg: number): LandGrid {
  if (resDeg <= 0 || resDeg > 5) {
    throw new RangeError(`resDeg must be in (0, 5], got ${resDeg}`);
  }
  const cols = Math.round(360 / resDeg);
  const rows = Math.round(180 / resDeg);
  const data = new Uint8Array(cols * rows);

  const edges: Edge[] = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const yMin = Math.min(a[1], b[1]);
        const yMax = Math.max(a[1], b[1]);
        const r0 = Math.max(0, Math.floor((90 - yMax) / resDeg));
        const r1 = Math.min(rows - 1, Math.floor((90 - yMin) / resDeg));
        if (r0 <= r1) {
          edges.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], r0, r1 });
        }
      }
    }
  }

  const crossings: number[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = 90 - (r + 0.5) * resDeg; // row centre latitude
    crossings.length = 0;
    for (const e of edges) {
      if (r < e.r0 || r > e.r1 || e.y1 === e.y2) continue;
      if (e.y1 > lat === e.y2 > lat) continue; // both on same side
      const t = (lat - e.y1) / (e.y2 - e.y1);
      crossings.push(e.x1 + t * (e.x2 - e.x1));
    }
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xa = crossings[k]!;
      const xb = crossings[k + 1]!;
      const c0 = Math.max(0, Math.floor((xa + 180) / resDeg));
      const c1 = Math.min(cols - 1, Math.ceil((xb + 180) / resDeg) - 1);
      for (let c = c0; c <= c1; c++) data[r * cols + c] = 1;
    }
  }

  return { cols, rows, resDeg, data };
}

/** True when the cell containing (lat, lng) is land. */
export function isLandAt(grid: LandGrid, lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat > 90 || lat < -90) return false;
  const clng = ((((lng + 180) % 360) + 360) % 360) - 180;
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((clng + 180) / grid.resDeg)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((90 - lat) / grid.resDeg)));
  return grid.data[r * grid.cols + c] === 1;
}
