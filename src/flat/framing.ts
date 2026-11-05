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
 *   between them) fill the viewport. The cap is generous, and it is limited
 *   further by how much of the world may leave the screen (see
 *   {@link RouteFrameOptions.minVisibleSpanPx}), so a short hop gets a real
 *   close-up while a long haul still shows a whole region — and it never zooms
 *   out past the world view, so an antipodal route shows the whole planet.
 *
 * The camera flies along a {@link ViewPath}: one continuous, eased, perceptually
 * even move (see {@link blendView}) that may pass through several keyframes —
 * e.g. `current → whole world → new route` when the visitor switches cities.
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

/**
 * The furthest a route may zoom in (map px per CSS px). Far routes are framed
 * by their own fit — this only bounds short hops, so two neighbouring cities
 * get a close-up instead of a microscope on one town.
 */
export const DEFAULT_MAX_ROUTE_ZOOM = 8;

/**
 * How much of the world must stay on screen, in map px, measured across the
 * viewport's shorter side. 90 map px ≈ 20° of longitude: enough context that a
 * close-up still reads as a place on Earth, and a guard against pixelated
 * coastal fills on small heroes. Raise it to keep more context, lower it to
 * push the focus further in.
 */
export const DEFAULT_MIN_VISIBLE_SPAN_PX = 90;

/** How long the zoom to a route takes, in ms. */
export const DEFAULT_ZOOM_DURATION_MS = 900;

/**
 * Extra travel time for a multi-leg move (e.g. out to the world and back in):
 * the same budget would otherwise make a longer journey feel rushed.
 */
export const MULTI_LEG_DURATION_FACTOR = 1.5;

/**
 * Map px of panning that "costs" as much as one e-fold of zoom. Used to share
 * a journey's time between its legs so no leg crawls or races.
 */
export const VIEW_PATH_PAN_UNIT = 420;

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
  /**
   * How much of the world must stay visible across the viewport's shorter
   * side, in map px (default {@link DEFAULT_MIN_VISIBLE_SPAN_PX}). Caps the
   * zoom-in for very short hops and small viewports.
   */
  minVisibleSpanPx?: number;
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
  const spanFloor = Math.max(1, finite(options.minVisibleSpanPx, DEFAULT_MIN_VISIBLE_SPAN_PX));
  const spanCap = Math.min(vw, vh) / spanFloor;
  const maxScale = Math.max(
    minScale,
    Math.min(finite(options.maxScale, DEFAULT_MAX_ROUTE_ZOOM), spanCap),
  );
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
 * A camera blend the eye believes: the **scale is interpolated
 * geometrically** (in log space), so the zoom feels like a constant rate
 * instead of racing at the start and crawling at the end. The centre moves
 * linearly.
 *
 * This is what every camera move uses — `t` is clamped to [0, 1].
 */
export function blendView(from: FlatView, to: FlatView, t: number): FlatView {
  // Exact endpoints: exp(log()) can land a hair off, and keyframes are
  // compared with `viewsEqual`, so the ends must be bit-exact.
  if (!(t > 0)) return { ...from };
  if (t >= 1) return { ...to };
  const k = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const fromScale = from.scale > 0 ? from.scale : 1e-6;
  const toScale = to.scale > 0 ? to.scale : 1e-6;
  const logScale = Math.log(fromScale) + (Math.log(toScale) - Math.log(fromScale)) * k;
  return {
    scale: Math.exp(logScale),
    cx: from.cx + (to.cx - from.cx) * k,
    cy: from.cy + (to.cy - from.cy) * k,
  };
}

/** A camera route through one or more keyframes, ready to be played back. */
export interface ViewPath {
  /** The keyframes, in order (at least the start and the end). */
  views: FlatView[];
  /** Normalised cumulative positions (same length as `views`; the last is 1). */
  stops: number[];
}

