import { describe, expect, it } from 'vitest';
import { easeInOutCubic } from '../easing.js';

describe('easeInOutCubic', () => {
  it('is 0 at the start, 1 at the end, and clamps outside [0, 1]', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(-0.5)).toBe(0);
    expect(easeInOutCubic(1.5)).toBe(1);
  });

  it('passes through the midpoint exactly', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it('is symmetric: slow out, fast middle, slow in', () => {
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 12);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25); // still slow (front-loaded)
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75); // almost there
  });

  it('is monotonic on [0, 1]', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
