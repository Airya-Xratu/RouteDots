/**
 * Portable RouteDots configuration.
 *
 * The showcase studio exports a JSON document; a project that depends on this
 * library imports that file and hands it to {@link parseRouteDotsConfig},
 * `RouteDots.fromConfig` or `rd.applyConfig`. The document is versioned and
 * contains only values JSON can express — a custom `draw` function, an image
 * bitmap and a replacement land mask are omitted (with a warning) rather than
 * silently stringified into something the renderer cannot rebuild.
 *
 * Pure: no DOM, no three.js. The class methods on `RouteDots` are thin
 * wrappers around the functions in this file.
 */
import { CITIES } from './cities.js';
import {
  PLANE_ICON_NAMES,
  type PlaneIconGeometry,
  type PlaneIconName,
} from './routes/PlaneIcon.js';
import type { City } from './types.js';
import type { RouteDotsOptions, RouteDotsRouteInfo } from './RouteDots.js';

/** Document version this library reads and writes. */
export const ROUTEDOTS_CONFIG_VERSION = 1;

/**
 * A route endpoint in a config file: an IATA code, or a point (with an
 * optional name) when the city is not in `RouteDots.CITIES`.
 */
export type RouteDotsConfigEndpoint =
  | string
  | {
      lat: number;
      lng: number;
      code?: string;
      name?: string;
      country?: string;
    };

/** The route a config document draws, if any. */
export interface RouteDotsConfigRoute {
  from: RouteDotsConfigEndpoint;
  to: RouteDotsConfigEndpoint;
  /** Default `false` when omitted. */
  roundTrip?: boolean;
}

/**
 * A portable RouteDots scene.
 *
 * `options` is the JSON-safe subset of {@link RouteDotsOptions} — pass it
 * straight to the constructor or to `setOptions`. `route` is the flight the
 * studio was showing (`null` when there was none); it is not the `route`
 * *style* object, which lives at `options.route`.
 */
export interface RouteDotsConfig {
  version: 1;
  /** Optional label, ignored by the renderer (the showcase writes one). */
  name?: string;
  route: RouteDotsConfigRoute | null;
  options: RouteDotsOptions;
}

/**
 * How a parsed payload should be applied:
 *
 * - `document` — a versioned config (or a hand-written `{ route: { from, to }, … }`).
 *   Replaces the option set; omitted keys fall back to library defaults.
 * - `options` — a bare {@link RouteDotsOptions} object. Merges, like `setOptions`.
 */
export type RouteDotsConfigKind = 'document' | 'options';

/** The result of {@link parseRouteDotsConfig}. */
export interface ParsedRouteDotsConfig {
  version: 1;
  kind: RouteDotsConfigKind;
  name?: string;
  /**
   * The route to draw, when the payload named one. `null` on a document means
   * "no route" (`routeSpecified` distinguishes that from "leave the route").
   */
  route: RouteDotsConfigRoute | null;
  /** True when the document included a `route` key, including `"route": null`. */
  routeSpecified: boolean;
  options: RouteDotsOptions;
  /** Keys that were dropped or coerced. Empty when the payload was clean. */
  warnings: string[];
}

