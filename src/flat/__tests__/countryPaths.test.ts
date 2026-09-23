import { describe, expect, it } from 'vitest';
import { flatCountryPaths } from '../countryPaths.js';
import type { Ring } from '../../core/topojson.js';

// width 360 / height 180 keeps the projection trivial: x = lng + 180,
// y = 90 − lat.
const W = 360;
const H = 180;

const SQUARE: Ring = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

describe('flatCountryPaths', () => {
  it('emits one closed subpath per polygon in pixel space', () => {
    expect(flatCountryPaths([[SQUARE]], W, H)).toEqual(['M180,90L190,90L190,80L180,80Z']);
  });

  it('adds holes as extra subpaths of the same path', () => {
    const hole: Ring = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ];
    const [path] = flatCountryPaths([[SQUARE, hole]], W, H);
    expect(path).toBe('M180,90L190,90L190,80L180,80ZM182,88L184,88L184,86L182,86Z');
  });

  it('duplicates a polygon that touches the seam so the fill wraps', () => {
    const eastern: Ring = [
      [170, -10],
      [180, -10],
      [180, 10],
      [170, 10],
      [170, -10],
    ];
    const paths = flatCountryPaths([[eastern]], W, H);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe('M350,100L360,100L360,80L350,80Z');
    // The copy sits one map width to the left, closing the seam.
    expect(paths[1]).toBe('M-10,100L0,100L0,80L-10,80Z');
  });

  it('emits three copies for a polygon spanning the whole map', () => {
    const antarctica: Ring = [
      [-180, -80],
      [180, -80],
      [180, -60],
      [-180, -60],
      [-180, -80],
    ];
    expect(flatCountryPaths([[antarctica]], W, H)).toHaveLength(3);
  });

  it('leaves a polygon well inside the map alone', () => {
    expect(flatCountryPaths([[SQUARE]], W, H)).toHaveLength(1);
  });

  it('drops degenerate rings and empty polygons', () => {
    const sliver: Ring = [
      [0, 0],
      [1, 1],
      [0, 0],
    ];
    expect(flatCountryPaths([[sliver]], W, H)).toEqual([]);
    expect(flatCountryPaths([[]], W, H)).toEqual([]);
    expect(flatCountryPaths([], W, H)).toEqual([]);
  });

  it('rounds pixel coordinates to 2 decimals', () => {
    const tilted: Ring = [
      [0.123456, 0.654321],
      [1, 1],
      [2, 0.5],
      [0.123456, 0.654321],
    ];
    expect(flatCountryPaths([[tilted]], 3600, 1800)).toEqual([
      'M1801.23,893.46L1810,890L1820,895Z',
    ]);
  });
});
