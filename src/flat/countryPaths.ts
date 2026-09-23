/**
 * Pure helpers that turn decoded country polygons into SVG path data for the
 * flat fallback map, where the grey country fills are painted on a canvas.
 *
 * Each polygon becomes one path datum (outer ring plus its holes as extra
 * subpaths) so it can be filled with the even-odd rule — which is what keeps
 * an enclave (Lesotho) out of its neighbour (South Africa) even though the
 * two share a border.
 *
 * A polygon that touches the antimeridian is emitted twice, once in place and
 * once a map width to the side, so the fill wraps seamlessly at the seam.
 */
import { openRing, ringLngRange } from '../core/antimeridian.js';
import type { PolygonRings, Ring } from '../core/topojson.js';
import { projectDotToPx } from '../globe/dotTexture.js';
import { roundPixel } from './borderPolylines.js';

/** Longitudes this close to ±180° count as "on the seam". */
const SEAM_EPS = 1e-6;

/** One closed subpath (`M…L…Z`) for a ring, shifted horizontally by `shiftPx`. */
function ringSubpath(ring: Ring, width: number, height: number, shiftPx: number): string {
  const points = openRing(ring);
  if (points.length < 3) return '';
  const commands = points.map(([lng, lat], i) => {
    const [x, y] = projectDotToPx(lat, lng, width, height);
    return `${i === 0 ? 'M' : 'L'}${roundPixel(x + shiftPx)},${roundPixel(y)}`;
  });
  return `${commands.join('')}Z`;
}

/** Path data for one polygon at a horizontal offset, or '' when degenerate. */
function polygonPath(
  polygon: PolygonRings,
  width: number,
  height: number,
  shiftPx: number,
): string {
  return polygon
    .map((ring) => ringSubpath(ring, width, height, shiftPx))
    .filter((subpath) => subpath.length > 0)
    .join('');
}

/**
 * Builds SVG path data for filled country polygons in equirectangular pixel
 * space (`width` × `height`). Fill each datum with the `evenodd` rule.
 */
export function flatCountryPaths(
  polygons: PolygonRings[],
  width: number,
  height: number,
): string[] {
  const paths: string[] = [];
  for (const polygon of polygons) {
    const path = polygonPath(polygon, width, height, 0);
    if (path.length === 0) continue;
    paths.push(path);

    const [minLng, maxLng] = ringLngRange(polygon[0] ?? []);
    if (maxLng >= 180 - SEAM_EPS) paths.push(polygonPath(polygon, width, height, -width));
    if (minLng <= -180 + SEAM_EPS) paths.push(polygonPath(polygon, width, height, width));
  }
  return paths.filter((path) => path.length > 0);
}