/** Thrown when a payload is not a RouteDots config at all. */
export class RouteDotsConfigError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join('; ')}` : message);
    this.name = 'RouteDotsConfigError';
    this.issues = issues;
  }
}

const OPTION_KEYS = [
  'theme',
  'world',
  'surface',
  'colors',
  'view',
  'autoRotate',
  'interactive',
  'texture',
  'borders',
  'hexTiles',
  'route',
  'plane',
  'cities',
  'labels',
  'airports',
  'camera3d',
  'frameRoute',
  'fallback',
  'flat',
] as const;

type OptionKey = (typeof OPTION_KEYS)[number];

const COLOR_KEYS = [
  'ocean',
  'countries',
  'dots',
  'borders',
  'cities',
  'atmosphere',
  'outbound',
  'return',
  'marker',
  'ring',
  'plane',
  'label',
  'labelBackground',
  'globe',
  'land',
  'background',
] as const;

const DOCUMENT_KEYS = new Set(['version', 'name', 'route', 'options']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const isOptionKey = (key: string): key is OptionKey =>
  (OPTION_KEYS as readonly string[]).includes(key);

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

function warn(warnings: string[], message: string): void {
  warnings.push(message);
}

function readNumber(value: unknown, path: string, warnings: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (value !== undefined) warn(warnings, `${path} must be a finite number`);
    return undefined;
  }
  return round(value);
}

function readBoolean(value: unknown, path: string, warnings: string[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    if (value !== undefined) warn(warnings, `${path} must be a boolean`);
    return undefined;
  }
  return value;
}

function readString(
  value: unknown,
  path: string,
  warnings: string[],
  max = 200,
): string | undefined {
  if (typeof value !== 'string') {
    if (value !== undefined) warn(warnings, `${path} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    warn(warnings, `${path} is too long`);
    return undefined;
  }
  return trimmed;
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  warnings: string[],
): T | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    if (value !== undefined) warn(warnings, `${path} must be one of ${allowed.join(', ')}`);
    return undefined;
  }
  return value as T;
}

function readObject(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    if (value !== undefined) warn(warnings, `${path} must be an object`);
    return undefined;
  }
  return value;
}

/** Assigns only defined values, so a dropped field does not erase a sibling. */
function put(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function finish(target: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(target).length > 0 ? target : undefined;
}

function noteUnknown(
  source: Record<string, unknown>,
  known: readonly string[],
  path: string,
  warnings: string[],
): void {
  for (const key of Object.keys(source)) {
    if (!known.includes(key)) warn(warnings, `${path}.${key} is not a RouteDots option`);
  }
}

function sanitizeColors(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, string> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    if (!(key in source)) continue;
    const color = readString(source[key], `${path}.${key}`, warnings, 80);
    if (color) out[key] = color;
  }
  noteUnknown(source, COLOR_KEYS, path, warnings);
  return finish(out) as Record<string, string> | undefined;
}

function sanitizeIcon(
  value: unknown,
  path: string,
  warnings: string[],
): PlaneIconName | PlaneIconGeometry | undefined {
  if (typeof value === 'string') {
    if ((PLANE_ICON_NAMES as readonly string[]).includes(value)) return value as PlaneIconName;
    warn(
      warnings,
      `${path} must be a preset (${PLANE_ICON_NAMES.join(', ')}) or { path, viewBox }`,
    );
    return undefined;
  }
  if (!isPlainObject(value)) {
    if (value !== undefined) {
      warn(warnings, `${path} is not portable JSON (preset name or { path, viewBox })`);
    }
    return undefined;
  }
  const pathData = readString(value.path, `${path}.path`, warnings, 8000);
  if (!pathData) {
    warn(
      warnings,
      `${path} needs an SVG path (custom draw functions and images cannot be exported)`,
    );
    return undefined;
  }
  const icon: PlaneIconGeometry = { path: pathData };
  if (value.viewBox !== undefined) {
    const viewBox = readNumber(value.viewBox, `${path}.viewBox`, warnings);
    if (viewBox !== undefined && viewBox > 0) icon.viewBox = viewBox;
    else if (viewBox !== undefined) warn(warnings, `${path}.viewBox must be positive`);
  }
  if ('draw' in value || 'image' in value) {
    warn(warnings, `${path}: kept the SVG path; draw/image icons are not portable`);
  }
  return icon;
}

/** Dash units a portable config may carry. */
const DASH_UNITS = ['world', 'route'] as const;

function sanitizeDash(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | false | undefined {
  if (value === false) return false;
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'length', readNumber(source.length, `${path}.length`, warnings));
  put(out, 'gap', readNumber(source.gap, `${path}.gap`, warnings));
  put(out, 'speed', readNumber(source.speed, `${path}.speed`, warnings));
  put(out, 'width', readNumber(source.width, `${path}.width`, warnings));
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'units', readEnum(source.units, DASH_UNITS, `${path}.units`, warnings));
  noteUnknown(
    source,
    ['color', 'length', 'gap', 'speed', 'width', 'enabled', 'units'],
    path,
    warnings,
  );
  return finish(out);
}

