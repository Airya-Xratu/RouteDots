/**
 * Builds a hexagon tile pattern that fills *country interiors*.
 *
 * The grid is a pointy-top axial lattice (odd rows shifted right by half a
 * column), the same layout the dot lattice uses — but a candidate tile is
 * only kept when it satisfies both of these:
 *
 * - **inside a country** — its centre falls inside one country polygon
 *   (holes such as enclaves and lakes excluded), and
 * - **clear of every border line** — the whole hexagon keeps at least
 *   `insetDeg` of open space from every country border segment, so a tile
 *   never paints over a border line and never bleeds into a neighbour.
 *
 * The clearance test is two-tier: a cheap circle bound decides the easy
 * cases (the hexagon sits inside a disc of `sizeDeg` around its centre and
 * contains a disc of `sizeDeg · √3 / 2`), and only the thin band in between
 * pays for the exact hexagon-vs-segment distance.
 *
 * Everything here works in **degrees** treated as a flat plane — the same
 * space the equirectangular texture and the flat map draw in, so a tile that
 * clears a border here clears it on screen.
 *
 * Pure TypeScript — no DOM, no three.js, fully unit-testable.
 */
import type { Point, PolygonRings, Ring } from './topojson.js';
import type { LatLon } from '../types.js';

/** Options for {@link buildHexGrid}. */
export interface HexPatternOptions {
  /** Centre-to-centre tile spacing (grid pitch) in degrees (default 2.5). */
  spacingDeg?: number;
  /**
   * Tile size: the circum-radius (centre → vertex) in degrees.
   *
   * Defaults to `0.85 · spacingDeg / √3`, which leaves a 15 % gap between
   * neighbours the way the dot lattice's dots do. `spacingDeg / √3` is the
   * largest tile that fits the pitch (neighbours touch); anything larger is
   * clamped to it, so tiles never overlap.
   */
  sizeDeg?: number;
  /**
   * Minimum clear distance between a tile's edge and any country border
   * line, in degrees (default 0: a tile may touch a border but never cross
   * it).
   */
  insetDeg?: number;
}

/** One hexagon tile. */
export interface HexTile extends LatLon {
  /** Distance from the centre to a vertex, in degrees. */
  sizeDeg: number;
}

/** A hex tile pattern. */
export interface HexPattern {
  /** Tiles that fit inside a country, clear of its borders. */
  tiles: HexTile[];
  /** Centre-to-centre spacing actually used. */
  spacingDeg: number;
  /** Tile circum-radius actually used. */
  sizeDeg: number;
  /** Border clearance actually used. */
  insetDeg: number;
}

/** Default centre-to-centre tile spacing in degrees. */
export const DEFAULT_HEX_SPACING_DEG = 2.5;

/** Largest accepted tile spacing. */
export const MAX_HEX_SPACING_DEG = 25;

/** Largest accepted border clearance. */
export const MAX_HEX_INSET_DEG = 5;

/**
 * Fraction of the pitch the default tile leaves open: `sizeDeg` defaults to
 * `(1 − 0.15) · spacingDeg / √3`, so neighbours keep a small gap the way the
 * dot lattice's dots do. Pass `spacingDeg / √3` for tiles that touch.
 */
export const DEFAULT_HEX_GAP_RATIO = 0.15;

/**
 * Default clearance from the country borders, as a fraction of the pitch.
 *
 * The degree test alone allows a tile to kiss a border, and the borders are
 * drawn as lines roughly a tenth of a degree wide — a tile that touches one
 * disappears under the stroke. Six per cent of the pitch keeps every tile
 * visibly inside its own country at any spacing.
 */
export const DEFAULT_HEX_INSET_RATIO = 0.06;

/** √3 — a pointy-top hexagon is `√3 · radius` wide and `2 · radius` tall. */
const SQRT3 = Math.sqrt(3);

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

const num = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

/**
 * The six vertices of a pointy-top hexagon centred at (lng, lat) with
 * circum-radius `radiusDeg`, counter-clockwise starting at 30°.
 */
export function hexVertices(lng: number, lat: number, radiusDeg: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (Math.PI / 3) * i;
    out.push([lng + radiusDeg * Math.cos(angle), lat + radiusDeg * Math.sin(angle)]);
  }
  return out;
}

/**
 * True when (x, y) is inside a regular pointy-top hexagon centred at
 * (cx, cy) with circum-radius `radiusDeg`.
 *
 * A regular hexagon is the intersection of three slabs of half-width
 * `radiusDeg · √3 / 2` (the apothem) whose normals sit 60° apart.
 */
export function pointInHex(
  cx: number,
  cy: number,
  radiusDeg: number,
  x: number,
  y: number,
): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const apothem = (radiusDeg * SQRT3) / 2;
  for (let k = 0; k < 3; k++) {
    const angle = (Math.PI / 3) * k;
    const projection = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (Math.abs(projection) > apothem) return false;
  }
  return true;
}

