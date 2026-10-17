import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../theme.js';
import { DEFAULT_ARC_ANGLE_DEG, MAX_ARC_ANGLE_DEG } from '../arcPath.js';
import { DEFAULT_ARC_RADIUS, DEFAULT_OUTBOUND_LIFT, DEFAULT_RETURN_LIFT } from '../RouteModel.js';
import {
  DEFAULT_OUTBOUND_DASH,
  DEFAULT_OUTBOUND_DASH_WORLD,
  DEFAULT_RETURN_DASH,
  DEFAULT_RETURN_DASH_WORLD,
  DEFAULT_STROKE_WIDTH,
  GLOBE_RADIUS_PX_AT_DEFAULT_VIEW,
  GLOBE_WIDTH_LEGACY_MAX,
  MAX_LINE_WIDTH_PX,
  REFERENCE_ARC_LENGTH,
  dashArrayPx,
  dashFlowPerSecond,
  dashUniforms,
  globeTubeRadius,
  resolveDashUnits,
  resolveRouteStyle,
} from '../routeStyle.js';

describe('resolveRouteStyle — defaults keep the historical look', () => {
  const style = resolveRouteStyle('light');

  it('uses the theme colours and the classic lifts', () => {
    expect(style.outbound.color).toBe(PALETTES.light.outbound);
    expect(style.return.color).toBe(PALETTES.light.return);
    expect(style.outbound.opacity).toBe(0.95);
    expect(style.return.opacity).toBe(0.8);
    expect(style.outbound.lift).toBe(DEFAULT_OUTBOUND_LIFT);
    expect(style.return.lift).toBe(DEFAULT_RETURN_LIFT);
    expect(style.outbound.angle).toBe(DEFAULT_ARC_ANGLE_DEG);
    expect(style.return.angle).toBe(DEFAULT_ARC_ANGLE_DEG);
  });

  it('keeps the tube radii (return a touch thinner)', () => {
    expect(style.outbound.width).toBe(DEFAULT_ARC_RADIUS);
    expect(style.return.width).toBeCloseTo(DEFAULT_ARC_RADIUS * 0.8, 12);
    expect(style.outbound.strokeWidth).toBe(DEFAULT_STROKE_WIDTH.outbound);
    expect(style.return.strokeWidth).toBe(DEFAULT_STROKE_WIDTH.return);
  });

  it('measures the built-in dashes in world units', () => {
    expect(style.outbound.dash?.units).toBe('world');
    expect(style.return.dash?.units).toBe('world');
    expect(style.outbound.dash?.length).toBeCloseTo(DEFAULT_OUTBOUND_DASH_WORLD.length, 9);
    expect(style.return.dash?.gap).toBeCloseTo(DEFAULT_RETURN_DASH_WORLD.gap, 9);
  });

  it('reproduces the old dash uniforms on a quarter-globe route (14 and 18 dashes)', () => {
    // A 90° arc is the reference length the world-unit defaults are sized
    // against, so the classic look survives the switch of units.
    const out = dashUniforms(style.outbound.dash!, REFERENCE_ARC_LENGTH);
    expect(out.dashCount).toBeCloseTo(14, 6);
    expect(out.dashSolid).toBeCloseTo(0.55, 6);
    expect(out.flow).toBeCloseTo(0.35, 6);

    const back = dashUniforms(style.return.dash!, REFERENCE_ARC_LENGTH);
    expect(back.dashCount).toBeCloseTo(18, 6);
    expect(back.dashSolid).toBeCloseTo(0.45, 6);
    expect(back.flow).toBeCloseTo(0.22, 6);
  });

  it('keeps one dash length on every route — the gap does not grow with it', () => {
    const short = dashUniforms(style.outbound.dash!, 0.3);
    const long = dashUniforms(style.outbound.dash!, 2.4);
    // Eight times the route, eight times the dashes: the period is fixed.
    expect(long.dashCount / short.dashCount).toBeCloseTo(8, 6);
    expect(short.dashSolid).toBeCloseTo(long.dashSolid, 9);
    // …and the flow is the same number of dashes per second everywhere.
    expect(dashFlowPerSecond(style.outbound.dash!, 0.3)).toBeCloseTo(
      dashFlowPerSecond(style.outbound.dash!, 2.4),
      9,
    );
  });

  it('defaults the dash colour to the path colour', () => {
    expect(style.outbound.dash?.color).toBe(style.outbound.color);
    expect(style.return.dash?.color).toBe(style.return.color);
    expect(DEFAULT_OUTBOUND_DASH.length + DEFAULT_OUTBOUND_DASH.gap).toBeCloseTo(1 / 14, 9);
    expect(DEFAULT_RETURN_DASH.length + DEFAULT_RETURN_DASH.gap).toBeCloseTo(1 / 18, 9);
  });

  it('keeps the animation timings and pulses on', () => {
    expect(style.drawDurationMs).toBe(1100);
    expect(style.staggerMs).toBe(350);
    expect(style.pulse).toBe(true);
  });
});

