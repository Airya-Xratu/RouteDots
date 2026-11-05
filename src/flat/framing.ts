/**
 * Flat-world framing — *which slice of the equirectangular map is on screen*.
 *
 * The flat world is one big map (1600 × 800 map px by default) shown through a
 * much smaller viewport. Two framings matter:
 *
 * - **the world view** — the whole planet, letterboxed and centred, with the
 *   map's own aspect ratio preserved. This is what a visitor sees before any
 *   route exists.
 * - **the route view** — zoomed in far enough that both airports (and the arc
 *   between them) are comfortably inside the viewport. The zoom-in is capped,
 *   so a short hop does not turn into a 20× microscope, and it never zooms out
 *   past the world view, so an antipodal route still shows the whole planet.
 *
 * Pure maths + pure value objects: no DOM, no three.js, unit-tested.
 */
import { easeInOutCubic } from '../routes/easing.js';

/** The map's pixel size (its own coordinate space). */
export interface FlatMapSize {
  width: number;
  height: number;
}

/** The visible area, in CSS px. */
export interface FlatViewport {
  w: number;
  h: number;
}

/** A framed view: pixels per map px, plus the map point at the viewport centre. */
export interface FlatView {
  scale: number;
  cx: number;
  cy: number;
}

/** A point in map px. */
export interface FlatPoint {
  x: number;
  y: number;
}

/** How much of the viewport the world view may use (a little breathing room). */
export const WORLD_VIEW_FILL = 0.98;

/** Screen-space margin kept around a framed route, in CSS px. */
export const ROUTE_FRAME_MARGIN_PX = 56;

/** Never zoom a route in further than this (a 2 × 2 map px per CSS px cap). */
export const DEFAULT_MAX_ROUTE_ZOOM = 2.2;

/** How long the zoom to a route takes, in ms. */
export const DEFAULT_ZOOM_DURATION_MS = 900;

/**
 * Share of a re-route zoom spent pulling back to the world view; the rest
 * dives into the new route. Switching flights reads as "up, across, down"
 * rather than a single pan between two close-ups.
 */
export const ZOOM_OUT_SHARE = 0.4;

/** Scale bounds, so degenerate containers can never produce a NaN transform. */
export const VIEW_SCALE_LIMITS = { min: 0.02, max: 24 } as const;

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

const finite = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

const clampScale = (scale: number): number => {
  if (!Number.isFinite(scale) || scale <= 0) return VIEW_SCALE_LIMITS.min;
  return clamp(scale, VIEW_SCALE_LIMITS.min, VIEW_SCALE_LIMITS.max);
};

/**
 * The whole world, contained in the viewport (letterboxed, never cropped) and
 * centred. This is the flat map's resting view: no route, whole planet.
 */
export function fitWorldView(map: FlatMapSize, viewport: FlatViewport): FlatView {
  const mapW = Math.max(1, finite(map.width, 1));
  const mapH = Math.max(1, finite(map.height, 1));
  const vw = Math.max(1, finite(viewport.w, 1));
  const vh = Math.max(1, finite(viewport.h, 1));
  const scale = clampScale(Math.min((vw / mapW) * WORLD_VIEW_FILL, (vh / mapH) * WORLD_VIEW_FILL));
  return { scale, cx: mapW / 2, cy: mapH / 2 };
}

/** Options for {@link fitPointsView}. */
export interface RouteFrameOptions {
  /** Screen-space margin around the framed box, in CSS px (default 56). */
  marginPx?: number;
  /** Maximum zoom-in (default {@link DEFAULT_MAX_ROUTE_ZOOM}). */
  maxScale?: number;
  /**
   * Minimum zoom (default: the world view's scale). A route can never be
   * framed *further out* than the whole world — both airports always stay on
   * screen, even when they are on opposite sides of the planet.
   */
  minScale?: number;
}