const PATH_KEYS = ['color', 'opacity', 'lift', 'angle', 'width', 'strokeWidth', 'dash'] as const;

function sanitizePath(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'opacity', readNumber(source.opacity, `${path}.opacity`, warnings));
  put(out, 'lift', readNumber(source.lift, `${path}.lift`, warnings));
  put(out, 'angle', readNumber(source.angle, `${path}.angle`, warnings));
  put(out, 'width', readNumber(source.width, `${path}.width`, warnings));
  put(out, 'strokeWidth', readNumber(source.strokeWidth, `${path}.strokeWidth`, warnings));
  if ('dash' in source) put(out, 'dash', sanitizeDash(source.dash, `${path}.dash`, warnings));
  noteUnknown(source, PATH_KEYS, path, warnings);
  return finish(out);
}

const ROUTE_KEYS = [
  ...PATH_KEYS,
  'outbound',
  'return',
  'outboundLift',
  'returnLift',
  'arcRadius',
  'drawDurationMs',
  'staggerMs',
  'pulse',
] as const;

function sanitizeRoute(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'opacity', readNumber(source.opacity, `${path}.opacity`, warnings));
  put(out, 'lift', readNumber(source.lift, `${path}.lift`, warnings));
  put(out, 'angle', readNumber(source.angle, `${path}.angle`, warnings));
  put(out, 'width', readNumber(source.width, `${path}.width`, warnings));
  put(out, 'strokeWidth', readNumber(source.strokeWidth, `${path}.strokeWidth`, warnings));
  if ('dash' in source) put(out, 'dash', sanitizeDash(source.dash, `${path}.dash`, warnings));
  if ('outbound' in source) {
    put(out, 'outbound', sanitizePath(source.outbound, `${path}.outbound`, warnings));
  }
  if ('return' in source)
    put(out, 'return', sanitizePath(source.return, `${path}.return`, warnings));
  put(out, 'outboundLift', readNumber(source.outboundLift, `${path}.outboundLift`, warnings));
  put(out, 'returnLift', readNumber(source.returnLift, `${path}.returnLift`, warnings));
  put(out, 'arcRadius', readNumber(source.arcRadius, `${path}.arcRadius`, warnings));
  put(out, 'drawDurationMs', readNumber(source.drawDurationMs, `${path}.drawDurationMs`, warnings));
  put(out, 'staggerMs', readNumber(source.staggerMs, `${path}.staggerMs`, warnings));
  put(out, 'pulse', readBoolean(source.pulse, `${path}.pulse`, warnings));
  noteUnknown(source, ROUTE_KEYS, path, warnings);
  return finish(out);
}

function sanitizePlane(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'size', readNumber(source.size, `${path}.size`, warnings));
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'clearance', readNumber(source.clearance, `${path}.clearance`, warnings));
  put(out, 'flightMs', readNumber(source.flightMs, `${path}.flightMs`, warnings));
  put(out, 'pauseMs', readNumber(source.pauseMs, `${path}.pauseMs`, warnings));
  put(out, 'startDelayMs', readNumber(source.startDelayMs, `${path}.startDelayMs`, warnings));
  if ('icon' in source) put(out, 'icon', sanitizeIcon(source.icon, `${path}.icon`, warnings));
  noteUnknown(
    source,
    ['enabled', 'size', 'color', 'clearance', 'flightMs', 'pauseMs', 'startDelayMs', 'icon'],
    path,
    warnings,
  );
  return finish(out);
}

function sanitizeDotOrRipple(
  value: unknown,
  path: string,
  warnings: string[],
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in source)) continue;
    if (key === 'enabled') put(out, key, readBoolean(source[key], `${path}.${key}`, warnings));
    else if (key === 'color')
      put(out, key, readString(source[key], `${path}.${key}`, warnings, 80));
    else put(out, key, readNumber(source[key], `${path}.${key}`, warnings));
  }
  noteUnknown(source, keys, path, warnings);
  return finish(out);
}

