/**
 * Route styling — turns a developer's `route` options into the concrete
 * values the globe shader and the flat SVG world consume.
 *
 * One resolution path serves both worlds, so a dash configured once looks the
 * same on the sphere and on the flat map (the globe animates it in the tube
 * shader, the flat map in `stroke-dasharray` pixels).
 *
 * Pure — no three.js, no DOM — and unit-tested.
 */
import { resolvePalette, type RouteDotsColors, type RouteDotsPalette } from '../theme.js';
import { paletteToRouteTheme } from '../theme.js';
import { normalizeArcAngleDeg } from './arcPath.js';
import { DEFAULT_ARC_RADIUS, DEFAULT_OUTBOUND_LIFT, DEFAULT_RETURN_LIFT } from './RouteModel.js';

/** Which path of a route a style applies to. */
export type RoutePathId = 'outbound' | 'return';

/**
 * Dash pattern of a route path.
 *
 * `length` and `gap` are fractions of the whole route (so "14 dashes with a
 * 0.55 duty cycle" is `length: 0.0393, gap: 0.0321`), which keeps the pattern
 * identical whether the arc is a short hop or a long haul.
 */
export interface DashOptions {
  /** Dash colour (defaults to the path colour). */
  color?: string;
  /** Dash length as a fraction of the route, 0..1. */
  length?: number;
  /** Gap between dashes as a fraction of the route, 0..1. */
  gap?: number;
  /** Dash travel in dashes per second (default per path; 0 freezes them). */
  speed?: number;
  /** Dash thickness: tube radius (globe) / stroke width in px (flat). */
  width?: number;
  /** `false` draws a solid, undashed line. */
  enabled?: boolean;
}

/** Per-path styling: colour, geometry and dashes. */
export interface RoutePathOptions {
  /** Path colour (defaults to the theme's route colours). */
  color?: string;
  /** Path opacity (globe shader; default 0.95 / 0.8). */
  opacity?: number;
  /** Arc lift as a fraction of the globe radius. */
  lift?: number;
  /** Curve angle in degrees: banks the arc out of its great-circle plane. */
  angle?: number;
  /** Path thickness: tube radius in globe radii (globe) / stroke px (flat). */
  width?: number;
  /** Flat-map stroke width in px (default 1.8 / 1.4). */
  strokeWidth?: number;
  /** Dash pattern, or `false` for a solid line. */
  dash?: DashOptions | false;
}

/**
 * `route` option shape.
 *
 * Top-level keys (`color`, `angle`, `dash`, …) act as *shared defaults*: they
 * apply to both paths until `outbound` / `return` override them. The legacy
 * keys `outboundLift`, `returnLift` and `arcRadius` keep working.
 */
export interface RouteStyleOptions extends RoutePathOptions {
  /** Outbound (origin → destination) path overrides. */
  outbound?: RoutePathOptions;
  /** Return (destination → origin) path overrides, used for round trips. */
  return?: RoutePathOptions;
  /** @deprecated Use `outbound.lift`. */
  outboundLift?: number;
  /** @deprecated Use `return.lift`. */
  returnLift?: number;
  /** @deprecated Use `width` (applies to both paths). */
  arcRadius?: number;
  /** Duration of the draw-on animation per arc (ms, default 1100). */
  drawDurationMs?: number;
  /** Delay between starting the outbound and the return draw (ms, default 350). */
  staggerMs?: number;
  /** Pulse rings on route change (default true). */
  pulse?: boolean;
}

/** A dash pattern with every value resolved, ready for the shader / SVG. */
export interface ResolvedDash {
  color: string;
  length: number;
  gap: number;
  speed: number;
}

/** A path style with every value resolved. */
export interface ResolvedPathStyle {
  color: string;
  opacity: number;
  lift: number;
  angle: number;
  /** Tube radius, in globe radii. */
  width: number;
  /** Stroke width, in flat-map px. */
  strokeWidth: number;
  /** `null` when the path is drawn as a solid line. */
  dash: ResolvedDash | null;
}