/** Distance from a point to a segment. */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = 0;
  if (length2 > 0) t = ((px - ax) * dx + (py - ay) * dy) / length2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True when the point is inside a closed ring (even-odd ray casting). */
export function pointInRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const [ax, ay] = a;
    const [bx, by] = b;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/**
 * True when the point is inside a polygon `[outerRing, ...holes]`: every ring
 * toggles the parity, so holes punch themselves out.
 */
export function pointInPolygon(rings: PolygonRings, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) if (pointInRing(ring, x, y)) inside = !inside;
  return inside;
}

/** Signed cross product (o→a) × (o→b). */
function orient(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/** True when two segments properly cross. */
function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = orient(ax, ay, bx, by, cx, cy);
  const d2 = orient(ax, ay, bx, by, dx, dy);
  const d3 = orient(cx, cy, dx, dy, ax, ay);
  const d4 = orient(cx, cy, dx, dy, bx, by);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

/** Distance from a point outside the hexagon to its boundary. */
function distanceToHexBoundary(
  cx: number,
  cy: number,
  radiusDeg: number,
  x: number,
  y: number,
): number {
  const verts = hexVertices(cx, cy, radiusDeg);
  let min = Infinity;
  for (let i = 0; i < 6; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % 6]!;
    min = Math.min(min, distanceToSegment(x, y, a[0], a[1], b[0], b[1]));
  }
  return min;
}

/**
 * Distance between a hexagon and a segment — `-1` when they touch or cross.
 *
 * For disjoint convex shapes the minimum is attained either at a hexagon
 * vertex (to the segment) or at a segment endpoint (to a hexagon edge), so
 * those are the only distances measured.
 */
export function hexSegmentClearance(
  cx: number,
  cy: number,
  radiusDeg: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const verts = hexVertices(cx, cy, radiusDeg);
  for (let i = 0; i < 6; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % 6]!;
    if (segmentsCross(ax, ay, bx, by, a[0], a[1], b[0], b[1])) return -1;
  }
  if (pointInHex(cx, cy, radiusDeg, ax, ay) || pointInHex(cx, cy, radiusDeg, bx, by)) return -1;
  let min = distanceToHexBoundary(cx, cy, radiusDeg, ax, ay);
  min = Math.min(min, distanceToHexBoundary(cx, cy, radiusDeg, bx, by));
  for (const vertex of verts) {
    min = Math.min(min, distanceToSegment(vertex[0], vertex[1], ax, ay, bx, by));
  }
  return min;
}

/** A country polygon with its bounding box, for cheap hit-testing. */
interface PolygonBox {
  /** Rings to test containment against (polar closures normalised). */
  rings: PolygonRings;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Longest longitude jump a real border segment can have.
 *
 * Anything wider is the seam-jump some world-atlas rings carry: rings such as
 * Antarctica and seam-crossing Russia are stored as a coast polyline that
 * spans the whole map and is closed by a leap from +180° back to −180°.
 */
const MAX_REAL_SPAN_DEG = 180;

/**
 * Splits a closed ring into the outline used for containment and the border
 * polyline used for the clearance test.
 *
 * A ring closed by a seam-jump is not a real polygon: the leap would read as a
 * border line straight across the map, and parity tests against it answer
 * nonsense in the polar caps. Such a ring is closed **through the nearest
 * pole** instead (which is what the data means: everything between the coast
 * and the pole is land) and the leap is dropped from the borders.
 */
export function normalizeRing(ring: Ring): { fill: Ring; edges: Ring } {
  if (ring.length < 4) return { fill: ring, edges: ring };
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  const closed = first[0] === last[0] && first[1] === last[1];
  const points = closed ? ring.slice(0, -1) : ring;
  const closing = points[points.length - 1]!;
  if (Math.abs(closing[0] - first[0]) <= MAX_REAL_SPAN_DEG) {
    return { fill: points, edges: [...points, first] };
  }
  // Which pole the ring wraps: the one on the side it lives on.
  let sum = 0;
  for (const [, lat] of points) sum += lat;
  const poleLat = sum >= 0 ? 90 : -90;
  return {
    fill: [...points, [closing[0], poleLat], [first[0], poleLat]],
    edges: [...points, [closing[0], poleLat], [first[0], poleLat], first],
  };
}

/** A bucketed index over every border segment of every polygon. */
interface BorderIndex {
  /** Four numbers per segment: ax, ay, bx, by (lng, lat). */
  segments: Float64Array;
  count: number;
  cellDeg: number;
  cols: number;
  rows: number;
  /** Cell (row · cols + col) → segment indices. */
  cells: Int32Array[];
}

/** Coarse cell size (degrees) used to bucket country bounding boxes. */
const BOX_CELL_DEG = 4;

/** One country polygon, split into a containment outline and border lines. */
interface NormalizedPolygon {
  /** Rings for point-in-polygon tests (polar closures resolved). */
  fill: PolygonRings;
  /** Border polylines for the clearance test. */
  edges: Ring[];
}

interface PreparedSource {
  boxes: PolygonBox[];
  index: BorderIndex;
  /** Coarse grid of polygon indices, so a candidate tests only nearby land. */
  boxCells: Int32Array[];
  boxCols: number;
  boxRows: number;
}

const preparedCache = new WeakMap<readonly PolygonRings[], PreparedSource>();

function buildBoxes(polygons: NormalizedPolygon[]): PolygonBox[] {
  return polygons.map((polygon) => {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const ring of polygon.fill) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return { rings: polygon.fill, minLng, minLat, maxLng, maxLat };
  });
}

