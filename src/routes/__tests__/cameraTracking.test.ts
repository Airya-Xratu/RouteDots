import { describe, expect, it } from 'vitest';
import { trackCamera, trackingThresholdDeg, visibleHorizonDeg } from '../cameraTracking.js';
import { lngDelta, type ViewState } from '../../globe/cameraRig.js';
import type { LatLon } from '../../types.js';

const CAMERA: ViewState = { lat: 30, lng: 0, altitude: 1.9 };
const NEAR: LatLon = { lat: 30, lng: 0 }; // right under the camera
const FAR: LatLon = { lat: 30, lng: 90 }; // ~75° away, well beyond the horizon

const step = (overrides: Partial<Parameters<typeof trackCamera>[0]> = {}) =>
  trackCamera({
    camera: CAMERA,
    plane: NEAR,
    dtSec: 0.016,
    routeActive: true,
    userControlled: false,
    ...overrides,
  });

describe('visibleHorizonDeg', () => {
  it('is 0 at or below the surface', () => {
    expect(visibleHorizonDeg(1)).toBe(0);
    expect(visibleHorizonDeg(0.9)).toBe(0);
  });

  it('grows with altitude (acos(1/h))', () => {
    expect(visibleHorizonDeg(1.9)).toBeCloseTo((Math.acos(1 / 1.9) * 180) / Math.PI, 9);
    expect(visibleHorizonDeg(4)).toBeGreaterThan(visibleHorizonDeg(1.2));
  });
});

describe('trackingThresholdDeg', () => {
  it('is the visible horizon minus the 5° margin', () => {
    expect(trackingThresholdDeg(1.9)).toBeCloseTo(visibleHorizonDeg(1.9) - 5, 9);
    expect(trackingThresholdDeg(1.9, 10)).toBeCloseTo(visibleHorizonDeg(1.9) - 10, 9);
  });

  it('never drops below 1°', () => {
    expect(trackingThresholdDeg(1.001)).toBeGreaterThanOrEqual(1);
  });
});

describe('trackCamera', () => {
  it('with no route: stands down and suggests idle rotation', () => {
    const result = step({ routeActive: false, plane: FAR });
    expect(result).toEqual({
      camera: CAMERA,
      tracking: false,
      adjusted: false,
      autoRotate: true,
    });
  });

  it('with a route: tracking engages and pauses idle rotation', () => {
    const result = step();
    expect(result.tracking).toBe(true);
    expect(result.adjusted).toBe(false);
    expect(result.autoRotate).toBe(false);
    expect(result.camera).toEqual(CAMERA);
  });

  it('holds still while the plane stays inside the visible disc', () => {
    const nearButNotUnder: LatLon = { lat: 45, lng: 25 }; // well within ~53°
    const result = step({ plane: nearButNotUnder });
    expect(result.adjusted).toBe(false);
    expect(result.camera).toEqual(CAMERA);
  });

  it('eases toward the plane once it leaves the disc, altitude unchanged', () => {
    const result = step({ plane: FAR, dtSec: 0.4 });
    const k = 1 - Math.exp(-2.5 * 0.4); // ≈ 0.632
    expect(result.adjusted).toBe(true);
    expect(result.camera.lng).toBeCloseTo(CAMERA.lng + (FAR.lng - CAMERA.lng) * k, 9);
    expect(result.camera.lat).toBeCloseTo(CAMERA.lat + (FAR.lat - CAMERA.lat) * k, 9);
    expect(result.camera.altitude).toBe(CAMERA.altitude);
    // still short of the target — this is an ease, not a snap
    expect(result.camera.lng).toBeLessThan(FAR.lng);
  });

  it('takes the shortest way around across the antimeridian', () => {
    const seam: ViewState = { lat: 0, lng: 170, altitude: 1.9 };
    const target: LatLon = { lat: 0, lng: -100 }; // +90° east through 180
    const result = step({ camera: seam, plane: target, dtSec: 0.4 });
    expect(result.adjusted).toBe(true);
    // moved east through the seam, landing at 170 + 90k → wrapped to −133…
    expect(result.camera.lng).toBeCloseTo(((170 + 90 * (1 - Math.exp(-1)) + 540) % 360) - 180, 9);
    expect(lngDelta(seam.lng, result.camera.lng)).toBeCloseTo(90 * (1 - Math.exp(-1)), 9);
  });

  it('yields to the user: frozen while dragging or tweening', () => {
    const result = step({ plane: FAR, userControlled: true });
    expect(result.tracking).toBe(false);
    expect(result.adjusted).toBe(false);
    expect(result.camera).toEqual(CAMERA);
    expect(result.autoRotate).toBe(false);
  });

  it('does not move on a zero-length frame', () => {
    const result = step({ plane: FAR, dtSec: 0 });
    expect(result.tracking).toBe(true);
    expect(result.adjusted).toBe(false);
  });

  it('honours a custom ease strength', () => {
    const result = trackCamera(
      { camera: CAMERA, plane: FAR, dtSec: 0.4, routeActive: true, userControlled: false },
      { easePerSecond: 5 },
    );
    expect(result.camera.lng).toBeCloseTo(90 * (1 - Math.exp(-2)), 9);
  });
});
