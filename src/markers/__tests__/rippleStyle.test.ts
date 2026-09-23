import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CITY_DOT_RADIUS,
  DEFAULT_CITY_RING_RADII,
  DEFAULT_CITY_RING_WIDTH,
  FLAT_CITY_MARKER_PX,
  flatCityMarkerCssVars,
  flatCityMarkerSizes,
  resolveCityMarkers,
  rippleStateAt,
} from '../rippleStyle.js';
import {
  DEFAULT_BLINK_PERIOD_MS,
  DEFAULT_DOT_DIM,
  DEFAULT_RING_GROW,
  DEFAULT_RING_OPACITY,
} from '../blinkPattern.js';

describe('resolveCityMarkers — defaults', () => {
  const style = resolveCityMarkers();

  it('keeps the shipped dot + ripple look', () => {
    expect(style.dot.enabled).toBe(true);
    expect(style.dot.size).toBe(DEFAULT_CITY_DOT_RADIUS);
    expect(style.dot.dim).toBe(DEFAULT_DOT_DIM);
    expect(style.ripple.enabled).toBe(true);
    expect(style.ripple.size).toBe(DEFAULT_CITY_RING_RADII[1]);
    expect(style.ripple.width).toBe(DEFAULT_CITY_RING_WIDTH);
    expect(style.ripple.inner).toBeCloseTo(DEFAULT_CITY_RING_RADII[0], 12);
    expect(style.ripple.grow).toBe(DEFAULT_RING_GROW);
    expect(style.ripple.opacity).toBe(DEFAULT_RING_OPACITY);
    expect(style.ripple.periodMs).toBe(DEFAULT_BLINK_PERIOD_MS);
    expect(style.color).toBe('#39414e');
  });

  it('lets the parts carry their own colours', () => {
    const custom = resolveCityMarkers({
      color: '#111111',
      dot: { color: '#222222' },
      ripple: { color: '#333333' },
    });
    expect(custom.dot.color).toBe('#222222');
    expect(custom.ripple.color).toBe('#333333');
    expect(custom.color).toBe('#111111');
  });
});

describe('resolveCityMarkers — customisation and safety', () => {
  it('honours the ripple tuning knobs', () => {
    const style = resolveCityMarkers({
      ripple: { enabled: true, size: 0.03, width: 0.005, grow: 5, opacity: 0.9, periodMs: 900 },
      dot: { size: 0.012, dim: 0.2 },
    });
    expect(style.ripple.size).toBe(0.03);
    expect(style.ripple.width).toBe(0.005);
    expect(style.ripple.inner).toBeCloseTo(0.025, 12);
    expect(style.ripple.grow).toBe(5);
    expect(style.ripple.opacity).toBe(0.9);
    expect(style.ripple.periodMs).toBe(900);
    expect(style.dot.size).toBe(0.012);
    expect(style.dot.dim).toBe(0.2);
  });

  it('takes the period from `periodMs` unless the ripple overrides it', () => {
    expect(resolveCityMarkers({ periodMs: 4000 }).ripple.periodMs).toBe(4000);
    expect(resolveCityMarkers({ periodMs: 4000, ripple: { periodMs: 800 } }).ripple.periodMs).toBe(
      800,
    );
  });

  it('can turn the dot or the ripple off independently', () => {
    const noDot = resolveCityMarkers({ dot: { enabled: false } });
    expect(noDot.dot.enabled).toBe(false);
    expect(noDot.ripple.enabled).toBe(true);
    const noRipple = resolveCityMarkers({ ripple: { enabled: false } });
    expect(noRipple.ripple.enabled).toBe(false);
    expect(noRipple.dot.enabled).toBe(true);
  });

  it('keeps the ring inside and wider than nothing, whatever the input', () => {
    const style = resolveCityMarkers({ ripple: { size: 0.01, width: 0.5 } });
    expect(style.ripple.width).toBeLessThan(style.ripple.size);
    expect(style.ripple.inner).toBeGreaterThan(0);
    const tiny = resolveCityMarkers({ ripple: { size: 0, width: 0 }, dot: { size: -1 } });
    expect(tiny.ripple.size).toBeGreaterThan(0);
    expect(tiny.ripple.width).toBeGreaterThan(0);
    expect(tiny.dot.size).toBeGreaterThan(0);
  });

  it('clamps NaN and absurd periods', () => {
    const style = resolveCityMarkers({ periodMs: Number.NaN, dot: { size: Number.NaN } });
    expect(style.ripple.periodMs).toBe(DEFAULT_BLINK_PERIOD_MS);
    expect(style.dot.size).toBe(DEFAULT_CITY_DOT_RADIUS);
    expect(resolveCityMarkers({ periodMs: 0 }).ripple.periodMs).toBe(120);
    expect(resolveCityMarkers({ periodMs: 10_000_000 }).ripple.periodMs).toBe(60_000);
  });
});

describe('flatCityMarkerSizes', () => {
  it('reproduces the shipped px sizes at the defaults', () => {
    const sizes = flatCityMarkerSizes(resolveCityMarkers());
    expect(sizes.dotRadius).toBeCloseTo(FLAT_CITY_MARKER_PX.dot, 9);
    expect(sizes.ringRadius).toBeCloseTo(FLAT_CITY_MARKER_PX.ring, 9);
    expect(sizes.ringWidth).toBeCloseTo(FLAT_CITY_MARKER_PX.width, 9);
  });

  it('scales with the globe radii', () => {
    const sizes = flatCityMarkerSizes(
      resolveCityMarkers({ dot: { size: DEFAULT_CITY_DOT_RADIUS * 2 }, ripple: { size: 0.022 } }),
    );
    expect(sizes.dotRadius).toBeCloseTo(FLAT_CITY_MARKER_PX.dot * 2, 9);
    expect(sizes.ringRadius).toBeCloseTo(FLAT_CITY_MARKER_PX.ring * 2, 9);
  });
});

describe('flatCityMarkerCssVars / rippleStateAt', () => {
  it('exposes the period, dim, grow end and peak opacity', () => {
    const vars = flatCityMarkerCssVars(
      resolveCityMarkers({ periodMs: 1200, ripple: { grow: 3, opacity: 0.4 }, dot: { dim: 0.3 } }),
    );
    expect(vars['--rd-city-period']).toBe('1200ms');
    expect(Number(vars['--rd-city-ring-grow'])).toBeCloseTo(4, 3);
    expect(Number(vars['--rd-city-ring-opacity'])).toBeCloseTo(0.4, 3);
    expect(Number(vars['--rd-city-dot-dim'])).toBeCloseTo(0.3, 3);
  });

  it('matches the blink pattern curve', () => {
    const style = resolveCityMarkers({ ripple: { grow: 2, opacity: 0.6 } });
    expect(rippleStateAt(style, 0)).toEqual({ scale: 1, opacity: 0.6 });
    expect(rippleStateAt(style, 0.5).scale).toBeCloseTo(2, 9);
    expect(rippleStateAt(style, 0.5).opacity).toBeCloseTo(0.3, 9);
  });
});