function buildIndex(polygons: NormalizedPolygon[], cellDeg: number): BorderIndex {
  const flat: number[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon.edges) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!;
        const b = ring[i]!;
        if (a[0] === b[0] && a[1] === b[1]) continue;
        flat.push(a[0], a[1], b[0], b[1]);
      }
    }
  }
  const count = flat.length / 4;
  const cols = Math.max(1, Math.ceil(360 / cellDeg));
  const rows = Math.max(1, Math.ceil(180 / cellDeg));
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);

  const colOf = (lng: number): number => clamp(Math.floor((lng + 180) / cellDeg), 0, cols - 1);
  const rowOf = (lat: number): number => clamp(Math.floor((90 - lat) / cellDeg), 0, rows - 1);

  for (let s = 0; s < count; s++) {
    const x1 = flat[s * 4]!;
    const y1 = flat[s * 4 + 1]!;
    const x2 = flat[s * 4 + 2]!;
    const y2 = flat[s * 4 + 3]!;
    const c0 = colOf(Math.min(x1, x2));
    const c1 = colOf(Math.max(x1, x2));
    const r0 = rowOf(Math.max(y1, y2));
    const r1 = rowOf(Math.min(y1, y2));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) cells[r * cols + c]!.push(s);
    }
  }

  return {
    segments: Float64Array.from(flat),
    count,
    cellDeg,
    cols,
    rows,
    cells: cells.map((bucket) => Int32Array.from(bucket)),
  };
}

/**
 * Decodes a polygon set once per array instance: bounding boxes, a coarse
 * grid over those boxes and the bucketed border index. The renderers pass the
 * same array back on every restyle, so the second and later builds are free.
 */
function prepare(polygons: PolygonRings[]): PreparedSource {
  const cached = preparedCache.get(polygons);
  if (cached) return cached;
  const normalized: NormalizedPolygon[] = polygons.map((rings) => {
    const parts = rings.map(normalizeRing);
    return { fill: parts.map((part) => part.fill), edges: parts.map((part) => part.edges) };
  });
  const boxes = buildBoxes(normalized);
  const boxCols = Math.ceil(360 / BOX_CELL_DEG);
  const boxRows = Math.ceil(180 / BOX_CELL_DEG);
  const boxCells: number[][] = Array.from({ length: boxCols * boxRows }, () => []);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]!;
    const c0 = clamp(Math.floor((box.minLng + 180) / BOX_CELL_DEG), 0, boxCols - 1);
    const c1 = clamp(Math.floor((box.maxLng + 180) / BOX_CELL_DEG), 0, boxCols - 1);
    const r0 = clamp(Math.floor((90 - box.maxLat) / BOX_CELL_DEG), 0, boxRows - 1);
    const r1 = clamp(Math.floor((90 - box.minLat) / BOX_CELL_DEG), 0, boxRows - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) boxCells[r * boxCols + c]!.push(i);
    }
  }
  const built: PreparedSource = {
    boxes,
    index: buildIndex(normalized, 2),
    boxCells: boxCells.map((bucket) => Int32Array.from(bucket)),
    boxCols,
    boxRows,
  };
  preparedCache.set(polygons, built);
  return built;
}

/** True when (lng, lat) is inside any polygon. */
function insideAny(prepared: PreparedSource, lng: number, lat: number): boolean {
  const col = clamp(Math.floor((lng + 180) / BOX_CELL_DEG), 0, prepared.boxCols - 1);
  const row = clamp(Math.floor((90 - lat) / BOX_CELL_DEG), 0, prepared.boxRows - 1);
  const bucket = prepared.boxCells[row * prepared.boxCols + col];
  if (!bucket) return false;
  for (const id of bucket) {
    const box = prepared.boxes[id]!;
    if (lng < box.minLng || lng > box.maxLng || lat < box.minLat || lat > box.maxLat) continue;
    if (pointInPolygon(box.rings, lng, lat)) return true;
  }
  return false;
}