function sanitizeCity(value: unknown): City | undefined {
  if (!isPlainObject(value)) return undefined;
  const lat = typeof value.lat === 'number' ? value.lat : Number.NaN;
  const lng = typeof value.lng === 'number' ? value.lng : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const code = typeof value.code === 'string' && value.code.trim() ? value.code.trim() : 'CUSTOM';
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : code;
  const country = typeof value.country === 'string' ? value.country : '';
  return { code, name, country, lat, lng };
}

function sanitizeCities(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'periodMs', readNumber(source.periodMs, `${path}.periodMs`, warnings));
  put(out, 'radius', readNumber(source.radius, `${path}.radius`, warnings));
  if ('dot' in source) {
    put(
      out,
      'dot',
      sanitizeDotOrRipple(source.dot, `${path}.dot`, warnings, ['enabled', 'size', 'color', 'dim']),
    );
  }
  if ('ripple' in source) {
    put(
      out,
      'ripple',
      sanitizeDotOrRipple(source.ripple, `${path}.ripple`, warnings, [
        'enabled',
        'color',
        'size',
        'width',
        'grow',
        'opacity',
        'periodMs',
      ]),
    );
  }
  if ('list' in source) {
    if (!Array.isArray(source.list)) {
      warn(warnings, `${path}.list must be an array of cities`);
    } else {
      const list: City[] = [];
      source.list.forEach((entry, index) => {
        const city = sanitizeCity(entry);
        if (city) list.push(city);
        else
          warn(
            warnings,
            `${path}.list[${index}] is not a city ({ code, name, country, lat, lng })`,
          );
      });
      out.list = list;
    }
  }
  noteUnknown(
    source,
    ['enabled', 'color', 'periodMs', 'radius', 'dot', 'ripple', 'list'],
    path,
    warnings,
  );
  return finish(out);
}

function readColorOrFalse(
  value: unknown,
  path: string,
  warnings: string[],
): string | false | undefined {
  if (value === false) return false;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    warn(warnings, `${path} must be a colour or false`);
    return undefined;
  }
  return readString(value, path, warnings, 80);
}

function sanitizeLabels(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  if ('background' in source) {
    put(out, 'background', readColorOrFalse(source.background, `${path}.background`, warnings));
  }
  put(out, 'fontFamily', readString(source.fontFamily, `${path}.fontFamily`, warnings, 300));
  put(out, 'fontSize', readNumber(source.fontSize, `${path}.fontSize`, warnings));
  if (typeof source.fontWeight === 'number' && Number.isFinite(source.fontWeight)) {
    out.fontWeight = source.fontWeight;
  } else if (typeof source.fontWeight === 'string' && source.fontWeight.trim()) {
    out.fontWeight = source.fontWeight.trim();
  } else if (source.fontWeight !== undefined) {
    warn(warnings, `${path}.fontWeight must be a number or a string`);
  }
  if (typeof source.letterSpacing === 'number' && Number.isFinite(source.letterSpacing)) {
    out.letterSpacing = `${source.letterSpacing}px`;
    warn(warnings, `${path}.letterSpacing was a number; stored as "${String(out.letterSpacing)}"`);
  } else {
    put(
      out,
      'letterSpacing',
      readString(source.letterSpacing, `${path}.letterSpacing`, warnings, 40),
    );
  }
  if ('halo' in source) put(out, 'halo', readColorOrFalse(source.halo, `${path}.halo`, warnings));
  put(out, 'haloWidth', readNumber(source.haloWidth, `${path}.haloWidth`, warnings));
  noteUnknown(
    source,
    [
      'color',
      'background',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'halo',
      'haloWidth',
    ],
    path,
    warnings,
  );
  return finish(out);
}

const AIRPORT_KEYS = ['color', 'size', 'ringColor', 'ring'] as const;

function sanitizeAirportEndpoint(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'size', readNumber(source.size, `${path}.size`, warnings));
  put(out, 'ringColor', readString(source.ringColor, `${path}.ringColor`, warnings, 80));
  put(out, 'ring', readBoolean(source.ring, `${path}.ring`, warnings));
  noteUnknown(source, AIRPORT_KEYS, path, warnings);
  return finish(out);
}