describe('resolveRouteStyle — developer customisation', () => {
  it('styles each leg independently (colour, angle, lift, width)', () => {
    const style = resolveRouteStyle('light', {
      outbound: { color: '#ff0000', angle: 20, lift: 0.4, width: 0.01 },
      return: { color: '#0000ff', angle: -32, lift: 0.2, strokeWidth: 3 },
    });
    expect(style.outbound).toMatchObject({
      color: '#ff0000',
      angle: 20,
      lift: 0.4,
      width: 0.01,
    });
    expect(style.return).toMatchObject({ color: '#0000ff', angle: -32, lift: 0.2, strokeWidth: 3 });
  });

  it('treats top-level keys as shared defaults', () => {
    const style = resolveRouteStyle('dark', { color: '#abcdef', angle: 12, opacity: 0.5 });
    expect(style.outbound.color).toBe('#abcdef');
    expect(style.return.color).toBe('#abcdef');
    expect(style.outbound.angle).toBe(12);
    expect(style.return.angle).toBe(12);
    expect(style.outbound.opacity).toBe(0.5);
  });

  it('still understands the legacy lift / arcRadius keys', () => {
    const style = resolveRouteStyle('light', {
      outboundLift: 0.05,
      returnLift: 0.35,
      arcRadius: 0.004,
    });
    expect(style.outbound.lift).toBe(0.05);
    expect(style.return.lift).toBe(0.35);
    expect(style.outbound.width).toBe(0.004);
    expect(style.return.width).toBeCloseTo(0.0032, 12);
  });

  it('dashes: colour, length, gap, speed and width', () => {
    const style = resolveRouteStyle('light', {
      dash: { color: '#00ff00', length: 0.02, gap: 0.01, speed: 3, width: 0.003 },
    });
    const dash = style.outbound.dash!;
    // Bare length / gap stay route fractions, so older configs look the same.
    expect(dash).toEqual({
      color: '#00ff00',
      length: 0.02,
      gap: 0.01,
      speed: 3,
      units: 'route',
    });
    // dash.width doubles as the line width in both worlds
    expect(style.outbound.width).toBe(0.003);
    expect(style.return.width).toBe(0.003);
    const uniforms = dashUniforms(dash);
    expect(uniforms.dashCount).toBeCloseTo(1 / 0.03, 9);
    expect(uniforms.dashSolid).toBeCloseTo(2 / 3, 9);
    expect(uniforms.flow).toBeCloseTo(0.09, 9);
  });

  it('a per-leg dash overrides the shared one', () => {
    const style = resolveRouteStyle('light', {
      dash: { length: 0.05, gap: 0.05 },
      return: { dash: { length: 0.01, gap: 0.002 } },
    });
    expect(style.outbound.dash?.length).toBeCloseTo(0.05, 9);
    expect(style.return.dash?.length).toBeCloseTo(0.01, 9);
  });

  it('dash: false draws a solid line', () => {
    const style = resolveRouteStyle('light', { dash: false });
    expect(style.outbound.dash).toBeNull();
    expect(style.return.dash).toBeNull();
    expect(resolveRouteStyle('light', { dash: { enabled: false } }).outbound.dash).toBeNull();
  });

  it('clamps silly values instead of breaking the shader', () => {
    const style = resolveRouteStyle('light', {
      outbound: { angle: 900, opacity: 4, dash: { length: 0, gap: -3, speed: -1 } },
    });
    expect(style.outbound.angle).toBe(MAX_ARC_ANGLE_DEG);
    expect(style.outbound.opacity).toBe(1);
    expect(style.outbound.dash!.length).toBeGreaterThan(0);
    expect(style.outbound.dash!.gap).toBeGreaterThan(0);
    expect(style.outbound.dash!.speed).toBe(0);
  });

  it('takes palette overrides into account', () => {
    const style = resolveRouteStyle('light', {}, { outbound: '#123456', return: '#654321' });
    expect(style.outbound.color).toBe('#123456');
    expect(style.return.color).toBe('#654321');
  });

  it('honours pulse / timing options', () => {
    const style = resolveRouteStyle('light', {
      pulse: false,
      drawDurationMs: 400,
      staggerMs: 120,
    });
    expect(style.pulse).toBe(false);
    expect(style.drawDurationMs).toBe(400);
    expect(style.staggerMs).toBe(120);
  });
});

