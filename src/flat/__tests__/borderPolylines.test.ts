import { describe, expect, it } from 'vitest';
import { flatBorderPoints } from '../borderPolylines.js';
import type { Ring } from '../../core/topojson.js';

describe('flatBorderPoints', () => {
  it('projects polylines to equirectangular pixel space', () => {
    // width 360 / height 180: x = lng + 180, y = 90 - lat
    const ring: Ring = [
      [0, 0],
      [10, 20],
    ];
    expect(flatBorderPoints([ring], 360, 180)).toEqual(['180,90 190,70']);
  });

  it('splits polylines at the antimeridian instead of crossing the map', () => {
    // 170 → 175 → -175 → -170 crosses the seam (x jumps 355 → 5)
    const ring: Ring = [
      [170, 10],
      [175, 12],
      [-175, 14],
      [-170, 16],
    ];
    expect(flatBorderPoints([ring], 360, 180)).toEqual(['350,80 355,78', '5,76 10,74']);
  });

  it('keeps long jumps under half a map width in one piece', () => {
    const ring: Ring = [
      [-50, 0],
      [50, 0],
    ];
    // x: 130 → 230 — a 100px jump on a 360px-wide map is a real border segment
    expect(flatBorderPoints([ring], 360, 180)).toEqual(['130,90 230,90']);
  });

  it('splits only at jumps over half a map width (the antimeridian seam)', () => {
    const seam: Ring = [
      [-100, 0],
      [100, 0],
    ];
    // x: 80 → 280 — a 200px jump is treated as a seam crossing, and each
    // 1-point piece is dropped
    expect(flatBorderPoints([seam], 360, 180)).toEqual([]);
  });

  it('drops pieces with fewer than two points', () => {
    const single: Ring = [[5, 5]];
    const seamDangler: Ring = [
      [179, 0],
      [-179, 0],
    ]; // splits into two 1-point pieces
    expect(flatBorderPoints([single], 360, 180)).toEqual([]);
    expect(flatBorderPoints([seamDangler], 360, 180)).toEqual([]);
  });

  it('rounds pixel coordinates to 2 decimals', () => {
    const ring: Ring = [
      [0.123456, 0.654321],
      [1, 1],
    ];
    const [line] = flatBorderPoints([ring], 3600, 1800);
    expect(line).toBe('1801.23,893.46 1810,890');
  });
});
