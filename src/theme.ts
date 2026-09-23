/**
 * The RouteDots colour palette — every colour the library draws, in one place.
 *
 * A developer sets colours once (via the `colors` option or `rd.setColors()`)
 * and the whole visual — globe *and* flat world, arcs, plane, city ripple,
 * pins — follows. Each renderer keeps its own legacy theme table
 * (`GLOBE_THEMES`, `ROUTE_THEMES`, `FLAT_THEMES`), and all three are derived
 * from this palette, so the tables can never drift apart.
 *
 * Pure data + pure functions: no DOM, no three.js.
 */

/** Every colour of a RouteDots scene. */
export interface RouteDotsPalette {
  /** Ocean sphere (3D world) / page background (flat world). */
  ocean: string;
  /** Country fills (both worlds). */
  countries: string;
  /** Dot-lattice colour (the `dots` surface). */
  dots: string;
  /** Country border lines. */
  borders: string;
  /** Blinking airport-city markers: the solid dot and its ripple ring. */
  cities: string;
  /** Globe atmosphere halo (3D world only). */
  atmosphere: string;
  /** Outbound route arc. */
  outbound: string;
  /** Return route arc (round trips). */
  return: string;
  /** Route endpoint dots. */
  marker: string;
  /** Route endpoint pulse rings. */
  ring: string;
  /** Plane icon. */
  plane: string;
  /** Endpoint label text (globe pin badge / flat city name). */
  label: string;
  /** Endpoint label background (globe pin badge). */
  labelBackground: string;
}

/**
 * A partial palette, plus the legacy single-world key names that older
 * releases documented (`globe`, `land`, `background`) — kept working as
 * aliases so existing integrations don't break.
 */
export type RouteDotsColors = Partial<RouteDotsPalette> & {
  /** @deprecated Alias of {@link RouteDotsPalette.ocean}. */
  globe?: string;
  /** @deprecated Alias of {@link RouteDotsPalette.countries}. */
  land?: string;
  /** @deprecated Alias of {@link RouteDotsPalette.ocean} (flat background). */
  background?: string;
};

/** The two shipped palettes. */
export const PALETTES: Record<'light' | 'dark', RouteDotsPalette> = {
  light: {
    ocean: '#f2f5f9',
    countries: '#c3c9d4',
    dots: '#8b93a1',
    borders: '#ffffff',
    cities: '#39414e',
    atmosphere: '#93a7c4',
    outbound: '#4f5b6b',
    return: '#8a94a6',
    marker: '#23262e',
    ring: '#23262e',
    plane: '#14161a',
    label: '#141b26',
    labelBackground: '#ffffff',
  },
  dark: {
    ocean: '#0e131c',
    countries: '#2b3442',
    dots: '#5b6b82',
    borders: '#ffffff',
    cities: '#d7e0ee',
    atmosphere: '#3d5f8f',
    outbound: '#cfd8e6',
    return: '#7c8798',
    marker: '#e2e8f0',
    ring: '#e2e8f0',
    plane: '#e2e8f0',
    label: '#0b1220',
    labelBackground: '#edf2f9',
  },
};

/** Palette keys, in a stable order (handy for docs and the showcase). */
export const PALETTE_KEYS = [
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
] as const satisfies readonly (keyof RouteDotsPalette)[];

type Defined = Record<string, string>;

/** Drops `undefined` values so a spread partial never erases a default. */
function definedColors(colors: RouteDotsColors): Defined {
  const out: Defined = {};
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

/**
 * Resolves a theme name plus a partial palette into a full palette.
 *
 * Legacy aliases (`globe`, `land`, `background`) are honoured, but an explicit
 * modern key always wins over its alias.
 */
export function resolvePalette(
  theme: 'light' | 'dark' = 'light',
  colors?: RouteDotsColors,
): RouteDotsPalette {
  const base = PALETTES[theme];
  if (!colors) return { ...base };

  const overrides = definedColors(colors);
  const aliased: Record<string, string> = {};
  if (overrides.globe) aliased.ocean = overrides.globe;
  if (overrides.background) aliased.ocean = overrides.background;
  if (overrides.land) aliased.countries = overrides.land;

  delete overrides.globe;
  delete overrides.background;
  delete overrides.land;

  return { ...base, ...aliased, ...overrides } as RouteDotsPalette;
}

/** The subset of the palette the 3D globe renderer consumes. */
export interface GlobeTheme {
  globe: string;
  countries: string;
  dots: string;
  borders: string;
  cities: string;
  atmosphere: string;
}

/** Maps a palette onto the globe's colour names (`globe` = ocean). */
export function paletteToGlobeTheme(palette: RouteDotsPalette): GlobeTheme {
  return {
    globe: palette.ocean,
    countries: palette.countries,
    dots: palette.dots,
    borders: palette.borders,
    cities: palette.cities,
    atmosphere: palette.atmosphere,
  };
}

/** One route path's colours, as the route layer consumes them. */
export interface RouteThemePath {
  color: string;
  opacity: number;
}

/** Palette → route-layer colours (opacities are style defaults). */
export function paletteToRouteTheme(palette: RouteDotsPalette): {
  outbound: RouteThemePath;
  return: RouteThemePath;
  marker: string;
  ring: string;
} {
  return {
    outbound: { color: palette.outbound, opacity: 0.95 },
    return: { color: palette.return, opacity: 0.8 },
    marker: palette.marker,
    ring: palette.ring,
  };
}

/** The subset of the palette the flat world consumes. */
export interface FlatTheme {
  bg: string;
  land: string;
  dot: string;
  border: string;
  city: string;
  outbound: string;
  return: string;
  marker: string;
  plane: string;
  label: string;
}

/** Maps a palette onto the flat world's colour names (`bg` = ocean). */
export function paletteToFlatTheme(palette: RouteDotsPalette): FlatTheme {
  return {
    bg: palette.ocean,
    land: palette.countries,
    dot: palette.dots,
    border: palette.borders,
    city: palette.cities,
    outbound: palette.outbound,
    return: palette.return,
    marker: palette.marker,
    plane: palette.plane,
    label: palette.label,
  };
}