function sanitizeAirports(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'size', readNumber(source.size, `${path}.size`, warnings));
  put(out, 'ringColor', readString(source.ringColor, `${path}.ringColor`, warnings, 80));
  put(out, 'ring', readBoolean(source.ring, `${path}.ring`, warnings));
  if ('source' in source)
    put(out, 'source', sanitizeAirportEndpoint(source.source, `${path}.source`, warnings));
  if ('destination' in source) {
    put(
      out,
      'destination',
      sanitizeAirportEndpoint(source.destination, `${path}.destination`, warnings),
    );
  }
  noteUnknown(source, [...AIRPORT_KEYS, 'source', 'destination'], path, warnings);
  return finish(out);
}

function sanitizeCamera(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'perspective', readNumber(source.perspective, `${path}.perspective`, warnings));
  put(out, 'tilt', readNumber(source.tilt, `${path}.tilt`, warnings));
  put(out, 'yaw', readNumber(source.yaw, `${path}.yaw`, warnings));
  put(out, 'depth', readNumber(source.depth, `${path}.depth`, warnings));
  put(out, 'interactive', readBoolean(source.interactive, `${path}.interactive`, warnings));
  put(out, 'follow', readBoolean(source.follow, `${path}.follow`, warnings));
  noteUnknown(
    source,
    ['enabled', 'perspective', 'tilt', 'yaw', 'depth', 'interactive', 'follow'],
    path,
    warnings,
  );
  return finish(out);
}

function sanitizeBorders(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'opacity', readNumber(source.opacity, `${path}.opacity`, warnings));
  put(out, 'width', readNumber(source.width, `${path}.width`, warnings));
  noteUnknown(source, ['enabled', 'color', 'opacity', 'width'], path, warnings);
  return finish(out);
}

function sanitizeHexTiles(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'spacingDeg', readNumber(source.spacingDeg, `${path}.spacingDeg`, warnings));
  put(out, 'sizeDeg', readNumber(source.sizeDeg, `${path}.sizeDeg`, warnings));
  put(out, 'insetDeg', readNumber(source.insetDeg, `${path}.insetDeg`, warnings));
  put(out, 'color', readString(source.color, `${path}.color`, warnings, 80));
  put(out, 'opacity', readNumber(source.opacity, `${path}.opacity`, warnings));
  noteUnknown(
    source,
    ['enabled', 'spacingDeg', 'sizeDeg', 'insetDeg', 'color', 'opacity'],
    path,
    warnings,
  );
  return finish(out);
}

function sanitizeView(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'lat', readNumber(source.lat, `${path}.lat`, warnings));
  put(out, 'lng', readNumber(source.lng, `${path}.lng`, warnings));
  put(out, 'altitude', readNumber(source.altitude, `${path}.altitude`, warnings));
  noteUnknown(source, ['lat', 'lng', 'altitude'], path, warnings);
  return finish(out);
}

function sanitizeAutoRotate(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'enabled', readBoolean(source.enabled, `${path}.enabled`, warnings));
  put(out, 'speed', readNumber(source.speed, `${path}.speed`, warnings));
  noteUnknown(source, ['enabled', 'speed'], path, warnings);
  return finish(out);
}

function sanitizeTexture(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of ['stepDeg', 'resDeg', 'dotSizeDeg', 'width'] as const) {
    if (key in source) put(out, key, readNumber(source[key], `${path}.${key}`, warnings));
  }
  noteUnknown(source, ['stepDeg', 'resDeg', 'dotSizeDeg', 'width'], path, warnings);
  return finish(out);
}

