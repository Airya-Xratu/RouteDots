import { describe, expect, it } from 'vitest';
import land from '../../data/land-110m.js';
import { isLandAt, rasterizeLand } from '../landRaster.js';
import { decodeRings, type PolygonRings } from '../topojson.js';

const polygons = decodeRings(land);
const grid = rasterizeLand(polygons, 0.25);

describe('rasterizeLand — bundled land mask', () => {
  it('produces a grid matching the requested resolution', () => {
    expect(grid.cols).toBe(1440);
    expect(grid.rows).toBe(720);
    expect(grid.resDeg).toBe(0.25);
  });

  const landPoints: [string, number, number][] = [
    ['London', 51.5, -0.13],
    ['Paris', 48.85, 2.35],
    ['Tehran', 35.69, 51.39],
    ['Moscow', 55.75, 37.62],
    ['Cairo', 30.04, 31.24],
    ['Delhi', 28.61, 77.21],
    ['Tokyo', 35.68, 139.69],
    ['Sydney', -33.87, 151.21],
    ['Cape Town', -33.92, 18.42],
    ['New York', 40.71, -74.01],
    ['Jakarta', -6.21, 106.85],
    ['Greenland', 72, -40],
    ['Antarctica', -80, 0],
  ];
  const oceanPoints: [string, number, number][] = [
    ['Mid-Atlantic', 40, -30],
    ['Gulf of Guinea', 0, -20],
    ['Central Pacific', 20, -140],
    ['South Atlantic', -20, -5],
    ['North Pacific', 35, -160],
    ['Southern Ocean', -60, 140],
    ['Bering Sea', 58, -178],
    ['Arctic Ocean', 89, 10],
  ];

  it('classifies well-known land points as land', () => {
    for (const [name, lat, lng] of landPoints) {
      expect(isLandAt(grid, lat, lng), `${name}`).toBe(true);
    }
  });

  it('classifies well-known ocean points as ocean', () => {
    for (const [name, lat, lng] of oceanPoints) {
      expect(isLandAt(grid, lat, lng), `${name}`).toBe(false);
    }
  });

  it('rejects out-of-range and non-finite input', () => {
    expect(isLandAt(grid, 91, 0)).toBe(false);
    expect(isLandAt(grid, -91, 0)).toBe(false);
    expect(isLandAt(grid, Number.NaN, 0)).toBe(false);
    // longitude wraps
    expect(isLandAt(grid, 51.5, 359.87)).toBe(true); // -0.13 + 360
  });
});

describe('rasterizeLand — synthetic even-odd fill', () => {
  const box: PolygonRings = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ];
  const g = rasterizeLand([box], 1);

  it('fills the polygon interior and excludes the hole', () => {
    expect(isLandAt(g, 5, 8)).toBe(true); // inside outer, outside hole
    expect(isLandAt(g, 5, 5)).toBe(false); // inside the hole
    expect(isLandAt(g, 11, 5)).toBe(false); // outside
    expect(isLandAt(g, 5, -1)).toBe(false); // outside
    expect(isLandAt(g, 1, 1)).toBe(true); // interior corner cell
  });
});

describe('rasterizeLand — validation', () => {
  it('rejects invalid resolutions', () => {
    expect(() => rasterizeLand(polygons, 0)).toThrow(RangeError);
    expect(() => rasterizeLand(polygons, 6)).toThrow(RangeError);
  });
});
