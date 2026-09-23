import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../theme.js';
import {
  DEFAULT_LABEL_FONT_FAMILY,
  DEFAULT_LABEL_FONT_SIZE,
  FLAT_LABEL_SCALE,
  pinLabelCssVars,
  resolveCityLabelStyle,
  svgLabelAttrs,
} from '../textStyle.js';

const palette = PALETTES.light;

describe('resolveCityLabelStyle — defaults keep the historical look', () => {
  const style = resolveCityLabelStyle(palette);

  it('falls back to the palette colours', () => {
    expect(style.color).toBe(palette.label);
    expect(style.background).toBe(palette.labelBackground);
    // The flat halo keeps the map-backdrop look.
    expect(style.halo).toBe(palette.ocean);
  });

  it('uses the shared font stack at 12 px / 600', () => {
    expect(style.fontFamily).toBe(DEFAULT_LABEL_FONT_FAMILY);
    expect(style.fontSize).toBe(DEFAULT_LABEL_FONT_SIZE);
    expect(style.fontWeight).toBe('600');
    expect(style.letterSpacing).toBe('0.01em');
    expect(style.haloWidth).toBe(6);
  });

  it('resolves against the theme actually in use', () => {
    const dark = resolveCityLabelStyle(PALETTES.dark);
    expect(dark.color).toBe(PALETTES.dark.label);
    expect(dark.background).toBe(PALETTES.dark.labelBackground);
  });
});

describe('resolveCityLabelStyle — overrides', () => {
  it('applies every key that is given', () => {
    const style = resolveCityLabelStyle(palette, {
      color: '#ff0066',
      background: '#002244',
      fontFamily: "'Courier New', monospace",
      fontSize: 18,
      fontWeight: 300,
      letterSpacing: '0.08em',
      halo: '#fafafa',
      haloWidth: 4,
    });
    expect(style.color).toBe('#ff0066');
    expect(style.background).toBe('#002244');
    expect(style.fontFamily).toBe("'Courier New', monospace");
    expect(style.fontSize).toBe(18);
    expect(style.fontWeight).toBe('300'); // coerced to a CSS string
    expect(style.letterSpacing).toBe('0.08em');
    expect(style.halo).toBe('#fafafa');
    expect(style.haloWidth).toBe(4);
  });

  it('background: false removes the pill, halo: false removes the halo', () => {
    const style = resolveCityLabelStyle(palette, { background: false, halo: false });
    expect(style.background).toBeNull();
    expect(style.halo).toBeNull();
  });

  it('ignores junk values instead of throwing', () => {
    const style = resolveCityLabelStyle(palette, {
      fontSize: Number.NaN,
      fontWeight: undefined,
      haloWidth: -5,
    });
    expect(style.fontSize).toBe(DEFAULT_LABEL_FONT_SIZE);
    expect(style.fontWeight).toBe('600');
    expect(style.haloWidth).toBe(6);
  });
});

describe('pinLabelCssVars (globe badges)', () => {
  it('emits font + colour custom properties', () => {
    const vars = pinLabelCssVars(resolveCityLabelStyle(palette, { fontSize: 16 }));
    expect(vars['--rd-pin-fg']).toBe(palette.label);
    expect(vars['--rd-pin-bg']).toBe(palette.labelBackground);
    expect(vars['--rd-pin-size']).toBe('16px');
    expect(vars['--rd-pin-weight']).toBe('600');
    expect(vars['--rd-pin-spacing']).toBe('0.01em');
    expect(typeof vars['--rd-pin-font']).toBe('string');
  });

  it('omits the pill vars when background is false', () => {
    const vars = pinLabelCssVars(resolveCityLabelStyle(palette, { background: false }));
    expect(vars['--rd-pin-bg']).toBeUndefined();
    expect(vars['--rd-pin-ring']).toBeUndefined();
  });
});

describe('svgLabelAttrs (flat labels)', () => {
  it('scales the font size into the flat map space and keeps the halo', () => {
    const attrs = svgLabelAttrs(resolveCityLabelStyle(palette, { fontSize: 12, haloWidth: 4 }));
    expect(attrs['font-size']).toBe(String(12 * FLAT_LABEL_SCALE));
    expect(attrs.fill).toBe(palette.label);
    expect(attrs.stroke).toBe(palette.ocean);
    expect(attrs['stroke-width']).toBe('4');
    expect(attrs['paint-order']).toBe('stroke');
    expect(attrs['font-weight']).toBe('600');
  });

  it('switches the halo off with halo: false', () => {
    const attrs = svgLabelAttrs(resolveCityLabelStyle(palette, { halo: false }));
    expect(attrs.stroke).toBe('none');
    expect(attrs['stroke-width']).toBe('0');
  });
});
