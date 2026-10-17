/**
 * Builds a hexagon tile pattern for filling country interiors.
 *
 * Uses the same land-raster test as the dot lattice (`isLandAt`), so hex
 * centres sit only on land. Hexagons are arranged in a pointy-top axial grid
 * (odd rows offset horizontally by half a column), which is the standard
 * tiling for map backgrounds.
 */
import { isLandAt, rasterizeLand, type LandGrid } from './landRaster.js';
import type { PolygonRings } from './topojson.js';
import type { LatLon } from '../types.js';

export interface HexPatternOptions {
  /** Center-to-center spacing of hex tiles in degrees (default 2.5). */
  spacingDeg?: number;
  /** Raster resolution used to test land (default: spacingDeg / 4). */
  resDeg?: number;
}

export interface HexTile {
  /** Hex centre in decimal degrees. */
  lat: number;
  lng: number;
  /** Distance from the centre to a vertex, in degrees (≈ spacing / √3). */
  sizeDeg: number;
}

export interface HexPattern {
  /** Hex tile centres inside land. */
  tiles: HexTile[];
  /** Spacing actually used. */
  spacingDeg: number;
  /** Raster resolution actually used. */
  resDeg: number;
}

/**
 * Builds a pointy-top hex grid and keeps the tiles whose centres fall on
 * land (inside country borders).
 *
 * Row offset alternates by `spacingDeg · √3/2` vertically; odd rows are
 * shifted right by `spacingDeg / 2` to keep the grid tight.
 */
export function buildHexGrid(
  polygons: PolygonRings[],
  options: HexPatternOptions = {},
): HexPattern {
  const spacingDeg = options.spacingDeg ?? 2.5;
  const resDeg = options.resDeg ?? Math.max(0.05, spacingDeg / 4);
  if (spacingDeg <= 0 || spacingDeg > 25) {
    throw new RangeError(`spacingDeg must be in (0, 25], got ${spacingDeg}`);
  }

  // Hex circum-radius (centre to vertex) so the pointy-top hex is exactly
  // `spacingDeg` wide from centre to centre horizontally.
  const sizeDeg = spacingDeg / Math.sqrt(3);
  // Vertical distance between rows for pointy-top hexes.
  const rowHeight = (3 / 2) * sizeDeg;

  const grid: LandGrid = rasterizeLand(polygons, resDeg);
  const tiles: HexTile[] = [];

  // Sweep rows top-down.
  for (let row = 0; ; row++) {
    const lat = 90 - row * rowHeight;
    if (lat <= -90) break;
    const offset = (row % 2) * (spacingDeg / 2);
    for (let lng = -180 + offset; lng < 180; lng += spacingDeg) {
      // Clamp into [-180, 180) so the land test stays inside the raster.
      let testLng = lng;
      if (testLng < -180) testLng += 360;
      else if (testLng >= 180) testLng -= 360;
      if (isLandAt(grid, lat, testLng)) {
        tiles.push({
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
          sizeDeg,
        });
      }
    }
  }
  return { tiles, spacingDeg, resDeg };
}
