import { describe, expect, it } from 'vitest';
import { buildPlanePath, type PlaneSegment } from '../planeSilhouette.js';

/** Collects the point cloud of a path (vertices of moves/lines/quads). */
function points(segments: PlaneSegment[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const seg of segments) {
    if (seg.op === 'move' || seg.op === 'line') pts.push([seg.x, seg.y]);
    if (seg.op === 'quad') pts.push([seg.cx, seg.cy], [seg.x, seg.y]);
  }
  return pts;
}

describe('buildPlanePath', () => {
  const path = buildPlanePath(1);

  it('has the rounded nose at the top and the tail below', () => {
    const pts = points(path);
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    expect(minY).toBe(-50); // nose
    expect(maxY).toBe(49); // tail (control point of the rounded tip)
  });

  it('is symmetric about the vertical axis', () => {
    const pts = points(path);
    const mirrored = new Set(pts.map(([x, y]) => `${(-x).toFixed(6)},${y.toFixed(6)}`));
    for (const [x, y] of pts) {
      expect(mirrored.has(`${x.toFixed(6)},${y.toFixed(6)}`), `(${x}, ${y}) has no mirror`).toBe(
        true,
      );
    }
  });

  it('is curved: more than half the segments are quadratic', () => {
    const quads = path.filter((seg) => seg.op === 'quad').length;
    expect(quads / path.length).toBeGreaterThan(0.5);
  });

  it('scales linearly', () => {
    const small = buildPlanePath(0.5);
    const big = buildPlanePath(2);
    const ps = points(small);
    const pb = points(big);
    expect(pb).toHaveLength(ps.length);
    for (let i = 0; i < ps.length; i++) {
      expect(pb[i]?.[0]).toBeCloseTo(ps[i]![0] * 4, 6);
      expect(pb[i]?.[1]).toBeCloseTo(ps[i]![1] * 4, 6);
    }
  });
});
