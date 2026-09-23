/**
 * City-name label text style — one description for both worlds.
 *
 * The globe draws city names as pin badges (`routes/EndpointLabels.ts`), the
 * flat world as haloed SVG text (`flat/FlatRouteMap.ts`). This module turns a
 * developer's `labels` option into the concrete numbers both consume, so a
 * style configured once looks the same on the sphere and on the flat map.
 *
 * Pure data + pure functions: no DOM, no three.js — unit-tested.
 */
import type { RouteDotsPalette } from '../theme.js';

/** Text style of the city-name labels (route endpoints / pins). */
export interface CityLabelTextStyle {
  /** Text colour (default: the palette's `label`). */
  color?: string;
  /**
   * Badge background. `false` removes the pill and its shadow, leaving the
   * bare text (default: the palette's `labelBackground`).
   */
  background?: string | false;
  /** CSS `font-family` list. */
  fontFamily?: string;
  /**
   * Font size in px, measured like the globe pin's CSS px (the flat map
   * multiplies it by {@link FLAT_LABEL_SCALE} into its 2× map space).
   */
  fontSize?: number;
  /** CSS `font-weight` (default 600). */
  fontWeight?: number | string;
  /** CSS `letter-spacing`, e.g. `'0.08em'` or `'1px'`. */
  letterSpacing?: string;
  /**
   * Flat-map halo drawn behind the glyphs (keeps text readable over land);
   * `false` disables it (default: the palette's `ocean` — the map backdrop).
   */
  halo?: string | false;
  /** Flat-map halo stroke width in px (default 6, in map px). */
  haloWidth?: number;
}

/** A label text style with every value resolved, ready for the DOM / SVG. */
export interface ResolvedCityLabelStyle {
  color: string;
  /** `null` = no badge pill, bare text. */
  background: string | null;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing: string;
  /** `null` = no halo. */
  halo: string | null;
  haloWidth: number;
}

/** Default label font size, in the globe pin's CSS px. */
export const DEFAULT_LABEL_FONT_SIZE = 12;

/** The flat map renders in its own 2× pixel space; labels scale with it. */
export const FLAT_LABEL_SCALE = 2;

/** Default `font-family`, shared by both worlds. */
export const DEFAULT_LABEL_FONT_FAMILY =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const DEFAULT_LETTER_SPACING = '0.01em';
const DEFAULT_FONT_WEIGHT = '600';
const DEFAULT_HALO_WIDTH = 6;

const MIN_FONT_PX = 6;
const MAX_FONT_PX = 64;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Resolves the `labels` option against a palette.
 *
 * Every key is optional; anything left out keeps the default (or the
 * palette colour the label would have used anyway).
 */
export function resolveCityLabelStyle(
  palette: Pick<RouteDotsPalette, 'label' | 'labelBackground' | 'ocean'>,
  style?: CityLabelTextStyle,
): ResolvedCityLabelStyle {
  const o = style ?? {};
  const fallbackBackground = palette.labelBackground;
  return {
    color: typeof o.color === 'string' && o.color ? o.color : palette.label,
    background:
      o.background === false
        ? null
        : typeof o.background === 'string' && o.background
          ? o.background
          : fallbackBackground,
    fontFamily:
      typeof o.fontFamily === 'string' && o.fontFamily ? o.fontFamily : DEFAULT_LABEL_FONT_FAMILY,
    fontSize: clamp(
      Number.isFinite(o.fontSize) ? (o.fontSize as number) : DEFAULT_LABEL_FONT_SIZE,
      MIN_FONT_PX,
      MAX_FONT_PX,
    ),
    fontWeight: o.fontWeight === undefined ? DEFAULT_FONT_WEIGHT : String(o.fontWeight),
    letterSpacing:
      typeof o.letterSpacing === 'string' && o.letterSpacing
        ? o.letterSpacing
        : DEFAULT_LETTER_SPACING,
    halo: o.halo === false ? null : typeof o.halo === 'string' && o.halo ? o.halo : palette.ocean,
    haloWidth:
      Number.isFinite(o.haloWidth) && (o.haloWidth as number) > 0
        ? (o.haloWidth as number)
        : DEFAULT_HALO_WIDTH,
  };
}

/**
 * CSS custom properties for the globe's pin badge layer (EndpointLabels).
 *
 * Only the keys that differ from the stylesheet defaults are emitted, so a
 * theme switch keeps working for everything the style leaves alone.
 */
export function pinLabelCssVars(style: ResolvedCityLabelStyle): Record<string, string> {
  const vars: Record<string, string> = {
    '--rd-pin-fg': style.color,
    '--rd-pin-font': style.fontFamily,
    '--rd-pin-size': `${style.fontSize}px`,
    '--rd-pin-weight': style.fontWeight,
    '--rd-pin-spacing': style.letterSpacing,
  };
  if (style.background !== null) {
    vars['--rd-pin-bg'] = style.background;
    // The dot's halo ring follows the pill colour.
    vars['--rd-pin-ring'] = style.background;
  }
  return vars;
}

/**
 * Attributes for the flat map's SVG `<text>` label.
 *
 * The halo is drawn as a thick stroke under the fill (`paint-order: stroke`),
 * exactly as before — `halo: false` switches it off.
 */
export function svgLabelAttrs(style: ResolvedCityLabelStyle): {
  'font-family': string;
  'font-size': string;
  'font-weight': string;
  'letter-spacing': string;
  fill: string;
  stroke: string;
  'stroke-width': string;
  'paint-order': string;
} {
  return {
    'font-family': style.fontFamily,
    'font-size': String(style.fontSize * FLAT_LABEL_SCALE),
    'font-weight': style.fontWeight,
    'letter-spacing': style.letterSpacing,
    fill: style.color,
    stroke: style.halo ?? 'none',
    'stroke-width': style.halo === null ? '0' : String(style.haloWidth),
    'paint-order': 'stroke',
  };
}
