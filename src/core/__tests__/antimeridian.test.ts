import { describe, expect, it } from 'vitest';
import {
  MIN_PART_AREA_DEG2,
  closeRing,
  dedupeRing,
  isRingClosed,
  openRing,
  ringAreaDeg2,
  ringLngRange,
  splitPolygonAtAntimeridian,
  splitRingAtAntimeridian,
  unwrapRingLongitudes,
} from '../antimeridian.js';
import type { Point, Ring } from '../topojson.js';

/** A 20° × 20° square straddling the seam: 170°E → 170°W (i.e. 190°E). */
const WRAPPING_SQUARE: Ring = [
  [170, -10],
  [-170, -10],
  [-170, 10],
  [170, 10],
  [170, -10],
];

/** A plain 10° × 10° square well inside the map. */
const INNER_SQUARE: Ring = [
  [10, 10],
  [20, 10],
  [20, 20],
  [10, 20],
  [10, 10],
];

describe('ring closure helpers', () => {
  it('detects, opens and closes rings', () => {
    expect(isRingClosed(INNER_SQUARE)).toBe(true);
    expect(isRingClosed(INNER_SQUARE.slice(0, 4))).toBe(false);
    expect(openRing(INNER_SQUARE)).toHaveLength(4);
    expect(closeRing(openRing(INNER_SQUARE))).toEqual(INNER_SQUARE);
    expect(closeRing([])).toEqual([]);
  });

  it('drops consecutive duplicates', () => {
    const noisy: Ring = [
      [0, 0],
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(dedupeRing(noisy)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });
});

describe('ringAreaDeg2', () => {
  it('reports the shoelace area of a square', () => {
    expect(Math.abs(ringAreaDeg2(INNER_SQUARE))).toBeCloseTo(100, 6);
  });

  it('flips sign with the winding', () => {
    expect(ringAreaDeg2([...INNER_SQUARE].reverse())).toBeCloseTo(-ringAreaDeg2(INNER_SQUARE), 6);
  });
});

describe('unwrapRingLongitudes', () => {
  it('leaves a ring inside ±180° untouched', () => {
    expect(unwrapRingLongitudes(INNER_SQUARE)).toEqual(INNER_SQUARE);
  });

  it('continues eastward past 180° instead of jumping back', () => {
    const ring: Ring = [
      [179, 0],
      [-179, 0],
      [-178, 5],
    ];
    expect(unwrapRingLongitudes(ring)).toEqual([
      [179, 0],
      [181, 0],
      [182, 5],
    ]);
  });

  it('treats a ±180° duplicate as the same meridian, not a crossing', () => {
    // Antarctica stores both signs of the seam; the jump is a full turn.
    const ring: Ring = [
      [-180, -70],
      [180, -70],
      [179, -71],
    ];
    const unwrapped = unwrapRingLongitudes(ring);
    expect(unwrapped.map((p) => p[0])).toEqual([-180, -180, -181]);
  });
});

describe('splitRingAtAntimeridian', () => {
  it('keeps a ring that does not reach the seam in one piece', () => {
    const parts = splitRingAtAntimeridian(INNER_SQUARE);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual(INNER_SQUARE);
  });

  it('splits a wrapping square into two seam-bound halves', () => {
    const parts = splitRingAtAntimeridian(WRAPPING_SQUARE);
    expect(parts).toHaveLength(2);

    for (const part of parts) {
      const [minLng, maxLng] = ringLngRange(part);
      expect(minLng).toBeGreaterThanOrEqual(-180);
      expect(maxLng).toBeLessThanOrEqual(180);
      expect(isRingClosed(part)).toBe(true);
      // Half of the 20° × 20° square each.
      expect(Math.abs(ringAreaDeg2(part))).toBeCloseTo(200, 6);
    }

    // One half hugs the seam from the east (170…180), the other from the
    // west (−180…−170).
    const ranges = parts.map((part) => ringLngRange(part));
    expect(ranges[0]![0]).toBeCloseTo(170, 6);
    expect(ranges[0]![1]).toBeCloseTo(180, 6);
    expect(ranges[1]![0]).toBeCloseTo(-180, 6);
    expect(ranges[1]![1]).toBeCloseTo(-170, 6);
  });

  it('never leaves a jump across the seam inside a part', () => {
    for (const part of splitRingAtAntimeridian(WRAPPING_SQUARE)) {
      const points = part as Point[];
      for (let i = 1; i < points.length; i++) {
        expect(Math.abs(points[i]![0] - points[i - 1]![0])).toBeLessThanOrEqual(180);
      }
    }
  });

  it('splits a ring that runs west past −180°', () => {
    const ring: Ring = [
      [-170, -10],
      [170, -10],
      [170, 10],
      [-170, 10],
      [-170, -10],
    ];
    const parts = splitRingAtAntimeridian(ring);
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      const [minLng, maxLng] = ringLngRange(part);
      expect(minLng).toBeGreaterThanOrEqual(-180);
      expect(maxLng).toBeLessThanOrEqual(180);
    }
  });

  it('drops slivers below the minimum area', () => {
    const sliver: Ring = [
      [179.9999, 0],
      [-179.9999, 0],
      [-179.9999, 0.0001],
      [179.9999, 0.0001],
      [179.9999, 0],
    ];
    const parts = splitRingAtAntimeridian(sliver, MIN_PART_AREA_DEG2);
    for (const part of parts) expect(Math.abs(ringAreaDeg2(part))).toBeGreaterThan(0);
  });
});

describe('splitPolygonAtAntimeridian', () => {
  it('keeps a hole with the outer part that contains it', () => {
    const outer: Ring = [
      [10, 0],
      [40, 0],
      [40, 30],
      [10, 30],
      [10, 0],
    ];
    const hole: Ring = [
      [20, 10],
      [25, 10],
      [25, 15],
      [20, 15],
      [20, 10],
    ];
    const parts = splitPolygonAtAntimeridian([outer, hole]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(2);
    expect(Math.abs(ringAreaDeg2(parts[0]![1]!))).toBeCloseTo(25, 6);
  });

  it('splits a wrapping polygon and keeps both parts fillable', () => {
    const parts = splitPolygonAtAntimeridian([WRAPPING_SQUARE]);
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part).toHaveLength(1);
      expect(Math.abs(ringAreaDeg2(part[0]!))).toBeGreaterThan(MIN_PART_AREA_DEG2);
    }
  });

  it('ignores an empty polygon', () => {
    expect(splitPolygonAtAntimeridian([])).toEqual([]);
  });
});
