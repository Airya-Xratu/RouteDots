/**
 * Builds the dot lattice for the "dot map" look: one dot at the centre of
 * every grid cell that falls on land.
 */
import { rasterizeLand, isLandAt, type LandGrid } from './landRaster.js';
import type { PolygonRings } from './topojson.js';
import type { LatLon } from '../types.js';

export interface DotPatternOptions {
  /** Grid spacing between dots in degrees (default 1.5). */
  stepDeg?: number;
  /** Raster resolution used to test land (default: stepDeg / 4). */
  resDeg?: number;
}

export interface DotPattern {
  /** Dot centres in degrees. */
  dots: LatLon[];
  /** Spacing actually used. */
  stepDeg: number;
  /** Raster resolution actually used. */
  resDeg: number;
}

/**
 * Samples a regular lat/lng lattice and keeps the points that fall on land.
 */
export function buildDotGrid(
  polygons: PolygonRings[],
  options: DotPatternOptions = {},
): DotPattern {
  const stepDeg = options.stepDeg ?? 1.5;
  const resDeg = options.resDeg ?? Math.max(0.05, stepDeg / 4);
  if (stepDeg <= 0 || stepDeg > 20) {
    throw new RangeError(`stepDeg must be in (0, 20], got ${stepDeg}`);
  }

  const grid: LandGrid = rasterizeLand(polygons, resDeg);
  const dots: LatLon[] = [];

  for (let lat = 90 - stepDeg / 2; lat > -90; lat -= stepDeg) {
    for (let lng = -180 + stepDeg / 2; lng < 180; lng += stepDeg) {
      if (isLandAt(grid, lat, lng)) {
        dots.push({
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
        });
      }
    }
  }
  return { dots, stepDeg, resDeg };
}
