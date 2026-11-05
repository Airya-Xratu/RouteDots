import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ROUTE_ZOOM,
  ROUTE_FRAME_MARGIN_PX,
  WORLD_VIEW_FILL,
  blendView,
  buildViewPath,
  fitPointsView,
  fitWorldView,
  isWorldFraming,
  lerpView,
  pathProgress,
  pointsBounds,
  screenSpaceScale,
  tweenView,
  viewAlongPath,
  viewsEqual,
} from '../framing.js';

const MAP = { width: 1600, height: 800 };

/** True when a map point lands inside the viewport, inset by `margin` px. */
function insideViewport(
  point: { x: number; y: number },
  view: { scale: number; cx: number; cy: number },
  viewport: { w: number; h: number },
  margin = 0,
): boolean {
  const screenX = viewport.w / 2 + (point.x - view.cx) * view.scale;
  const screenY = viewport.h / 2 + (point.y - view.cy) * view.scale;
  return (
    screenX >= margin &&
    screenX <= viewport.w - margin &&
    screenY >= margin &&
    screenY <= viewport.h - margin
  );
}

describe('fitWorldView', () => {
  it('fits the whole world inside the viewport and centres it', () => {
    const view = fitWorldView(MAP, { w: 1000, h: 1000 });
    expect(view.cx).toBe(800);
    expect(view.cy).toBe(400);
    // The width is the constraining side (1600 > 800).
    expect(view.scale).toBeCloseTo((1000 / 1600) * WORLD_VIEW_FILL, 9);
    // Everything is on screen — nothing is cropped.
    expect(MAP.width * view.scale).toBeLessThanOrEqual(1000);
    expect(MAP.height * view.scale).toBeLessThanOrEqual(1000);
  });

  it('letterboxes a wide viewport instead of stretching the map', () => {
    const view = fitWorldView(MAP, { w: 1400, h: 500 });
    expect(view.scale).toBeCloseTo((500 / 800) * WORLD_VIEW_FILL, 9);
    expect(MAP.width * view.scale).toBeLessThan(1400);
    expect(MAP.height * view.scale).toBeCloseTo(500 * WORLD_VIEW_FILL, 6);
  });

  it('survives a zero-sized host with a finite, positive scale', () => {
    const view = fitWorldView(MAP, { w: 0, h: 0 });
    expect(Number.isFinite(view.scale)).toBe(true);
    expect(view.scale).toBeGreaterThan(0);
  });
});

describe('pointsBounds', () => {
  it('returns null without points', () => {
    expect(pointsBounds([])).toBeNull();
  });

  it('boxes every point', () => {
    expect(
      pointsBounds([
        { x: 10, y: 20 },
        { x: -5, y: 40 },
      ]),
    ).toEqual({ minX: -5, minY: 20, maxX: 10, maxY: 40 });
  });
});

