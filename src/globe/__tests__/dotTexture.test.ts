import { describe, expect, it } from 'vitest';
import { projectDotToPx } from '../dotTexture.js';

describe('projectDotToPx', () => {
  const W = 2048;
  const H = 1024;

  it('maps the equator / prime meridian to the centre', () => {
    expect(projectDotToPx(0, 0, W, H)).toEqual([W / 2, H / 2]);
  });

  it('maps the edges correctly (equirectangular)', () => {
    expect(projectDotToPx(0, -180, W, H)).toEqual([0, H / 2]);
    expect(projectDotToPx(0, 180, W, H)).toEqual([W, H / 2]);
    expect(projectDotToPx(90, 0, W, H)).toEqual([W / 2, 0]);
    expect(projectDotToPx(-90, 0, W, H)).toEqual([W / 2, H]);
  });

  it('is linear in both axes', () => {
    const [x1] = projectDotToPx(0, -90, W, H);
    const [x2] = projectDotToPx(0, 90, W, H);
    expect(x2 - x1).toBeCloseTo(W / 2, 9);
    const [, y1] = projectDotToPx(45, 0, W, H);
    const [, y2] = projectDotToPx(-45, 0, W, H);
    expect(y2 - y1).toBeCloseTo(H / 2, 9);
  });
});