function sanitizeFlat(
  value: unknown,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const source = readObject(value, path, warnings);
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  put(out, 'theme', readEnum(source.theme, ['light', 'dark'] as const, `${path}.theme`, warnings));
  put(
    out,
    'surface',
    readEnum(source.surface, ['countries', 'dots'] as const, `${path}.surface`, warnings),
  );
  put(out, 'stepDeg', readNumber(source.stepDeg, `${path}.stepDeg`, warnings));
  put(out, 'width', readNumber(source.width, `${path}.width`, warnings));
  put(out, 'flightMs', readNumber(source.flightMs, `${path}.flightMs`, warnings));
  put(out, 'pauseMs', readNumber(source.pauseMs, `${path}.pauseMs`, warnings));
  if ('colors' in source)
    put(out, 'colors', sanitizeColors(source.colors, `${path}.colors`, warnings));
  if ('route' in source) put(out, 'route', sanitizeRoute(source.route, `${path}.route`, warnings));
  if ('labels' in source)
    put(out, 'labels', sanitizeLabels(source.labels, `${path}.labels`, warnings));
  if ('airports' in source)
    put(out, 'airports', sanitizeAirports(source.airports, `${path}.airports`, warnings));
  if ('cities' in source)
    put(out, 'cities', sanitizeCities(source.cities, `${path}.cities`, warnings));
  if ('plane' in source) put(out, 'plane', sanitizePlane(source.plane, `${path}.plane`, warnings));
  if ('camera3d' in source)
    put(out, 'camera3d', sanitizeCamera(source.camera3d, `${path}.camera3d`, warnings));
  if ('borders' in source)
    put(out, 'borders', sanitizeBorders(source.borders, `${path}.borders`, warnings));
  if ('hexTiles' in source)
    put(out, 'hexTiles', sanitizeHexTiles(source.hexTiles, `${path}.hexTiles`, warnings));
  if ('land' in source)
    warn(warnings, `${path}.land is not portable (the bundled land mask is used)`);
  noteUnknown(
    source,
    [
      'theme',
      'surface',
      'stepDeg',
      'width',
      'flightMs',
      'pauseMs',
      'colors',
      'route',
      'labels',
      'airports',
      'cities',
      'plane',
      'camera3d',
      'borders',
      'hexTiles',
      'land',
    ],
    path,
    warnings,
  );
  return finish(out);
}

/**
 * Keeps the JSON-safe subset of a {@link RouteDotsOptions} object.
 * Unknown keys, functions and the land mask are dropped with a warning.
 */
export function sanitizeRouteDotsOptions(
  value: unknown,
  warnings: string[] = [],
  path = 'options',
): RouteDotsOptions {
  const source = readObject(value, path, warnings);
  if (!source) return {};
  const out: Record<string, unknown> = {};
  if ('theme' in source) {
    put(
      out,
      'theme',
      readEnum(source.theme, ['light', 'dark'] as const, `${path}.theme`, warnings),
    );
  }
  if ('world' in source) {
    put(
      out,
      'world',
      readEnum(source.world, ['auto', 'globe', 'flat'] as const, `${path}.world`, warnings),
    );
  }
  if ('surface' in source) {
    put(
      out,
      'surface',
      readEnum(source.surface, ['countries', 'dots'] as const, `${path}.surface`, warnings),
    );
  }
  if ('colors' in source)
    put(out, 'colors', sanitizeColors(source.colors, `${path}.colors`, warnings));
  if ('view' in source) put(out, 'view', sanitizeView(source.view, `${path}.view`, warnings));
  if ('autoRotate' in source) {
    put(out, 'autoRotate', sanitizeAutoRotate(source.autoRotate, `${path}.autoRotate`, warnings));
  }
  if ('interactive' in source) {
    put(out, 'interactive', readBoolean(source.interactive, `${path}.interactive`, warnings));
  }
  if ('texture' in source)
    put(out, 'texture', sanitizeTexture(source.texture, `${path}.texture`, warnings));
  if ('borders' in source)
    put(out, 'borders', sanitizeBorders(source.borders, `${path}.borders`, warnings));
  if ('hexTiles' in source)
    put(out, 'hexTiles', sanitizeHexTiles(source.hexTiles, `${path}.hexTiles`, warnings));
  if ('route' in source) put(out, 'route', sanitizeRoute(source.route, `${path}.route`, warnings));
  if ('plane' in source) put(out, 'plane', sanitizePlane(source.plane, `${path}.plane`, warnings));
  if ('cities' in source)
    put(out, 'cities', sanitizeCities(source.cities, `${path}.cities`, warnings));
  if ('labels' in source)
    put(out, 'labels', sanitizeLabels(source.labels, `${path}.labels`, warnings));
  if ('airports' in source)
    put(out, 'airports', sanitizeAirports(source.airports, `${path}.airports`, warnings));
  if ('camera3d' in source)
    put(out, 'camera3d', sanitizeCamera(source.camera3d, `${path}.camera3d`, warnings));
  if ('frameRoute' in source) {
    put(out, 'frameRoute', readBoolean(source.frameRoute, `${path}.frameRoute`, warnings));
  }
  if ('fallback' in source) {
    const fallback = readObject(source.fallback, `${path}.fallback`, warnings);
    if (fallback) {
      const box: Record<string, unknown> = {};
      put(box, 'enabled', readBoolean(fallback.enabled, `${path}.fallback.enabled`, warnings));
      noteUnknown(fallback, ['enabled'], `${path}.fallback`, warnings);
      put(out, 'fallback', finish(box));
    }
  }
  if ('flat' in source) put(out, 'flat', sanitizeFlat(source.flat, `${path}.flat`, warnings));
  if ('land' in source)
    warn(warnings, `${path}.land is not portable (the bundled land mask is used)`);
  for (const key of Object.keys(source)) {
    if (key === 'land' || isOptionKey(key)) continue;
    warn(warnings, `${path}.${key} is not a RouteDots option`);
  }
  // Stable key order, so two exports of the same scene diff cleanly.
  const ordered: Record<string, unknown> = {};
  for (const key of OPTION_KEYS) {
    if (out[key] !== undefined) ordered[key] = out[key];
  }
  return ordered as RouteDotsOptions;
}