/** Both paths of a route, plus the shared timing options. */
export interface ResolvedRouteStyle {
  outbound: ResolvedPathStyle;
  return: ResolvedPathStyle;
  drawDurationMs: number;
  staggerMs: number;
  pulse: boolean;
}

/**
 * Outbound dash defaults — the historical look (14 dashes, 55 % duty cycle,
 * flowing at 0.35 route-lengths per second).
 */
export const DEFAULT_OUTBOUND_DASH = {
  length: (1 / 14) * 0.55,
  gap: (1 / 14) * 0.45,
  speed: 4.9,
} as const;

/**
 * Return dash defaults — finer and slower than the outbound (18 dashes,
 * 45 % duty cycle, 0.22 route-lengths per second).
 */
export const DEFAULT_RETURN_DASH = {
  length: (1 / 18) * 0.45,
  gap: (1 / 18) * 0.55,
  speed: 3.96,
} as const;

/** Flat-world stroke widths (px) — outbound slightly heavier than the return. */
export const DEFAULT_STROKE_WIDTH = { outbound: 1.8, return: 1.4 } as const;

/**
 * Widths up to this value are the legacy tube radius in globe radii; anything
 * larger is read as **px** and converted by {@link globeTubeRadius}. (The
 * default radius is 0.0015 — a 0.05-radius tube would already be a tenth of
 * the planet, so no sane globe-unit width crosses this line.)
 */
export const GLOBE_WIDTH_LEGACY_MAX = 0.05;

/**
 * On-screen globe radius in px at the default camera framing (altitude 1.9,
 * 42° fov, ~800 px-tall canvas) — the reference for px → globe-radius
 * conversion, chosen so `width: 1.8` renders ~1.8 px wide, matching the
 * flat world's 1.8 px stroke.
 */
export const GLOBE_RADIUS_PX_AT_DEFAULT_VIEW = 1300;

/**
 * Upper bound for a px width (anything wider is surely a unit mix-up, and a
 * tube that big swallows the globe).
 */
export const MAX_LINE_WIDTH_PX = 64;

/**
 * Converts a resolved path width into the globe's tube radius.
 *
 * The flat world measures line thickness in px, and the docs / studio author
 * `width` and `dash.width` as px — but the globe needs a tube radius in globe
 * radii. Feeding a px value straight into `TubeGeometry` built a tube *larger
 * than the planet* (the camera ends up inside it and the line disappears —
 * "the 3D lines don't show"). Small legacy values keep their globe-radius
 * meaning; px-range values are converted so one number styles both worlds.
 */
export function globeTubeRadius(width: number): number {
  if (!Number.isFinite(width) || width <= GLOBE_WIDTH_LEGACY_MAX) return width;
  const px = Math.min(width, MAX_LINE_WIDTH_PX);
  return px / GLOBE_RADIUS_PX_AT_DEFAULT_VIEW;
}

/** Smallest dash / gap allowed, as a fraction of the route. */
const MIN_DASH_PART = 0.0015;
/** Largest dash / gap allowed. */
const MAX_DASH_PART = 0.5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const num = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

/** Shader uniforms for a dash pattern (globe). */
export function dashUniforms(dash: ResolvedDash): {
  dashCount: number;
  dashSolid: number;
  flow: number;
} {
  const period = Math.max(MIN_DASH_PART, dash.length + dash.gap);
  return {
    dashCount: 1 / period,
    dashSolid: clamp(dash.length / period, 0.02, 0.98),
    flow: dash.speed * period,
  };
}

/** `stroke-dasharray` values in px for a flat-world path of `lengthPx`. */
export function dashArrayPx(dash: ResolvedDash, lengthPx: number): [number, number] {
  const scale = Math.max(1, lengthPx);
  return [Math.max(1, dash.length * scale), Math.max(1, dash.gap * scale)];
}

