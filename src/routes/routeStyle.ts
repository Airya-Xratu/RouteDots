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
 * What {@link DashOptions.length} and {@link DashOptions.gap} measure:
 *
 * - `'world'` — a **fixed length on the ground**: globe radii on the sphere,
 *   degrees (× π/180 per radius) on the flat map. A short hop and a long haul
 *   then carry the very same dashes and the very same gaps — a long route
 *   simply fits more of them.
 * - `'route'` — a fraction of the whole route (the historical meaning), so
 *   the pattern stretches to fit: 14 dashes stay 14 dashes whether the arc
 *   crosses a city or an ocean, and the gaps grow with the route.
 */
export type DashUnits = 'world' | 'route';

/**
 * Dash pattern of a route path.
 *
 * The built-in pattern measures in **world units** (`units: 'world'`), so
 * dashes and gaps are the same physical length on every route. Pass explicit
 * `length` / `gap` numbers with `units: 'route'` for the older
 * stretch-to-fit behaviour — or keep `units: 'world'` and tune the fixed
 * length yourself.
 */
export interface DashOptions {
  /** Dash colour (defaults to the path colour). */
  color?: string;
  /**
   * Dash length, in the unit named by {@link DashOptions.units}.
   * (Default: 0.062 globe radii ≈ 390 km.)
   */
  length?: number;
  /**
   * Gap between dashes, in the unit named by {@link DashOptions.units}.
   * (Default: 0.05 globe radii ≈ 320 km.)
   */
  gap?: number;
  /**
   * Unit of `length` / `gap` (default `'world'`).
   *
   * When you supply `length` or `gap` *without* naming a unit they are read
   * as route fractions, so hand-written configs written for older versions
   * keep their look.
   */
  units?: DashUnits;
  /**
   * Dash flow (default per path; 0 freezes them). In `'world'` units this is
   * the travel speed in globe radii per second, so the dashes sweep the
   * route at the same pace whatever its length.
   */
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
  /** Unit `length` / `gap` are measured in (see {@link DashOptions.units}). */
  units: DashUnits;
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
 * Arc length the built-in dash patterns are sized against: a quarter of the
 * globe (90° of great circle), the length of a typical long haul.
 *
 * The world-unit defaults are the old route-fraction defaults times this
 * length, so a 90° route looks exactly like it always did — while every other
 * route now gets the same dashes instead of stretched ones.
 */
export const REFERENCE_ARC_LENGTH = Math.PI / 2;

/**
 * Outbound dash defaults in **route fractions** — 14 dashes, 55 % duty
 * cycle. Used when `units: 'route'` is asked for.
 */
export const DEFAULT_OUTBOUND_DASH = {
  length: (1 / 14) * 0.55,
  gap: (1 / 14) * 0.45,
  speed: 4.9,
} as const;

/** Dash period of the outbound route-fraction default (1/14 of the route). */
const outboundPeriod = DEFAULT_OUTBOUND_DASH.length + DEFAULT_OUTBOUND_DASH.gap;

/**
 * Return dash defaults in **route fractions** — finer than the outbound
 * (18 dashes, 45 % duty cycle).
 */
export const DEFAULT_RETURN_DASH = {
  length: (1 / 18) * 0.45,
  gap: (1 / 18) * 0.55,
  speed: 3.96,
} as const;

/** Dash period of the return route-fraction default (1/18 of the route). */
const returnPeriod = DEFAULT_RETURN_DASH.length + DEFAULT_RETURN_DASH.gap;

/**
 * Outbound dash defaults in **world units** (globe radii) — the same look as
 * {@link DEFAULT_OUTBOUND_DASH} on a 90° route: a ~390 km dash, a ~320 km
 * gap, and the same number of dashes on every route.
 */
export const DEFAULT_OUTBOUND_DASH_WORLD = {
  length: DEFAULT_OUTBOUND_DASH.length * REFERENCE_ARC_LENGTH,
  gap: DEFAULT_OUTBOUND_DASH.gap * REFERENCE_ARC_LENGTH,
  // Travel speed, in globe radii per second: the one that keeps the pattern
  // flowing at the same 0.35 dashes/second the fraction default had.
  speed: DEFAULT_OUTBOUND_DASH.speed * outboundPeriod * (outboundPeriod * REFERENCE_ARC_LENGTH),
} as const;

/**
 * Return dash defaults in **world units** (globe radii) — the same look as
 * {@link DEFAULT_RETURN_DASH} on a 90° route.
 */
export const DEFAULT_RETURN_DASH_WORLD = {
  length: DEFAULT_RETURN_DASH.length * REFERENCE_ARC_LENGTH,
  gap: DEFAULT_RETURN_DASH.gap * REFERENCE_ARC_LENGTH,
  speed: DEFAULT_RETURN_DASH.speed * returnPeriod * (returnPeriod * REFERENCE_ARC_LENGTH),
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
/** Largest dash / gap allowed, as a fraction of the route. */
const MAX_DASH_PART = 0.5;
/** Smallest dash / gap allowed in world units (globe radii). */
const MIN_DASH_WORLD = 0.0005;
/** Largest dash / gap allowed in world units (globe radii). */
const MAX_DASH_WORLD = 0.5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const num = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

/**
 * The unit a dash pattern is measured in.
 *
 * The library default is **world units** — equal dashes on every route. A
 * hand-written `length` / `gap` without an explicit `units` stays a route
 * fraction, so older configs keep the look they were authored against.
 */
export function resolveDashUnits(dash: DashOptions | undefined): DashUnits {
  if (dash?.units === 'route' || dash?.units === 'world') return dash.units;
  if (dash && (dash.length !== undefined || dash.gap !== undefined)) return 'route';
  return 'world';
}

/**
 * Length of one dash + gap period, and the route length it divides, in the
 * units the shader and the SVG both count in.
 *
 * For `'route'` units the route is one unit long by definition, so a pattern
 * is a pure fraction; for `'world'` units the pattern is a fixed arc length
 * and the route length decides how many of them fit.
 */
function dashPeriod(dash: ResolvedDash, routeLength: number): { period: number; length: number } {
  if (dash.units === 'world') {
    const period = Math.max(MIN_DASH_WORLD, dash.length + dash.gap);
    return { period, length: Math.max(1e-6, routeLength) };
  }
  return { period: Math.max(MIN_DASH_PART, dash.length + dash.gap), length: 1 };
}

/**
 * Shader uniforms for a dash pattern (globe).
 *
 * @param dash resolved pattern
 * @param routeLength length of the arc in world units (globe radii) — only
 *   read when the pattern is measured in world units.
 */
export function dashUniforms(
  dash: ResolvedDash,
  routeLength = 1,
): {
  dashCount: number;
  dashSolid: number;
  flow: number;
} {
  if (dash.units === 'world') {
    const { period, length } = dashPeriod(dash, routeLength);
    return {
      // A fixed-length pattern: the route length only decides *how many*
      // dashes fit, never how long one is.
      dashCount: length / period,
      dashSolid: clamp(dash.length / period, 0.02, 0.98),
      // Constant ground speed (globe radii per second) → the same number of
      // dashes flows past any point on any route, every second.
      flow: dash.speed / period,
    };
  }
  const { period, length } = dashPeriod(dash, routeLength);
  return {
    dashCount: length / period,
    dashSolid: clamp(dash.length / period, 0.02, 0.98),
    flow: (dash.speed * period) / length,
  };
}

/**
 * How many dash periods flow past a point per second — the rate the flat map
 * (and, via {@link dashUniforms}, the globe) animates at.
 *
 * A world-unit pattern flows at a constant rate on every route; a
 * route-fraction one keeps the flat map's historical reading of `speed`.
 *
 * @param dash resolved pattern
 * @param routeLength length of the arc in world units (globe radii), read
 *   only for world-unit patterns.
 */
export function dashFlowPerSecond(dash: ResolvedDash, routeLength = 1): number {
  if (dash.units === 'route') return dash.speed;
  const { period } = dashPeriod(dash, routeLength);
  return dash.speed / period;
}

/**
 * `stroke-dasharray` values in px for a flat-world path.
 *
 * @param dash resolved pattern
 * @param lengthPx length of the path in map px — used as the scale for
 *   `'route'` patterns.
 * @param worldToPx map px per world unit (`width / 2π`); used to convert a
 *   world-unit pattern into px.
 */
export function dashArrayPx(dash: ResolvedDash, lengthPx: number, worldToPx = 0): [number, number] {
  const scale = dash.units === 'world' && worldToPx > 0 ? worldToPx : Math.max(1, lengthPx);
  return [Math.max(1, dash.length * scale), Math.max(1, dash.gap * scale)];
}

function resolveDash(
  option: DashOptions | false | undefined,
  fallback: { length: number; gap: number; speed: number },
  worldFallback: { length: number; gap: number; speed: number },
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
  const units = resolveDashUnits(o);
  const defaults = units === 'world' ? worldFallback : fallback;
  const [minPart, maxPart] =
    units === 'world' ? [MIN_DASH_WORLD, MAX_DASH_WORLD] : [MIN_DASH_PART, MAX_DASH_PART];
  const dash: ResolvedDash = {
    color: o.color ?? color,
    length: clamp(num(o.length, defaults.length), minPart, maxPart),
    gap: clamp(num(o.gap, defaults.gap), minPart, maxPart),
    speed: clamp(num(o.speed, defaults.speed), 0, 200),
    units,
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
    id === 'outbound' ? DEFAULT_OUTBOUND_DASH_WORLD : DEFAULT_RETURN_DASH_WORLD,
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
