import { describe, expect, it } from 'vitest';
import { CameraRig, easeOutCubic, lngDelta } from '../cameraRig.js';

describe('lngDelta', () => {
  it('takes the shortest way around the sphere', () => {
    // 170 -> -170 crosses +180 (increasing), -170 -> 170 crosses -180
    expect(lngDelta(170, -170)).toBeCloseTo(20, 9);
    expect(lngDelta(-170, 170)).toBeCloseTo(-20, 9);
    expect(lngDelta(10, 30)).toBeCloseTo(20, 9);
    expect(lngDelta(0, 0)).toBe(0);
    // exactly 180° is degenerate: both ways are equally short
    expect(Math.abs(lngDelta(0, 180))).toBe(180);
  });
});

describe('easeOutCubic', () => {
  it('is 0 at start, 1 at end, and clamps outside [0,1]', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // front-loaded
  });
});

describe('CameraRig', () => {
  it('sanitizes the initial view (lat clamp, lng wrap, altitude clamp)', () => {
    const rig = new CameraRig({ initial: { lat: 95, lng: 190, altitude: 0.1 } });
    expect(rig.state.lat).toBeLessThanOrEqual(89.9);
    expect(rig.state.lng).toBeCloseTo(-170, 9);
    expect(rig.state.altitude).toBe(1.05);
  });

  it('auto-rotates eastward when enabled and paused during tweens', () => {
    const rig = new CameraRig({
      initial: { lat: 20, lng: 0, altitude: 2 },
      autoRotateSpeed: 10, // deg/s
    });
    rig.update(1, 0);
    expect(rig.state.lng).toBeCloseTo(10, 9);
    rig.update(0.5, 0);
    expect(rig.state.lng).toBeCloseTo(15, 9);
    rig.setAutoRotate(false);
    rig.update(1, 0);
    expect(rig.state.lng).toBeCloseTo(15, 9);
  });

  it('tweens from the current view to the target over the duration', () => {
    const rig = new CameraRig({ initial: { lat: 0, lng: 0, altitude: 2 } });
    rig.startTween({ lat: 25, lng: 90, altitude: 1.5 }, 0, { durationMs: 1000 });
    expect(rig.tweenActive).toBe(true);

    rig.update(0.016, 0); // t=0
    expect(rig.state.lat).toBeCloseTo(0, 9);
    expect(rig.state.lng).toBeCloseTo(0, 9);

    rig.update(0.016, 500);
    expect(rig.state.lat).toBeGreaterThan(0);
    expect(rig.state.lat).toBeLessThan(25);
    expect(rig.state.lng).toBeGreaterThan(0);
    expect(rig.state.lng).toBeLessThan(90);

    rig.update(0.016, 1000);
    expect(rig.tweenActive).toBe(false);
    expect(rig.state.lat).toBeCloseTo(25, 9);
    expect(rig.state.lng).toBeCloseTo(90, 9);
    expect(rig.state.altitude).toBeCloseTo(1.5, 9);
  });

  it('tweens across the antimeridian the short way', () => {
    const rig = new CameraRig({ initial: { lat: 0, lng: 170, altitude: 2 } });
    rig.startTween({ lat: 0, lng: -170, altitude: 2 }, 0, { durationMs: 1000 });
    rig.update(0.016, 100); // early in the tween: still east of 170
    expect(rig.state.lng).toBeGreaterThan(170);
    expect(rig.state.lng).toBeLessThan(180);
    rig.update(0.016, 1000);
    expect(rig.state.lng).toBeCloseTo(-170, 9);
  });

  it('returns the correct world-space position', () => {
    const rig = new CameraRig({ initial: { lat: 0, lng: 0, altitude: 2 } });
    const p = rig.position(1);
    expect(p[0]).toBeCloseTo(2, 9); // 2R along +X
    expect(p[1]).toBeCloseTo(0, 9);
    expect(p[2]).toBeCloseTo(0, 9);
  });
});