describe('fitPointsView', () => {
  const viewport = { w: 1200, h: 640 };

  it('frames both airports with a screen-space margin', () => {
    const from = { x: 700, y: 170 };
    const to = { x: 950, y: 290 };
    const view = fitPointsView([from, to], MAP, viewport)!;
    expect(view).not.toBeNull();
    for (const point of [from, to]) {
      expect(insideViewport(point, view, viewport, ROUTE_FRAME_MARGIN_PX)).toBe(true);
    }
    // The airports are framed, not just somewhere on screen: the box fills a
    // decent part of the viewport.
    const spread = (to.x - from.x) * view.scale;
    expect(spread).toBeGreaterThan(viewport.w / 4);
  });

  it('caps the zoom so a short hop is not a microscope', () => {
    const view = fitPointsView(
      [
        { x: 800, y: 400 },
        { x: 812, y: 410 },
      ],
      MAP,
      viewport,
    )!;
    // Either cap can win: the configured maximum, or the min-visible-span
    // guard (90 map px of the world must stay on screen).
    const cap = Math.min(DEFAULT_MAX_ROUTE_ZOOM, viewport.h / 90);
    expect(view.scale).toBeLessThanOrEqual(cap + 1e-9);
    expect(view.scale).toBeCloseTo(cap, 9);
  });

  it('zooms much further in for close cities than the old 2.2× cap', () => {
    // Two neighbouring airports, ~30 map px apart (≈ a short European hop).
    const view = fitPointsView(
      [
        { x: 800, y: 300 },
        { x: 812, y: 308 },
      ],
      MAP,
      viewport,
    )!;
    expect(view.scale).toBeGreaterThan(4);
    // …while still keeping a readable slice of the world on screen (the
    // min-visible-span guard) rather than one town filling the frame.
    const visibleHeight = viewport.h / view.scale;
    expect(visibleHeight).toBeGreaterThanOrEqual(80);
  });

  it('honours the min-visible-span guard on a small viewport', () => {
    const small = { w: 420, h: 300 };
    const view = fitPointsView(
      [
        { x: 800, y: 300 },
        { x: 802, y: 302 },
      ],
      MAP,
      small,
    )!;
    // 300 / 420 → the shorter side may not show less than ~90 map px.
    expect(300 / view.scale).toBeGreaterThanOrEqual(89);
    expect(view.scale).toBeLessThanOrEqual(300 / 90 + 1e-9);
  });

  it('honours a custom maximum zoom', () => {
    const view = fitPointsView(
      [
        { x: 800, y: 400 },
        { x: 802, y: 401 },
      ],
      MAP,
      viewport,
      { maxScale: 1.5 },
    )!;
    expect(view.scale).toBe(1.5);
  });

  it('never zooms out past the world view — antipodal airports still show', () => {
    const world = fitWorldView(MAP, viewport);
    const view = fitPointsView(
      [
        { x: 0, y: 0 },
        { x: 1600, y: 800 },
      ],
      MAP,
      viewport,
    )!;
    expect(view.scale).toBeCloseTo(world.scale, 9);
    expect(insideViewport({ x: 0, y: 0 }, view, viewport)).toBe(true);
    expect(insideViewport({ x: 1600, y: 800 }, view, viewport)).toBe(true);
  });

  it('keeps the margin even for a route in the corner of the map', () => {
    const farRightTop = { x: 1580, y: 30 };
    const view = fitPointsView([farRightTop, { x: 1500, y: 90 }], MAP, viewport)!;
    expect(insideViewport(farRightTop, view, viewport, ROUTE_FRAME_MARGIN_PX)).toBe(true);
    expect(insideViewport({ x: 1500, y: 90 }, view, viewport, ROUTE_FRAME_MARGIN_PX)).toBe(true);
    // The box is centred on the airports, not nudged back onto the map.
    expect(view.cx).toBeCloseTo(1540, 9);
  });

  it('returns null for an empty route', () => {
    expect(fitPointsView([], MAP, viewport)).toBeNull();
  });
});

describe('lerpView / tweenView', () => {
  const a = { scale: 1, cx: 0, cy: 100 };
  const b = { scale: 3, cx: 400, cy: 200 };

  it('starts at `from`, ends at `to`, and clamps progress', () => {
    expect(lerpView(a, b, 0)).toEqual(a);
    expect(lerpView(a, b, 1)).toEqual(b);
    expect(lerpView(a, b, -1)).toEqual(a);
    expect(lerpView(a, b, 2)).toEqual(b);
  });

  it('arcs through the eased midpoint, zooming geometrically', () => {
    const mid = tweenView(a, b, 0.5);
    // 1 → 3 in log space passes through √3, not 2: an even-feeling zoom.
    expect(mid.scale).toBeCloseTo(Math.sqrt(3), 9);
    expect(mid.cx).toBeCloseTo(200, 9);
    expect(mid.cy).toBeCloseTo(150, 9);
  });

  it('blends the scale in log space and the centre linearly', () => {
    const quarter = blendView(a, b, 0.25);
    expect(quarter.scale).toBeCloseTo(Math.exp(Math.log(1) + 0.25 * Math.log(3)), 9);
    expect(quarter.cx).toBeCloseTo(100, 9);
    expect(blendView(a, b, 0)).toEqual(a);
    expect(blendView(a, b, 1)).toEqual(b);
  });

  it('is slower at the start than linear (eased intro)', () => {
    const quarter = tweenView(a, b, 0.25);
    expect(quarter.scale).toBeLessThan(1 + (3 - 1) * 0.25);
  });
});

