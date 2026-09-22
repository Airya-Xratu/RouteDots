import { describe, expect, it } from 'vitest';
import { greatCircleArc, norm, vecToLatLng } from '../../core/greatCircle.js';
import type { LatLon } from '../../types.js';
import { GreatCircleCurve } from '../GreatCircleCurve.js';

const LHR: LatLon = { lat: 51.507, lng: -0.128 };
const DXB: LatLon = { lat: 25.204, lng: 55.271 };
const LIFT = 0.3;

describe('GreatCircleCurve', () => {
  const curve = new GreatCircleCurve(LHR, DXB, LIFT);

  it('starts at the origin and ends at the destination on the surface', () => {
    const start = curve.getPoint(0);
    const end = curve.getPoint(1);
    expect(norm([start.x, start.y, start.z])).toBeCloseTo(1, 9);
    expect(norm([end.x, end.y, end.z])).toBeCloseTo(1, 9);
    const s = vecToLatLng([start.x, start.y, start.z]);
    const e = vecToLatLng([end.x, end.y, end.z]);
    expect(s.lat).toBeCloseTo(LHR.lat, 6);
    expect(s.lng).toBeCloseTo(LHR.lng, 6);
    expect(e.lat).toBeCloseTo(DXB.lat, 6);
    expect(e.lng).toBeCloseTo(DXB.lng, 6);
  });

  it('peaks at 1 + lift at the midpoint', () => {
    const mid = curve.getPoint(0.5);
    expect(norm([mid.x, mid.y, mid.z])).toBeCloseTo(1 + LIFT, 9);
  });

  it('matches the core greatCircleArc sampling', () => {
    const sampled = greatCircleArc(LHR, DXB, { segments: 8, lift: LIFT });
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const p = curve.getPoint(t);
      const ref = sampled[i]!;
      expect(Math.hypot(p.x - ref[0], p.y - ref[1], p.z - ref[2])).toBeLessThan(1e-9);
    }
  });

  it('throws for antipodal endpoints', () => {
    const bad = new GreatCircleCurve({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, 0.2);
    expect(() => bad.getPoint(0.5)).toThrow(RangeError);
  });
});