function isEndpointRoute(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && ('from' in value || 'to' in value);
}

function sanitizeEndpoint(
  value: unknown,
  path: string,
  warnings: string[],
): RouteDotsConfigEndpoint | undefined {
  if (value === undefined) {
    warn(warnings, `${path} is required`);
    return undefined;
  }
  if (typeof value === 'string') {
    const code = value.trim();
    if (!code || code.length > 12) {
      warn(warnings, `${path} must be an IATA code or a { lat, lng } point`);
      return undefined;
    }
    return code.toUpperCase();
  }
  if (!isPlainObject(value)) {
    if (value !== undefined) warn(warnings, `${path} must be an IATA code or a { lat, lng } point`);
    return undefined;
  }
  const lat = readNumber(value.lat, `${path}.lat`, warnings);
  const lng = readNumber(value.lng, `${path}.lng`, warnings);
  if (lat === undefined || lng === undefined) {
    warn(warnings, `${path} needs numeric lat and lng`);
    return undefined;
  }
  const endpoint: Exclude<RouteDotsConfigEndpoint, string> = { lat, lng };
  const code = readString(value.code, `${path}.code`, warnings, 12);
  const name = readString(value.name, `${path}.name`, warnings, 80);
  if (code) endpoint.code = code;
  if (name) endpoint.name = name;
  if (typeof value.country === 'string') endpoint.country = value.country.slice(0, 80);
  return endpoint;
}

function sanitizeRouteSelection(
  value: unknown,
  warnings: string[],
): RouteDotsConfigRoute | undefined {
  const source = readObject(value, 'route', warnings);
  if (!source) return undefined;
  const from = sanitizeEndpoint(source.from, 'route.from', warnings);
  const to = sanitizeEndpoint(source.to, 'route.to', warnings);
  if (!from || !to) return undefined;
  const roundTrip =
    source.roundTrip === undefined
      ? false
      : readBoolean(source.roundTrip, 'route.roundTrip', warnings);
  if (source.roundTrip !== undefined && roundTrip === undefined) return undefined;
  noteUnknown(source, ['from', 'to', 'roundTrip'], 'route', warnings);
  return { from, to, roundTrip: roundTrip ?? false };
}

function classify(value: Record<string, unknown>): RouteDotsConfigKind {
  if ('version' in value || 'options' in value) return 'document';
  if (isEndpointRoute(value.route)) return 'document';
  return 'options';
}

function readVersion(value: Record<string, unknown>): void {
  if (!('version' in value)) return;
  if (value.version !== ROUTEDOTS_CONFIG_VERSION) {
    throw new RouteDotsConfigError(
      `RouteDots config version ${String(value.version)} is not supported (expected ${ROUTEDOTS_CONFIG_VERSION})`,
    );
  }
}