describe('buildViewPath / viewAlongPath', () => {
  const start = { scale: 4, cx: 900, cy: 300 };
  const world = { scale: 0.8, cx: 800, cy: 400 };
  const next = { scale: 6, cx: 1000, cy: 500 };

  it('stops at every keyframe and ends at 1', () => {
    const path = buildViewPath([start, world, next]);
    expect(path.views).toHaveLength(3);
    expect(path.stops[0]).toBe(0);
    expect(path.stops[2]).toBe(1);
    expect(path.stops[1]).toBeGreaterThan(0.2);
    expect(path.stops[1]).toBeLessThan(0.8);
  });

  it('passes through the middle keyframe exactly', () => {
    const path = buildViewPath([start, world, next]);
    const atWorld = viewAlongPath(path, path.stops[1]!);
    expect(atWorld.cx).toBeCloseTo(world.cx, 9);
    expect(atWorld.cy).toBeCloseTo(world.cy, 9);
    expect(atWorld.scale).toBeCloseTo(world.scale, 9);
  });

  it('never jumps: consecutive samples stay close together', () => {
    const path = buildViewPath([start, world, next]);
    let prev = viewAlongPath(path, 0);
    for (let i = 1; i <= 200; i++) {
      const view = viewAlongPath(path, i / 200);
      // Scale ratio per 0.5 % of the path is tiny — no discontinuity at the
      // world keyframe (the old two-tween version stopped dead there).
      expect(Math.abs(Math.log(view.scale / prev.scale))).toBeLessThan(0.25);
      expect(Math.hypot(view.cx - prev.cx, view.cy - prev.cy)).toBeLessThan(20);
      prev = view;
    }
  });

  it('eases each leg, so the camera settles on the wide keyframe', () => {
    const path = buildViewPath([start, world, next]);
    const stop = path.stops[1]!;
    // The clock reaches the wide keyframe exactly at its stop…
    expect(pathProgress(path, stop)).toBeCloseTo(stop, 9);
    // …having slowed down on the way in and speeding up on the way out: the
    // walk is monotone with a flat spot (no reversal, no jump) around it.
    let prev = pathProgress(path, 0);
    expect(prev).toBe(0);
    for (let i = 1; i <= 400; i++) {
      const value = pathProgress(path, i / 400);
      expect(value).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(value - prev).toBeLessThan(0.02);
      prev = value;
    }
    expect(prev).toBeCloseTo(1, 9);
    // Velocity is (near) zero right at the keyframe, on both sides.
    const delta = 1e-4;
    const before = pathProgress(path, stop) - pathProgress(path, stop - delta);
    const after = pathProgress(path, stop + delta) - pathProgress(path, stop);
    expect(before / delta).toBeLessThan(0.02);
    expect(after / delta).toBeLessThan(0.02);
  });

  it('still reads as one continuous move, not two halves', () => {
    const path = buildViewPath([start, world, next]);
    // The widest sample-to-sample step across the turnaround stays modest: a
    // single ease over the whole path moved ~1.5× the average *at* the
    // keyframe, which is what made the U-turn read as a bounce.
    let peak = 0;
    let prev = viewAlongPath(path, 0);
    for (let i = 0; i <= 600; i++) {
      const view = viewAlongPath(path, pathProgress(path, i / 600));
      peak = Math.max(peak, Math.abs(Math.log(view.scale / prev.scale)));
      prev = view;
    }
    expect(peak).toBeLessThan(0.06);
  });

  it('clamps outside [0, 1] and tolerates a single keyframe', () => {
    const path = buildViewPath([start, world]);
    expect(viewAlongPath(path, -1)).toEqual(start);
    expect(viewAlongPath(path, 2)).toEqual(world);
    const single = buildViewPath([start]);
    expect(viewAlongPath(single, 0.5)).toEqual(start);
  });
});

describe('isWorldFraming', () => {
  const viewport = { w: 1200, h: 640 };
  const world = fitWorldView(MAP, viewport);

  it('accepts the world view itself', () => {
    expect(isWorldFraming(world, world)).toBe(true);
  });

  it('accepts a hair of drift (sub-pixel at world scale)', () => {
    expect(isWorldFraming({ ...world, cx: world.cx + 4, cy: world.cy - 3 }, world)).toBe(true);
    expect(isWorldFraming({ ...world, scale: world.scale * 1.01 }, world)).toBe(true);
  });

  it('rejects a zoomed-in or panned view — those need the zoom-out leg', () => {
    expect(isWorldFraming({ ...world, scale: world.scale * 2 }, world)).toBe(false);
    expect(isWorldFraming({ ...world, cx: world.cx + 200 }, world)).toBe(false);
    const route = fitPointsView(
      [
        { x: 799, y: 171 },
        { x: 1046, y: 288 },
      ],
      MAP,
      viewport,
    )!;
    expect(isWorldFraming(route, world)).toBe(false);
  });
});

describe('viewsEqual', () => {
  it('compares scale relatively and centres absolutely', () => {
    expect(viewsEqual({ scale: 1, cx: 0, cy: 0 }, { scale: 1, cx: 0, cy: 0 })).toBe(true);
    expect(viewsEqual({ scale: 1, cx: 0, cy: 0 }, { scale: 1.2, cx: 0, cy: 0 })).toBe(false);
    expect(viewsEqual({ scale: 4, cx: 10, cy: 10 }, { scale: 4.002, cx: 10, cy: 10 })).toBe(true);
  });
});

describe('screenSpaceScale', () => {
  it('inverts the stage scale so px sizes survive the zoom', () => {
    expect(screenSpaceScale(2)).toBe(0.5);
    expect(screenSpaceScale(0.8)).toBeCloseTo(1.25, 9);
    expect(screenSpaceScale(0)).toBe(1);
    expect(screenSpaceScale(Number.NaN)).toBe(1);
  });
});
