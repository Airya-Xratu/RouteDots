/**
 * Antimeridian handling for polygon rings. Pure TypeScript — no DOM, no
 * three.js, fully unit-testable.
 *
 * World-atlas topologies store a few landmasses (Russia, Fiji, Antarctica)
 * with longitudes that jump across ±180°, which would paint a spike over the
 * whole map if such a ring were filled as-is. The helpers here turn those
 * rings into parts that never cross the seam:
 *
 * 1. {@link unwrapRingLongitudes} rewrites longitudes so consecutive points
 *    differ by at most half a turn — a ring may then reach past ±180°
 *    (eastern Russia ends up around 190°E).
 * 2. The unwrapped ring is clipped against the meridian it overshoots
 *    (Sutherland–Hodgman, exact for a single half-plane even on concave
 *    rings: the connectors it adds between separate lobes lie on the clip
 *    meridian and enclose no area) and the overshooting piece is shifted back
 *    by ∓360°.
 */
import type { Point, PolygonRings, Ring } from './topojson.js';

/** Longitude of the antimeridian. */
export const SEAM_LNG = 180;

/** Parts smaller than this (degree²) are dropped as clipping slivers. */
export const MIN_PART_AREA_DEG2 = 1e-6;

/** True when the last point repeats the first. */
export function isRingClosed(ring: Ring): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return (
    ring.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    first[0] === last[0] &&
    first[1] === last[1]
  );
}

/** Removes a duplicated closing point, so the ring reads as a cycle of distinct points. */
export function openRing(ring: Ring): Ring {
  return isRingClosed(ring) ? ring.slice(0, -1) : [...ring];
}

/** Appends the first point again, so the ring is explicitly closed. */
export function closeRing(ring: Ring): Ring {
  if (ring.length === 0 || isRingClosed(ring)) return ring;
  return [...ring, ring[0]!];
}

/** Drops consecutive duplicates and closes the ring. */
export function dedupeRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const point of openRing(ring)) {
    const last = out[out.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    out.push(point);
  }
  return closeRing(out);
}

/**
 * Signed shoelace area of a ring in degree². The sign reports the winding
 * (positive = counter-clockwise in lng/lat space); callers use `Math.abs`.
 */
export function ringAreaDeg2(ring: Ring): number {
  const points = openRing(ring);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/**
 * Rewrites a ring's longitudes into a continuous sequence: whenever two
 * consecutive points jump by more than half a turn, ±360° is folded into the
 * rest of the ring. Latitudes are untouched and the first point is never
 * modified, so a ring that does not cross the seam comes back unchanged.
 */
export function unwrapRingLongitudes(ring: Ring): Ring {
  const out: Ring = [];
  let offset = 0;
  let previous: number | null = null;
  for (const [lng, lat] of ring) {
    if (previous !== null) {
      const delta = lng + offset - previous;
      if (delta > SEAM_LNG) offset -= 360;
      else if (delta < -SEAM_LNG) offset += 360;
    }
    previous = lng + offset;
    out.push([previous, lat] as Point);
  }
  return out;
}

/** `[minLng, maxLng]` over a ring (±Infinity for an empty ring). */
export function ringLngRange(ring: Ring): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [lng] of ring) {
    if (lng < min) min = lng;
    if (lng > max) max = lng;
  }
  return [min, max];
}

const pointAtLng = (a: Point, b: Point, lng: number): Point => {
  const span = b[0] - a[0];
  if (span === 0) return [lng, a[1]];
  const t = (lng - a[0]) / span;
  return [lng, a[1] + t * (b[1] - a[1])];
};

/** Clips a closed ring against one meridian, keeping the `inside` half-plane. */
function clipRing(ring: Ring, boundaryLng: number, inside: (lng: number) => boolean): Ring {
  const points = openRing(ring);
  const out: Ring = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const aInside = inside(a[0]);
    if (aInside) out.push(a);
    if (aInside !== inside(b[0])) out.push(pointAtLng(a, b, boundaryLng));
  }
  return dedupeRing(out);
}

const shiftLng = (ring: Ring, deltaLng: number): Ring =>
  ring.map(([lng, lat]) => [lng + deltaLng, lat] as Point);

const isFillable = (ring: Ring, minAreaDeg2: number): boolean =>
  openRing(ring).length >= 3 && Math.abs(ringAreaDeg2(ring)) >= minAreaDeg2;

/**
 * Splits a ring into parts that never cross the antimeridian. A ring that
 * stays within ±180° comes back as a single deduplicated, closed part.
 */
export function splitRingAtAntimeridian(
  ring: Ring,
  minAreaDeg2: number = MIN_PART_AREA_DEG2,
): Ring[] {
  let parts: Ring[] = [unwrapRingLongitudes(dedupeRing(ring))];

  // `keep` is the half-plane that stays where it is; the other side is
  // clipped off and wrapped back into [-180, 180] by a full turn.
  const splitAt = (boundaryLng: number, keep: 'west' | 'east'): void => {
    const inside = (lng: number): boolean =>
      keep === 'west' ? lng <= boundaryLng : lng >= boundaryLng;
    const wrapped = keep === 'west' ? -360 : 360;
    parts = parts.flatMap((part) => {
      const outside = clipRing(part, boundaryLng, (lng) => !inside(lng));
      const pieces = [clipRing(part, boundaryLng, inside)];
      if (openRing(outside).length >= 3) pieces.push(shiftLng(outside, wrapped));
      return pieces;
    });
  };

  const overshootsEast = (): boolean => parts.some((part) => ringLngRange(part)[1] > SEAM_LNG);
  const overshootsWest = (): boolean => parts.some((part) => ringLngRange(part)[0] < -SEAM_LNG);

  if (overshootsEast()) splitAt(SEAM_LNG, 'west');
  if (overshootsWest()) splitAt(-SEAM_LNG, 'east');

  return parts.filter((part) => isFillable(part, minAreaDeg2));
}

const bboxOf = (ring: Ring): { minLng: number; maxLng: number; minLat: number; maxLat: number } => {
  const [minLng, maxLng] = ringLngRange(ring);
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
};

/**
 * Splits a polygon (`[outerRing, ...holes]`) at the antimeridian.
 *
 * Holes are split by the same rules and attached to the outer parts whose
 * bounding box contains them, so an enclave (South Africa / Lesotho) stays a
 * hole on the right side of the seam.
 */
export function splitPolygonAtAntimeridian(
  polygon: PolygonRings,
  minAreaDeg2: number = MIN_PART_AREA_DEG2,
): PolygonRings[] {
  const [outer, ...holes] = polygon;
  if (!outer) return [];
  const outerParts = splitRingAtAntimeridian(outer, minAreaDeg2);
  if (outerParts.length === 0) return [];

  const holeParts = holes.flatMap((hole) => splitRingAtAntimeridian(hole, minAreaDeg2));
  if (holeParts.length === 0) return outerParts.map((ring) => [ring]);

  return outerParts.map((ring) => {
    const box = bboxOf(ring);
    const owned = holeParts.filter((hole) => {
      const holeBox = bboxOf(hole);
      return (
        holeBox.minLng >= box.minLng &&
        holeBox.maxLng <= box.maxLng &&
        holeBox.minLat >= box.minLat &&
        holeBox.maxLat <= box.maxLat
      );
    });
    return [ring, ...owned];
  });
}
