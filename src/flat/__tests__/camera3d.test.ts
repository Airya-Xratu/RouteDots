import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLAT_CAMERA_3D,
  LAYER_DEPTH_FACTOR,
  ORBIT_LIMITS,
  ZOOM_LIMITS,
  clampOrbit,
  easeFactor,
  flatCamera3DTransforms,
  followCentre,
  resolveFlatCamera3D,
  zoomStep,
} from '../camera3d.js';

describe('resolveFlatCamera3D', () => {
  it('is off by default — the flat world stays flat', () => {
    const camera = resolveFlatCamera3D();
    expect(camera.enabled).toBe(false);
    expect(camera.tilt).toBe(DEFAULT_FLAT_CAMERA_3D.tilt);
    expect(camera.yaw).toBe(DEFAULT_FLAT_CAMERA_3D.yaw);
    expect(camera.perspective).toBe(DEFAULT_FLAT_CAMERA_3D.perspective);
    expect(camera.depth).toBe(DEFAULT_FLAT_CAMERA_3D.depth);
    expect(camera.follow).toBe(true);
    expect(camera.interactive).toBe(false);
  });

  it('enables on request and keeps the custom camera values', () => {
    const camera = resolveFlatCamera3D({
      enabled: true,
      perspective: 900,
      tilt: 45,
      yaw: 20,
      depth: 80,
      interactive: true,
      follow: false,
    });
    expect(camera).toMatchObject({
      enabled: true,
      perspective: 900,
      tilt: 45,
      yaw: 20,
      depth: 80,
      interactive: true,
      follow: false,
    });
  });

  it('clamps the orbit, the perspective and the depth', () => {
    const camera = resolveFlatCamera3D({
      enabled: true,
      tilt: 400,
      yaw: -400,
      perspective: 10,
      depth: -20,
    });
    expect(camera.tilt).toBe(ORBIT_LIMITS.tilt);
    expect(camera.yaw).toBe(-ORBIT_LIMITS.yaw);
    expect(camera.perspective).toBe(300);
    expect(camera.depth).toBe(0);
    const wide = resolveFlatCamera3D({ enabled: true, perspective: 100_000, depth: 1000 });
    expect(wide.perspective).toBe(6000);
    expect(wide.depth).toBe(400);
  });

  it('falls back to the defaults for non-finite input', () => {
    const camera = resolveFlatCamera3D({ enabled: true, tilt: Number.NaN, depth: Number.NaN });
    expect(camera.tilt).toBe(DEFAULT_FLAT_CAMERA_3D.tilt);
    expect(camera.depth).toBe(DEFAULT_FLAT_CAMERA_3D.depth);
  });
});

describe('clampOrbit', () => {
  it('keeps gestures inside the readable range', () => {
    expect(clampOrbit(-200, 200)).toEqual({ tilt: -ORBIT_LIMITS.tilt, yaw: ORBIT_LIMITS.yaw });
    expect(clampOrbit(12, -34)).toEqual({ tilt: 12, yaw: -34 });
  });
});

describe('flatCamera3DTransforms', () => {
  it('is empty when the effect is off', () => {
    const transforms = flatCamera3DTransforms(resolveFlatCamera3D());
    expect(transforms.world).toBe('');
    expect(transforms.routeLayer).toBe('');
    expect(transforms.borderLayer).toBe('');
    expect(transforms.cityLayer).toBe('');
  });

  it('builds the perspective, the world rotation and the depth layers', () => {
    const transforms = flatCamera3DTransforms(
      resolveFlatCamera3D({ enabled: true, perspective: 1200, tilt: 30, yaw: -10, depth: 100 }),
    );
    expect(transforms.viewport).toBe('perspective(1200px)');
    expect(transforms.world).toBe('rotateX(30.00deg) rotateZ(-10.00deg)');
    expect(transforms.routeLayer).toBe('translateZ(100.00px)');
    expect(transforms.cityLayer).toBe(
      `translateZ(${(100 * LAYER_DEPTH_FACTOR.cities).toFixed(2)}px)`,
    );
    expect(transforms.borderLayer).toBe(
      `translateZ(${(100 * LAYER_DEPTH_FACTOR.borders).toFixed(2)}px)`,
    );
  });
});

describe('easeFactor', () => {
  it('is 1 − e^(−k·dt) and safe for degenerate input', () => {
    expect(easeFactor(3, 0.2)).toBeCloseTo(1 - Math.exp(-0.6), 12);
    expect(easeFactor(0, 0.2)).toBe(0);
    expect(easeFactor(3, 0)).toBe(0);
    expect(easeFactor(Number.NaN, 1)).toBe(0);
    // Never overshoots, even for big steps.
    expect(easeFactor(100, 10)).toBeLessThanOrEqual(1);
  });
});

describe('zoomStep', () => {
  it('zooms in and out and respects the limits', () => {
    expect(zoomStep(1, 1)).toBeCloseTo(1.09, 9);
    expect(zoomStep(1, -1)).toBeCloseTo(0.91, 9);
    expect(zoomStep(100, 1)).toBe(ZOOM_LIMITS.max);
    expect(zoomStep(0.001, -1)).toBe(ZOOM_LIMITS.min);
  });
});

describe('followCentre', () => {
  const viewport = { w: 1000, h: 600 };
  const base = { centre: { x: 500, y: 400 }, viewport, scale: 1 };

  it('stays put while the plane is inside the safe area', () => {
    expect(followCentre({ ...base, plane: { x: 520, y: 380 } })).toBeNull();
  });

  it('pulls the frame back when the plane leaves it', () => {
    // 400 px to the right of the centre; safe half-width is 500 − 90 = 410 → outside.
    const target = followCentre({ ...base, plane: { x: 980, y: 400 } });
    expect(target).not.toBeNull();
    expect(target!.x).toBeGreaterThan(base.centre.x);
    expect(target!.x).toBeLessThanOrEqual(980);
    expect(target!.y).toBeCloseTo(base.centre.y, 9);
  });

  it('scales the safe area with the zoom level', () => {
    // Zoomed in 4×: the safe half-width shrinks to (1000/8 − 90/4) = 102.5 px.
    const target = followCentre({ ...base, plane: { x: 800, y: 400 }, scale: 4 });
    expect(target).not.toBeNull();
    expect(target!.x - base.centre.x).toBeLessThanOrEqual(103);
  });

  it('ignores degenerate scales', () => {
    expect(followCentre({ ...base, plane: { x: 5000, y: 0 }, scale: 0 })).toBeNull();
  });
});
