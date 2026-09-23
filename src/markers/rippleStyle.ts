/**
 * City-marker styling — the solid dot and the **ripple** ring that expands
 * out of every airport city.
 *
 * One resolution path feeds both worlds: the globe draws the markers as
 * GPU-instanced meshes (radii in globe radii) and the flat world draws them
 * as SVG circles (radii in px, derived from the same numbers so the default
 * look is identical and every deviation scales with it).
 *
 * Pure — no DOM, no three.js — and unit-tested.
 */
import { blinkRingState } from './blinkPattern.js';
import {
  DEFAULT_BLINK_PERIOD_MS,
  DEFAULT_DOT_DIM,
  DEFAULT_RING_GROW,
  DEFAULT_RING_OPACITY,
} from './blinkPattern.js';

/** Radius of the solid city dot, in globe radii (the default). */
export const DEFAULT_CITY_DOT_RADIUS = 0.006;
/** Inner / outer radius of the ripple ring, in globe radii (the defaults). */
export const DEFAULT_CITY_RING_RADII: [number, number] = [0.0085, 0.011];
/** Thickness of the ripple ring, in globe radii (the default). */
export const DEFAULT_CITY_RING_WIDTH = DEFAULT_CITY_RING_RADII[1] - DEFAULT_CITY_RING_RADII[0];

/** Flat-world marker sizes in px at the default globe radii — kept exact. */
export const FLAT_CITY_MARKER_PX = { dot: 2.6, ring: 4, width: 1.2 } as const;

/** The solid, breathing dot under each ripple. */
export interface CityDotOptions {
  /** Draw the solid dot (default true). */
  enabled?: boolean;
  /** Dot radius in globe radii (default {@link DEFAULT_CITY_DOT_RADIUS}). */
  size?: number;
  /** Dot colour (defaults to the marker colour). */
  color?: string;
  /** Opacity floor of the breathing dot, 0..1 (default 0.45). */
  dim?: number;
}

/** The expanding ripple ring. */
export interface CityRippleOptions {
  /** Draw the ripple rings (default true). */
  enabled?: boolean;
  /** Ring colour (defaults to the marker colour). */
  color?: string;
  /** Outer ring radius in globe radii (default {@link DEFAULT_CITY_RING_RADII}). */
  size?: number;
  /** Ring thickness in globe radii (default {@link DEFAULT_CITY_RING_WIDTH}). */
  width?: number;
  /** How far the ring expands over one cycle, as a multiple of its radius (default 2.6). */
  grow?: number;
  /** Peak opacity the moment a ring spawns, 0..1 (default 0.55). */
  opacity?: number;
  /** Cycle period in ms (default 2600 — overrides `cities.periodMs`). */
  periodMs?: number;
}

/** Everything `cityMarkers` / `cities` accepts. */
export interface CityMarkersOptions {
  /** Draw the city markers at all (default true). */
  enabled?: boolean;
  /** Marker colour for the dot and the ripple (overridable per part). */
  color?: string;
  /** Default blink / ripple period in ms. */
  periodMs?: number;
  /** Shell radius in globe radii (default {@link LAYER_RADIUS.cities}). */
  radius?: number;
  /** The solid dot. */
  dot?: CityDotOptions;
  /** The ripple effect. */
  ripple?: CityRippleOptions;
}

/** Marker styling with every value resolved. */
export interface ResolvedCityMarkers {
  color: string;
  radius: number | null;
  dot: {
    enabled: boolean;
    /** Radius in globe radii. */
    size: number;
    color: string;
    dim: number;
  };
  ripple: {
    enabled: boolean;
    /** Outer radius in globe radii. */
    size: number;
    /** Thickness in globe radii. */
    width: number;
    /** Inner radius in globe radii (outer − thickness). */
    inner: number;
    color: string;
    grow: number;
    opacity: number;
    periodMs: number;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const num = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

/**
 * Resolves the developer's city-marker options.
 *
 * @param options any subset of {@link CityMarkersOptions}
 * @param fallbackColor colour to use when neither the options nor the theme
 *   set one
 */
export function resolveCityMarkers(
  options: CityMarkersOptions = {},
  fallbackColor = '#39414e',
): ResolvedCityMarkers {
  const color = options.color ?? fallbackColor;
  const periodMs = clamp(
    num(options.ripple?.periodMs, num(options.periodMs, DEFAULT_BLINK_PERIOD_MS)),
    120,
    60_000,
  );
  const rippleSize = clamp(num(options.ripple?.size, DEFAULT_CITY_RING_RADII[1]), 0.0005, 0.06);
  const rippleWidth = clamp(
    num(options.ripple?.width, DEFAULT_CITY_RING_WIDTH),
    0.0002,
    Math.max(0.0002, rippleSize * 0.95),
  );

  return {
    color,
    radius: Number.isFinite(options.radius) ? (options.radius as number) : null,
    dot: {
      enabled: options.dot?.enabled !== false,
      size: clamp(num(options.dot?.size, DEFAULT_CITY_DOT_RADIUS), 0.0005, 0.05),
      color: options.dot?.color ?? color,
      dim: clamp(num(options.dot?.dim, DEFAULT_DOT_DIM), 0, 1),
    },
    ripple: {
      enabled: options.ripple?.enabled !== false,
      size: rippleSize,
      width: rippleWidth,
      inner: Math.max(0.0001, rippleSize - rippleWidth),
      color: options.ripple?.color ?? color,
      grow: clamp(num(options.ripple?.grow, DEFAULT_RING_GROW), 0, 20),
      opacity: clamp(num(options.ripple?.opacity, DEFAULT_RING_OPACITY), 0, 1),
      periodMs,
    },
  };
}

/** Flat-world marker sizes in px, scaled from the globe radii. */
export function flatCityMarkerSizes(style: ResolvedCityMarkers): {
  dotRadius: number;
  ringRadius: number;
  ringWidth: number;
} {
  return {
    dotRadius: FLAT_CITY_MARKER_PX.dot * (style.dot.size / DEFAULT_CITY_DOT_RADIUS),
    ringRadius: FLAT_CITY_MARKER_PX.ring * (style.ripple.size / DEFAULT_CITY_RING_RADII[1]),
    ringWidth: FLAT_CITY_MARKER_PX.width * (style.ripple.width / DEFAULT_CITY_RING_WIDTH),
  };
}

/** CSS custom properties the flat world's ripple keyframes read. */
export function flatCityMarkerCssVars(style: ResolvedCityMarkers): Record<string, string> {
  // `DEFAULT_RING_GROW` already means "scale 1 → 1 + grow"; blinkRingState is
  // the single written-down definition of that curve.
  const end = blinkRingState(1, style.ripple.grow, style.ripple.opacity);
  return {
    '--rd-city-period': `${style.ripple.periodMs}ms`,
    '--rd-city-dot-dim': String(style.dot.dim),
    '--rd-city-ring-grow': end.scale.toFixed(3),
    '--rd-city-ring-opacity': style.ripple.opacity.toFixed(3),
  };
}

/** Ring scale + opacity at a cycle position, given a resolved style. */
export function rippleStateAt(
  style: ResolvedCityMarkers,
  progress: number,
): { scale: number; opacity: number } {
  return blinkRingState(progress, style.ripple.grow, style.ripple.opacity);
}
