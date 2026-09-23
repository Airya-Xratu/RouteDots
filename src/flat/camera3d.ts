/**
 * Flat-world camera: the **3D camera effect** for the flat map.
 *
 * The flat world is a real CSS 3D scene: a perspective viewport holds a stage
 * that can be tilted and yawed, and the map's layers (country fills, borders,
 * city ripples, routes and the plane) float at different `translateZ` depths —
 * so the routes and the plane hang *above* the map with genuine parallax,
 * exactly like the 3D world, while the geography stays a flat map.
 *
 * Pure maths + pure string builders: no DOM, no three.js, unit-tested. The
 * renderer only assigns the transforms this module returns.
 */

/** How the flat world's camera behaves. */
export interface FlatCamera3DOptions {
  /** Use the 3D camera effect (default false — the flat map stays flat). */
  enabled?: boolean;
  /** CSS perspective (the "field of view"), in px (default 1400). */
  perspective?: number;
  /** Tilt around the horizontal axis, in degrees (default 32). */
  tilt?: number;
  /** Yaw around the screen axis, in degrees (default -6). */
  yaw?: number;
  /** How far the route + plane layer floats above the map, in px (default 44). */
  depth?: number;
  /** Let the user drag to orbit and scroll to zoom (default false). */
  interactive?: boolean;
  /** Ease the framing so the plane never leaves the viewport (default true). */
  follow?: boolean;
}

/** Resolved camera settings (defaults filled in, orbit clamped). */
export interface ResolvedFlatCamera3D {
  enabled: boolean;
  perspective: number;
  tilt: number;
  yaw: number;
  depth: number;
  interactive: boolean;
  follow: boolean;
}

/** Camera defaults, used when the developer enables the effect. */
export const DEFAULT_FLAT_CAMERA_3D = {
  perspective: 1400,
  tilt: 32,
  yaw: -6,
  depth: 44,
} as const;

/** Tilt / yaw limits for dragging — beyond them the map is unreadable. */
export const ORBIT_LIMITS = { tilt: 78, yaw: 70 } as const;

/** Depth multiplier for the city/border layers, relative to the route layer. */
export const LAYER_DEPTH_FACTOR = { cities: 0.55, borders: 0.3 } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const num = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

/** Clamps an orbit gesture to the readable range. */
export function clampOrbit(tilt: number, yaw: number): { tilt: number; yaw: number } {
  return {
    tilt: clamp(num(tilt, 0), -ORBIT_LIMITS.tilt, ORBIT_LIMITS.tilt),
    yaw: clamp(num(yaw, 0), -ORBIT_LIMITS.yaw, ORBIT_LIMITS.yaw),
  };
}

/** Fills in defaults and clamps everything into range. */
export function resolveFlatCamera3D(options: FlatCamera3DOptions = {}): ResolvedFlatCamera3D {
  const orbit = clampOrbit(
    num(options.tilt, DEFAULT_FLAT_CAMERA_3D.tilt),
    num(options.yaw, DEFAULT_FLAT_CAMERA_3D.yaw),
  );
  return {
    enabled: options.enabled === true,
    perspective: clamp(num(options.perspective, DEFAULT_FLAT_CAMERA_3D.perspective), 300, 6000),
    tilt: orbit.tilt,
    yaw: orbit.yaw,
    depth: clamp(num(options.depth, DEFAULT_FLAT_CAMERA_3D.depth), 0, 400),
    interactive: options.interactive === true,
    follow: options.follow !== false,
  };
}

/** Where a camera value goes: styles for the DOM, or the plane's depth. */
export interface FlatCamera3DTransforms {
  /** The `perspective` **length** for the viewport element ('' when off). */
  viewport: string;
  /** `--rd-perspective` etc., for reference/documentation. */
  perspectivePx: number;
  /** `rotateX() rotateZ()` for the world element ('' when disabled). */
  world: string;
  /** `translateZ()` for the route + plane layer. */
  routeLayer: string;
  /** `translateZ()` for the border layer. */
  borderLayer: string;
  /** `translateZ()` for the city layer. */
  cityLayer: string;
}

/** CSS transforms for a resolved camera (all layers of the flat world). */
export function flatCamera3DTransforms(camera: ResolvedFlatCamera3D): FlatCamera3DTransforms {
  if (!camera.enabled) {
    return {
      viewport: '',
      perspectivePx: camera.perspective,
      world: '',
      routeLayer: '',
      borderLayer: '',
      cityLayer: '',
    };
  }
  return {
    // A bare length: it is assigned to `style.perspective` (a CSS function
    // like `perspective(1400px)` is not a valid value for that property).
    viewport: `${camera.perspective}px`,
    perspectivePx: camera.perspective,
    world: `rotateX(${camera.tilt.toFixed(2)}deg) rotateZ(${camera.yaw.toFixed(2)}deg)`,
    routeLayer: `translateZ(${camera.depth.toFixed(2)}px)`,
    borderLayer: `translateZ(${(camera.depth * LAYER_DEPTH_FACTOR.borders).toFixed(2)}px)`,
    cityLayer: `translateZ(${(camera.depth * LAYER_DEPTH_FACTOR.cities).toFixed(2)}px)`,
  };
}

/** Exponential ease factor: `1 − e^(−k·dt)`, clamped into [0, 1]. */
export function easeFactor(k: number, dtSec: number): number {
  if (!Number.isFinite(k) || !Number.isFinite(dtSec) || k <= 0 || dtSec <= 0) return 0;
  return clamp(1 - Math.exp(-k * dtSec), 0, 1);
}

/** Zoom limits for the flat world's camera. */
export const ZOOM_LIMITS = { min: 0.35, max: 6 } as const;

/**
 * One zoom step of the wheel: scrolling up (negative `deltaY`, as every map
 * does it) zooms in, scrolling down zooms out.
 */
export function zoomStep(scale: number, deltaY: number, step = 0.09): number {
  const factor = 1 - Math.sign(deltaY) * step;
  return clamp(scale * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
}

/** Input for {@link followCentre}: everything in map (stage) pixels. */
export interface FollowCentreInput {
  /** Where the plane is, in map px. */
  plane: { x: number; y: number };
  /** Current centre of the view, in map px. */
  centre: { x: number; y: number };
  /** Viewport size in CSS px. */
  viewport: { w: number; h: number };
  /** Current stage scale (px per map px). */
  scale: number;
  /** Keep-out margin, in map px (default 90). */
  margin?: number;
}

/**
 * Camera tracking for the flat world: when the plane leaves the safe area,
 * the centre the view should ease toward — otherwise `null`.
 *
 * The "safe area" is the viewport (converted to map px by `scale`) shrunk by
 * `margin`, so the plane is pulled back into frame before it can slip off
 * screen — the flat-world twin of the globe's `trackCamera`.
 */
export function followCentre(input: FollowCentreInput): { x: number; y: number } | null {
  const { plane, centre, viewport, scale } = input;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const margin = input.margin ?? 90;
  const halfW = viewport.w / (2 * scale);
  const halfH = viewport.h / (2 * scale);
  const safeW = Math.max(1, halfW - margin / scale);
  const safeH = Math.max(1, halfH - margin / scale);

  const dx = plane.x - centre.x;
  const dy = plane.y - centre.y;
  if (Math.abs(dx) <= safeW && Math.abs(dy) <= safeH) return null;

  return {
    x: centre.x + clamp(dx, -safeW, safeW),
    y: centre.y + clamp(dy, -safeH, safeH),
  };
}