/** The bounding box of a set of map-px points. */
export function pointsBounds(points: readonly FlatPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Frames a set of map points (a route's endpoints and the arc's control point)
 * in the viewport.
 *
 * The scale is chosen so the box plus `marginPx` of screen space fits, then
 * clamped: never further out than the world view, never further in than
 * `maxScale`. The centre is the box's centre, gently clamped so that a route
 * near an edge of the map does not reveal the empty space beyond it.
 */
export function fitPointsView(
  points: readonly FlatPoint[],
  map: FlatMapSize,
  viewport: FlatViewport,
  options: RouteFrameOptions = {},
): FlatView | null {
  const bounds = pointsBounds(points);
  if (!bounds) return null;

  const mapW = Math.max(1, finite(map.width, 1));
  const mapH = Math.max(1, finite(map.height, 1));
  const vw = Math.max(1, finite(viewport.w, 1));
  const vh = Math.max(1, finite(viewport.h, 1));
  const world = fitWorldView({ width: mapW, height: mapH }, { w: vw, h: vh });
  const margin = Math.max(0, finite(options.marginPx, ROUTE_FRAME_MARGIN_PX));

  const boxW = Math.max(1, bounds.maxX - bounds.minX);
  const boxH = Math.max(1, bounds.maxY - bounds.minY);
  const availableW = Math.max(1, vw - 2 * margin);
  const availableH = Math.max(1, vh - 2 * margin);

  const minScale = clampScale(finite(options.minScale, world.scale));
  const maxScale = Math.max(minScale, finite(options.maxScale, DEFAULT_MAX_ROUTE_ZOOM));
  const scale = clamp(Math.min(availableW / boxW, availableH / boxH), minScale, maxScale);

  // Centre on the box. The sea around the map is painted in the same colour as
  // the page, so a route near the edge of the world may safely sit off-centre
  // without revealing a seam — the margin always wins over "contain the map".
  return {
    scale,
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
  };
}

/** Linear interpolation between two views (`t` is clamped to [0, 1]). */
export function lerpView(from: FlatView, to: FlatView, t: number): FlatView {
  const k = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  return {
    scale: from.scale + (to.scale - from.scale) * k,
    cx: from.cx + (to.cx - from.cx) * k,
    cy: from.cy + (to.cy - from.cy) * k,
  };
}

/**
 * One frame of a zoom tween: the eased view between `from` and `to` at
 * `progress` 0..1. The easing is the same `easeInOutCubic` the plane uses, so
 * the camera and the aircraft feel like one product.
 */
export function tweenView(from: FlatView, to: FlatView, progress: number): FlatView {
  return lerpView(from, to, easeInOutCubic(progress));
}

/**
 * True when a view is (practically) the world view — the whole planet, in
 * frame. Used to decide whether a new route needs the "pull back to the world
 * first" half of the zoom, or can simply dive into its own framing.
 */
export function isWorldFraming(view: FlatView, world: FlatView, tolerance = 0.02): boolean {
  const scaleOk =
    Number.isFinite(view.scale) &&
    Math.abs(view.scale - world.scale) <= Math.max(world.scale, 1e-6) * tolerance;
  // A few map px of drift are invisible at world scale; the world view is
  // centred, so anything further away is a real pan.
  const centreOk = Math.abs(view.cx - world.cx) <= 8 && Math.abs(view.cy - world.cy) <= 8;
  return scaleOk && centreOk;
}

/** True when two views frame (practically) the same picture. */
export function viewsEqual(a: FlatView, b: FlatView, epsilon = 1e-3): boolean {
  return (
    Math.abs(a.scale - b.scale) <= epsilon * Math.max(1, Math.abs(a.scale)) &&
    Math.abs(a.cx - b.cx) <= epsilon &&
    Math.abs(a.cy - b.cy) <= epsilon
  );
}

/**
 * The inverse of the stage scale: how much an element on the map must be
 * shrunk so it keeps its configured size on screen. Route markers, the plane
 * and the city labels use it, so an airport dot stays 5 px whether the map
 * shows the whole planet or one continent.
 */
export function screenSpaceScale(viewScale: number): number {
  if (!Number.isFinite(viewScale) || viewScale <= 0) return 1;
  return 1 / viewScale;
}
