import { describe, expect, it } from 'vitest';
import {
  PALETTES,
  PALETTE_KEYS,
  paletteToFlatTheme,
  paletteToGlobeTheme,
  paletteToRouteTheme,
  resolvePalette,
} from '../theme.js';

describe('resolvePalette', () => {
  it('returns the theme palette untouched without overrides', () => {
    expect(resolvePalette('light')).toEqual(PALETTES.light);
    expect(resolvePalette()).toEqual(PALETTES.light);
    expect(resolvePalette('dark')).toEqual(PALETTES.dark);
  });

  it('merges partial overrides on top of the theme', () => {
    const palette = resolvePalette('light', { outbound: '#ff0000', plane: '#00ff00' });
    expect(palette.outbound).toBe('#ff0000');
    expect(palette.plane).toBe('#00ff00');
    expect(palette.return).toBe(PALETTES.light.return);
  });

  it('ignores undefined / empty values instead of erasing defaults', () => {
    const palette = resolvePalette('dark', { outbound: undefined, plane: '' });
    expect(palette.outbound).toBe(PALETTES.dark.outbound);
    expect(palette.plane).toBe(PALETTES.dark.plane);
  });

  it('honours the legacy aliases, with modern keys winning', () => {
    expect(resolvePalette('light', { globe: '#111111' }).ocean).toBe('#111111');
    expect(resolvePalette('light', { background: '#222222' }).ocean).toBe('#222222');
    expect(resolvePalette('light', { land: '#333333' }).countries).toBe('#333333');
    expect(resolvePalette('light', { globe: '#111111', ocean: '#999999' }).ocean).toBe('#999999');
  });
});

describe('palette → renderer themes', () => {
  it('maps the globe colours (ocean → globe)', () => {
    const theme = paletteToGlobeTheme(PALETTES.dark);
    expect(theme.globe).toBe(PALETTES.dark.ocean);
    expect(theme.countries).toBe(PALETTES.dark.countries);
    expect(theme.dots).toBe(PALETTES.dark.dots);
    expect(theme.borders).toBe(PALETTES.dark.borders);
    expect(theme.cities).toBe(PALETTES.dark.cities);
    expect(theme.atmosphere).toBe(PALETTES.dark.atmosphere);
  });

  it('maps the route colours with their opacities', () => {
    const theme = paletteToRouteTheme(PALETTES.light);
    expect(theme.outbound).toEqual({ color: PALETTES.light.outbound, opacity: 0.95 });
    expect(theme.return).toEqual({ color: PALETTES.light.return, opacity: 0.8 });
    expect(theme.marker).toBe(PALETTES.light.marker);
    expect(theme.ring).toBe(PALETTES.light.ring);
  });

  it('maps the flat world colours (ocean → bg)', () => {
    const theme = paletteToFlatTheme(PALETTES.light);
    expect(theme.bg).toBe(PALETTES.light.ocean);
    expect(theme.land).toBe(PALETTES.light.countries);
    expect(theme.dot).toBe(PALETTES.light.dots);
    expect(theme.border).toBe(PALETTES.light.borders);
    expect(theme.city).toBe(PALETTES.light.cities);
    expect(theme.outbound).toBe(PALETTES.light.outbound);
    expect(theme.return).toBe(PALETTES.light.return);
    expect(theme.marker).toBe(PALETTES.light.marker);
    expect(theme.plane).toBe(PALETTES.light.plane);
    expect(theme.label).toBe(PALETTES.light.label);
  });

  it('covers every palette key in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const key of PALETTE_KEYS) {
        expect(PALETTES[theme][key], `${theme}.${key}`).toMatch(/^#[0-9a-f]{3,8}$/i);
      }
    }
    expect(Object.keys(PALETTES.light).sort()).toEqual([...PALETTE_KEYS].sort());
  });
});