/**
 * Builds a {@link ViewPath} through `views`.
 *
 * Each leg gets a share of the timeline proportional to how much camera work
 * it needs — an e-fold of zoom and {@link VIEW_PATH_PAN_UNIT} map px of panning
 * count as the same effort — so a long pull-back and a short nudge do not take
 * the same time. Play it back with {@link pathProgress} + {@link viewAlongPath}.
 */
export function buildViewPath(views: readonly FlatView[], panUnit = VIEW_PATH_PAN_UNIT): ViewPath {
  if (views.length === 0) return { views: [], stops: [] };
  const pan = Math.max(1, finite(panUnit, VIEW_PATH_PAN_UNIT));
  const cost: number[] = [0];
  for (let i = 1; i < views.length; i++) {
    const prev = views[i - 1]!;
    const next = views[i]!;
    const zoom = Math.abs(
      Math.log((next.scale > 0 ? next.scale : 1e-6) / (prev.scale > 0 ? prev.scale : 1e-6)),
    );
    const panCost = Math.hypot(next.cx - prev.cx, next.cy - prev.cy) / pan;
    cost.push(cost[i - 1]! + Math.max(1e-6, zoom + panCost));
  }
  const total = cost[cost.length - 1]!;
  return {
    views: views.map((view) => ({ ...view })),
    stops: cost.map((value) => (total > 0 ? value / total : 0)),
  };
}

/**
 * The view at position `progress` (0..1) along a path — one leg at a time,
 * blended perceptually (log zoom, linear pan). Values outside [0, 1] clamp to
 * the ends.
 *
 * Playback should feed this {@link pathProgress}, not the raw clock: that is
 * what gives the move its smooth arrival and departure at every keyframe.
 */
export function viewAlongPath(path: ViewPath, progress: number): FlatView {
  const { views, stops } = path;
  if (views.length === 0) return { scale: 1, cx: 0, cy: 0 };
  if (views.length === 1) return { ...views[0]! };
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  for (let i = 1; i < views.length; i++) {
    const end = stops[i] ?? 1;
    if (p <= end || i === views.length - 1) {
      const start = stops[i - 1] ?? 0;
      const span = Math.max(1e-9, end - start);
      return blendView(views[i - 1]!, views[i]!, (p - start) / span);
    }
  }
  return { ...views[views.length - 1]! };
}

/**
 * Maps a uniform playback clock (0..1) onto a position along the path, easing
 * **each leg** on its own.
 *
 * A re-route turns the camera around at the wide view (`route → world → new
 * route`). Played at a constant rate — or with a single ease over the whole
 * path, which is fastest in the middle — that U-turn happens at full speed and
 * reads as a bounce. Easing leg by leg gives instead: a slow departure, a
 * smooth pull-back that *settles* onto the wide view, then a smooth dive that
 * accelerates and lands softly. Velocity is continuous throughout (it only
 * reaches zero exactly on a keyframe, never for a stretch of frames), so there
 * is no pause between the two halves — just one continuous arc.
 */
export function pathProgress(path: ViewPath, clock: number): number {
  const { views, stops } = path;
  if (views.length < 2) return 0;
  const c = clamp(Number.isFinite(clock) ? clock : 0, 0, 1);
  const last = views.length - 1;
  for (let i = 1; i <= last; i++) {
    const end = stops[i] ?? 1;
    if (c <= end || i === last) {
      const start = stops[i - 1] ?? 0;
      const span = Math.max(1e-9, end - start);
      const u = clamp((c - start) / span, 0, 1);
      // Smoothstep: zero velocity at both ends of the leg, so the camera
      // arrives at and leaves each keyframe with no velocity cliff.
      return start + span * (u * u * (3 - 2 * u));
    }
  }
  return 1;
}

/**
 * One frame of a zoom tween: the eased view between `from` and `to` at
 * `progress` 0..1. The easing is the same `easeInOutCubic` the plane uses, so
 * the camera and the aircraft feel like one product.
 */
export function tweenView(from: FlatView, to: FlatView, progress: number): FlatView {
  return blendView(from, to, easeInOutCubic(progress));
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