/** Collects the segments whose cell overlaps the query box into `out`. */
function collectNearby(index: BorderIndex, x: number, y: number, radius: number, out: number[]) {
  out.length = 0;
  const c0 = clamp(Math.floor((x - radius + 180) / index.cellDeg), 0, index.cols - 1);
  const c1 = clamp(Math.floor((x + radius + 180) / index.cellDeg), 0, index.cols - 1);
  const r0 = clamp(Math.floor((90 - y - radius) / index.cellDeg), 0, index.rows - 1);
  const r1 = clamp(Math.floor((90 - y + radius) / index.cellDeg), 0, index.rows - 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const bucket = index.cells[r * index.cols + c];
      if (!bucket) continue;
      for (const segment of bucket) out.push(segment);
    }
  }
  return out;
}

/**
 * True when a tile at (lng, lat) keeps strictly more than `insetDeg` of open
 * space from every border.
 *
 * The hexagon lies inside a disc of `sizeDeg` around its centre and contains
 * a disc of `sizeDeg · √3 / 2`, which bounds the true distance without any
 * per-segment geometry: `d − sizeDeg ≤ clearance ≤ d − apothem`. Only the thin
 * band in between needs the exact hexagon-vs-segment test.
 *
 * The comparison is strict, so a tile that merely grazes a border line is
 * dropped with the ones that cross it.
 */
function clearsBorders(
  index: BorderIndex,
  lng: number,
  lat: number,
  sizeDeg: number,
  insetDeg: number,
  scratch: number[],
): boolean {
  const reach = sizeDeg + insetDeg;
  const nearby = collectNearby(index, lng, lat, reach, scratch);
  if (nearby.length === 0) return true;
  const apothem = (sizeDeg * SQRT3) / 2;
  const segments = index.segments;
  for (const id of nearby) {
    const base = id * 4;
    const ax = segments[base]!;
    const ay = segments[base + 1]!;
    const bx = segments[base + 2]!;
    const by = segments[base + 3]!;
    const d = distanceToSegment(lng, lat, ax, ay, bx, by);
    if (d > sizeDeg + insetDeg) continue; // outside the circum-circle: clear
    if (d < apothem + insetDeg) return false; // inside the in-circle: too close
    if (!(hexSegmentClearance(lng, lat, sizeDeg, ax, ay, bx, by) > insetDeg)) return false;
  }
  return true;
}

/**
 * Builds the hex tile pattern for a set of country polygons.
 *
 * Tiles are placed on a pointy-top axial grid of pitch `spacingDeg`; a tile
 * survives when it sits inside one country and stays `insetDeg` clear of
 * every country border line, so no tile ever covers a border.
 *
 * @param polygons country polygons, `[outerRing, ...holes]` each (antimeridian
 *   safe — see `decodeCountryPolygons`).
 */
export function buildHexGrid(
  polygons: PolygonRings[],
  options: HexPatternOptions = {},
): HexPattern {
  const spacingDeg = num(options.spacingDeg, DEFAULT_HEX_SPACING_DEG);
  if (spacingDeg <= 0 || spacingDeg > MAX_HEX_SPACING_DEG) {
    throw new RangeError(`spacingDeg must be in (0, ${MAX_HEX_SPACING_DEG}], got ${spacingDeg}`);
  }
  // The biggest tile the pitch allows — neighbours touch at this size.
  const touching = spacingDeg / SQRT3;
  const sizeDeg = clamp(
    num(options.sizeDeg, touching * (1 - DEFAULT_HEX_GAP_RATIO)),
    0.01,
    touching,
  );
  const insetDeg = clamp(
    num(options.insetDeg, spacingDeg * DEFAULT_HEX_INSET_RATIO),
    0,
    MAX_HEX_INSET_DEG,
  );

  const prepared = prepare(polygons);
  const tiles: HexTile[] = [];
  const scratch: number[] = [];

  // Rows and columns are laid out on the *pitch*, not the tile size, so the
  // lattice stays regular when the tiles shrink inside their cells.
  const rowHeight = 1.5 * touching;
  const polarLimit = 90 - sizeDeg;

  for (let row = 0; ; row++) {
    const lat = 90 - row * rowHeight;
    if (lat < -90) break;
    // Skip the polar caps: a tile there would fold over the pole, where the
    // degree grid stops being a plane.
    if (lat > polarLimit || lat < -polarLimit) continue;
    const offset = (row % 2) * (spacingDeg / 2);
    for (let lng = -180 + offset; lng < 180; lng += spacingDeg) {
      if (!insideAny(prepared, lng, lat)) continue;
      if (!clearsBorders(prepared.index, lng, lat, sizeDeg, insetDeg, scratch)) continue;
      tiles.push({
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        sizeDeg,
      });
    }
  }
  return { tiles, spacingDeg, sizeDeg, insetDeg };
}