function resolveDash(
  option: DashOptions | false | undefined,
  fallback: { length: number; gap: number; speed: number },
  color: string,
  width: number | undefined,
  strokeWidth: number | undefined,
  fallbackWidth: number,
  fallbackStroke: number,
): {
  dash: ResolvedDash | null;
  width: number;
  strokeWidth: number;
} {
  if (option === false || (typeof option === 'object' && option.enabled === false)) {
    return {
      dash: null,
      width: num(width, fallbackWidth),
      strokeWidth: num(strokeWidth, fallbackStroke),
    };
  }
  const o: DashOptions = typeof option === 'object' && option ? option : {};
  const dash: ResolvedDash = {
    color: o.color ?? color,
    length: clamp(num(o.length, fallback.length), MIN_DASH_PART, MAX_DASH_PART),
    gap: clamp(num(o.gap, fallback.gap), MIN_DASH_PART, MAX_DASH_PART),
    speed: clamp(num(o.speed, fallback.speed), 0, 200),
  };
  return {
    dash,
    width: num(o.width ?? width, fallbackWidth),
    strokeWidth: num(o.width ?? strokeWidth, fallbackStroke),
  };
}

function resolvePath(
  id: RoutePathId,
  palette: RouteDotsPalette,
  options: RouteStyleOptions,
): ResolvedPathStyle {
  const theme = paletteToRouteTheme(palette);
  const themePath = id === 'outbound' ? theme.outbound : theme.return;
  const specific: RoutePathOptions = options[id] ?? {};
  const legacyLift = id === 'outbound' ? options.outboundLift : options.returnLift;

  const color = specific.color ?? options.color ?? themePath.color;
  const opacity = clamp(num(specific.opacity ?? options.opacity, themePath.opacity), 0, 1);
  const lift = num(
    specific.lift ?? legacyLift ?? options.lift,
    id === 'outbound' ? DEFAULT_OUTBOUND_LIFT : DEFAULT_RETURN_LIFT,
  );
  const angle = normalizeArcAngleDeg(specific.angle ?? options.angle);
  const fallbackWidth = (options.arcRadius ?? DEFAULT_ARC_RADIUS) * (id === 'return' ? 0.8 : 1);
  const width = num(specific.width ?? options.width, fallbackWidth);
  const strokeWidth = num(specific.strokeWidth ?? options.strokeWidth, DEFAULT_STROKE_WIDTH[id]);

  const dashOption = specific.dash ?? options.dash;
  const resolved = resolveDash(
    dashOption,
    id === 'outbound' ? DEFAULT_OUTBOUND_DASH : DEFAULT_RETURN_DASH,
    color,
    specific.dash && typeof specific.dash === 'object' ? specific.dash.width : undefined,
    specific.dash && typeof specific.dash === 'object' ? specific.dash.width : undefined,
    width,
    strokeWidth,
  );

  return {
    color,
    opacity,
    lift,
    angle,
    width: resolved.width,
    strokeWidth: resolved.strokeWidth,
    dash: resolved.dash,
  };
}

/**
 * Resolves the `route` option into concrete path styles.
 *
 * @param theme active theme name
 * @param options the developer's `route` options (any subset)
 * @param colors optional palette overrides (the same ones passed to `colors`)
 */
export function resolveRouteStyle(
  theme: 'light' | 'dark' = 'light',
  options: RouteStyleOptions = {},
  colors?: RouteDotsColors,
): ResolvedRouteStyle {
  const palette = resolvePalette(theme, colors);
  return {
    outbound: resolvePath('outbound', palette, options),
    return: resolvePath('return', palette, options),
    drawDurationMs: Math.max(0, num(options.drawDurationMs, 1100)),
    staggerMs: Math.max(0, num(options.staggerMs, 350)),
    pulse: options.pulse !== false,
  };
}