function documentOptionSource(value: Record<string, unknown>, warnings: string[]): unknown {
  if ('options' in value) {
    for (const key of Object.keys(value)) {
      if (!DOCUMENT_KEYS.has(key)) {
        warn(warnings, `ignored top-level "${key}" (put it inside options)`);
      }
    }
    return value.options ?? {};
  }
  const rest: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'version' || key === 'name' || key === 'route') continue;
    if (isOptionKey(key)) rest[key] = entry;
    else warn(warnings, `ignored unknown key "${key}"`);
  }
  return rest;
}

function parseObject(value: Record<string, unknown>): ParsedRouteDotsConfig {
  const warnings: string[] = [];
  const kind = classify(value);
  if (kind === 'options') {
    return {
      version: ROUTEDOTS_CONFIG_VERSION,
      kind,
      route: null,
      routeSpecified: false,
      options: sanitizeRouteDotsOptions(value, warnings),
      warnings,
    };
  }
  readVersion(value);
  if (!('version' in value)) warn(warnings, 'config version missing; assumed 1');
  const name = readString(value.name, 'name', warnings, 80);
  let routeSpecified = 'route' in value;
  let route: RouteDotsConfigRoute | null = null;
  if (routeSpecified && value.route !== null) {
    const parsedRoute = sanitizeRouteSelection(value.route, warnings);
    if (parsedRoute) route = parsedRoute;
    else {
      // A broken route must not clear the one already on screen.
      routeSpecified = false;
      warn(warnings, 'route was ignored (needs from and to)');
    }
  }
  return {
    version: ROUTEDOTS_CONFIG_VERSION,
    kind,
    ...(name ? { name } : {}),
    route,
    routeSpecified,
    options: sanitizeRouteDotsOptions(documentOptionSource(value, warnings), warnings),
    warnings,
  };
}

/**
 * Parses a config document, a bare options object, or the JSON text of either.
 *
 * Invalid JSON, a non-object payload and an unsupported `version` throw
 * {@link RouteDotsConfigError}. Unknown keys are dropped and listed on
 * `warnings` so a newer file still loads in this version.
 */
export function parseRouteDotsConfig(input: string | unknown): ParsedRouteDotsConfig {
  const value = typeof input === 'string' ? parseJson(input) : input;
  if (!isPlainObject(value)) {
    throw new RouteDotsConfigError('RouteDots config must be a JSON object');
  }
  return parseObject(value);
}

function parseJson(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new RouteDotsConfigError('RouteDots config is empty');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'invalid JSON';
    throw new RouteDotsConfigError(`Invalid RouteDots config JSON (${detail})`);
  }
}

/** Pretty-prints a config document (trailing newline, stable key order). */
export function stringifyRouteDotsConfig(config: RouteDotsConfig, space = 2): string {
  return `${JSON.stringify(config, null, space)}\n`;
}

function endpointFromCity(city: City): RouteDotsConfigEndpoint {
  const known = CITIES.find((entry) => entry.code.toUpperCase() === city.code.toUpperCase());
  if (known && Math.abs(known.lat - city.lat) < 0.05 && Math.abs(known.lng - city.lng) < 0.05) {
    return known.code;
  }
  return {
    code: city.code,
    name: city.name,
    country: city.country,
    lat: city.lat,
    lng: city.lng,
  };
}

/**
 * Builds a config document from a live option set and the current route.
 * Non-portable values are omitted; see `warnings`.
 */
export function createRouteDotsConfig(
  options: RouteDotsOptions,
  route: RouteDotsRouteInfo | null,
  meta?: { name?: string },
): { config: RouteDotsConfig; warnings: string[] } {
  const warnings: string[] = [];
  const name = meta?.name?.trim();
  const config: RouteDotsConfig = {
    version: ROUTEDOTS_CONFIG_VERSION,
    ...(name ? { name } : {}),
    route: route
      ? {
          from: endpointFromCity(route.from),
          to: endpointFromCity(route.to),
          roundTrip: route.roundTrip,
        }
      : null,
    options: sanitizeRouteDotsOptions(options, warnings),
  };
  return { config, warnings };
}
