import { describe, expect, it } from 'vitest';
import land from '../../data/land-110m.js';
import { buildDotGrid } from '../dotPattern.js';
import { isLandAt, rasterizeLand } from '../landRaster.js';
import { decodeRings } from '../topojson.js';

const polygons = decodeRings(land);
const pattern = buildDotGrid(polygons, { stepDeg: 1.5 });

describe('buildDotGrid — bundled land mask', () => {
  it('places every dot on land (same raster as construction)', () => {
    const grid = rasterizeLand(polygons, 0.25);
    const consistent = buildDotGrid(polygons, { stepDeg: 1.5, resDeg: 0.25 });
    expect(consistent.dots.length).toBeGreaterThan(6000);
    for (const dot of consistent.dots) {
      expect(isLandAt(grid, dot.lat, dot.lng)).toBe(true);
    }
  });

  it('produces a plausible number of dots at 1.5° spacing', () => {
    // ~30% of a 240×120 lattice is land at 110m resolution
    expect(pattern.dots.length).toBeGreaterThan(6000);
    expect(pattern.dots.length).toBeLessThan(12000);
  });

  it('has dots on every inhabited continent', () => {
    const countIn = (lngMin: number, lngMax: number, latMin: number, latMax: number) =>
      pattern.dots.filter(
        (d) => d.lng >= lngMin && d.lng <= lngMax && d.lat >= latMin && d.lat <= latMax,
      ).length;
    expect(countIn(40, 140, 5, 60)).toBeGreaterThan(100); // Asia
    expect(countIn(-10, 30, 35, 60)).toBeGreaterThan(30); // Europe
    expect(countIn(-125, -70, 25, 60)).toBeGreaterThan(100); // North America
    expect(countIn(-20, 50, -35, 35)).toBeGreaterThan(100); // Africa
    expect(countIn(-80, -35, -55, -5)).toBeGreaterThan(50); // South America
    expect(countIn(112, 154, -45, -10)).toBeGreaterThan(30); // Australia
  });

  it('is deterministic', () => {
    const again = buildDotGrid(polygons, { stepDeg: 1.5 });
    expect(again.dots).toEqual(pattern.dots);
  });
});

describe('buildDotGrid — lattice regularity', () => {
  it('keeps constant spacing between neighbouring dots in a row', () => {
    const rows = new Map<number, number[]>();
    for (const dot of pattern.dots) {
      const row = rows.get(dot.lat) ?? [];
      row.push(dot.lng);
      rows.set(dot.lat, row);
    }
    expect(rows.size).toBeGreaterThan(50);
    for (const lngs of rows.values()) {
      for (let i = 1; i < lngs.length; i++) {
        expect(lngs[i]! - lngs[i - 1]!).toBeGreaterThanOrEqual(1.5 - 1e-6);
        // gaps > stepDeg are fine (coastline), but no closer dots
      }
    }
  });

  it('honours a custom step and rejects invalid ones', () => {
    const coarse = buildDotGrid(polygons, { stepDeg: 3 });
    expect(coarse.dots.length).toBeLessThan(pattern.dots.length);
    expect(() => buildDotGrid(polygons, { stepDeg: 0 })).toThrow(RangeError);
    expect(() => buildDotGrid(polygons, { stepDeg: 45 })).toThrow(RangeError);
  });
});
