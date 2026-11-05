import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ROUTE_ZOOM,
  ROUTE_FRAME_MARGIN_PX,
  WORLD_VIEW_FILL,
  fitPointsView,
  fitWorldView,
  lerpView,
  pointsBounds,
  screenSpaceScale,
  tweenView,
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
    expect(view.scale).toBeLessThanOrEqual(DEFAULT_MAX_ROUTE_ZOOM);
    expect(view.scale).toBeCloseTo(DEFAULT_MAX_ROUTE_ZOOM, 9);
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

  it('arcs through the eased midpoint', () => {
    const mid = tweenView(a, b, 0.5);
    expect(mid.scale).toBeCloseTo(2, 9);
    expect(mid.cx).toBeCloseTo(200, 9);
    expect(mid.cy).toBeCloseTo(150, 9);
  });

  it('is slower at the start than linear (eased intro)', () => {
    const quarter = tweenView(a, b, 0.25);
    expect(quarter.scale).toBeLessThan(1 + (3 - 1) * 0.25);
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