describe('resolveDashUnits', () => {
  it('defaults to world units — the same dashes on every route', () => {
    expect(resolveDashUnits(undefined)).toBe('world');
    expect(resolveDashUnits({})).toBe('world');
    expect(resolveDashUnits({ color: '#fff' })).toBe('world');
    expect(resolveDashUnits({ units: 'world' })).toBe('world');
  });

  it('reads bare numbers as route fractions and honours an explicit unit', () => {
    expect(resolveDashUnits({ length: 0.02 })).toBe('route');
    expect(resolveDashUnits({ gap: 0.02 })).toBe('route');
    expect(resolveDashUnits({ length: 0.02, units: 'world' })).toBe('world');
    expect(resolveDashUnits({ units: 'route' })).toBe('route');
  });
});

describe('route-unit dashes', () => {
  it('stretch a pattern over the whole route', () => {
    const style = resolveRouteStyle('light', {
      dash: { units: 'route', length: 0.05, gap: 0.05, speed: 4 },
    });
    const dash = style.outbound.dash!;
    expect(dashUniforms(dash, 1).dashCount).toBeCloseTo(10, 9);
    expect(dashUniforms(dash, 2.4).dashCount).toBeCloseTo(10, 9);
    expect(dashFlowPerSecond(dash, 2.4)).toBeCloseTo(4, 9);
  });
});

describe('dashArrayPx', () => {
  it('scales the fractions of the route to px on the real path', () => {
    const dash = { color: '#000', length: 0.05, gap: 0.03, speed: 0, units: 'route' as const };
    const [length, gap] = dashArrayPx(dash, 1000);
    expect(length).toBeCloseTo(50, 9);
    expect(gap).toBeCloseTo(30, 9);
  });

  it('converts a world-unit pattern with the map scale, not the path length', () => {
    const dash = { color: '#000', length: 0.05, gap: 0.03, speed: 0, units: 'world' as const };
    const worldToPx = 1600 / (2 * Math.PI);
    const [length, gap] = dashArrayPx(dash, 1000, worldToPx);
    expect(length).toBeCloseTo(0.05 * worldToPx, 9);
    expect(gap).toBeCloseTo(0.03 * worldToPx, 9);
    // The same pattern on a path twice as long keeps the same px.
    const [again] = dashArrayPx(dash, 2000, worldToPx);
    expect(again).toBeCloseTo(length, 9);
  });

  it('never emits a zero-length dash (SVG would not render it)', () => {
    const dash = { color: '#000', length: 0.001, gap: 0.001, speed: 0, units: 'route' as const };
    const [length, gap] = dashArrayPx(dash, 0);
    expect(length).toBeGreaterThanOrEqual(1);
    expect(gap).toBeGreaterThanOrEqual(1);
  });
});

describe('globeTubeRadius — px-aware tube sizing', () => {
  it('keeps legacy globe-radii widths as they are', () => {
    expect(globeTubeRadius(0.0015)).toBe(0.0015);
    expect(globeTubeRadius(0)).toBe(0);
    expect(globeTubeRadius(GLOBE_WIDTH_LEGACY_MAX)).toBe(GLOBE_WIDTH_LEGACY_MAX);
  });

  it('reads px-range values (docs / studio) and converts them', () => {
    // The studio's default "1.8 px" must land at ~the historical look.
    expect(globeTubeRadius(1.8)).toBeCloseTo(1.8 / GLOBE_RADIUS_PX_AT_DEFAULT_VIEW, 12);
    expect(globeTubeRadius(6)).toBeCloseTo(6 / GLOBE_RADIUS_PX_AT_DEFAULT_VIEW, 12);
    expect(globeTubeRadius(2.4)).toBeCloseTo(2.4 / GLOBE_RADIUS_PX_AT_DEFAULT_VIEW, 12);
  });

  it('never lets a px value build a planet-sized tube', () => {
    expect(globeTubeRadius(1e6)).toBeCloseTo(
      MAX_LINE_WIDTH_PX / GLOBE_RADIUS_PX_AT_DEFAULT_VIEW,
      12,
    );
  });
});
