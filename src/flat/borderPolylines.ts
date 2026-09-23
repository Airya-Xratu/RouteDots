/**
 * Pure helpers that turn decoded border polylines into SVG polyline `points`
 * strings for the flat fallback map.
 *
 * Polylines are split wherever two consecutive points jump more than half a
 * map width apart (the antimeridian), so no border is ever drawn across the
 * whole map.
 */
import type { Ring } from '../core/topojson.js';
import { projectDotToPx } from '../globe/dotTexture.js';

/** Rounds a pixel coordinate to 2 decimals to keep the DOM light. */
export const roundPixel = (v: number): number => Math.round(v * 100) / 100;

/**
 * Projects border polylines to equirectangular pixel space and formats them
 * as SVG `points` strings (`"x,y x,y …"`), splitting at the antimeridian.
 * Sub-polyline pieces with fewer than two points are dropped.
 */
export function flatBorderPoints(rings: Ring[], width: number, height: number): string[] {
  const out: string[] = [];
  for (const ring of rings) {
    let piece: string[] = [];
    let prevX: number | null = null;

    const flush = (): void => {
      if (piece.length >= 2) out.push(piece.join(' '));
      piece = [];
    };

    for (const [lng, lat] of ring) {
      const [x, y] = projectDotToPx(lat, lng, width, height);
      if (prevX !== null && Math.abs(x - prevX) > width / 2) flush();
      piece.push(`${roundPixel(x)},${roundPixel(y)}`);
      prevX = x;
    }
    flush();
  }
  return out;
}
