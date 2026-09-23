import { describe, expect, it } from 'vitest';
import { latLngToVec, norm, slerp, vecToLatLng, type Vec3 } from '../../core/greatCircle.js';
import type { LatLon } from '../../types.js';
import {
  MAX_ARC_ANGLE_DEG,
  arcBulge,
  arcPoint,
  arcPointBetween,
  arcSamples,
  chordAxis,
  normalizeArcAngleDeg,
  rotateAroundAxis,
  unit,
} from '../arcPath.js';

const LHR: LatLon = { lat: 51.507, lng: -0.128 };
const DXB: LatLon = { lat: 25.204, lng: 55.271 };
const va = latLngToVec(LHR.lat, LHR.lng);
const vb = latLngToVec(DXB.lat, DXB.lng);

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('rotateAroundAxis', () => {
  it('rotates a vector 90° about the Z axis', () => {
    const r = rotateAroundAxis([1, 0, 0], [0, 0, 1], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0, 9);
    expect(r[1]).toBeCloseTo(1, 9);
    expect(r[2]).toBeCloseTo(0, 9);
  });

  it('leaves vectors on the axis untouched and preserves length', () => {
    const axis: Vec3 = unit([1, 2, 3])!;
    expect(distance(rotateAroundAxis(axis, axis, 1.2), axis)).toBeLessThan(1e-9);
    const rotated = rotateAroundAxis([0.3, -0.4, 0.5], axis, 2.1);
    expect(norm(rotated)).toBeCloseTo(norm([0.3, -0.4, 0.5]), 9);
  });
});

describe('chordAxis', () => {
  it('is a unit vector perpendicular to nothing in particular but along b − a', () => {
    const axis = chordAxis(va, vb)!;
    expect(norm(axis)).toBeCloseTo(1, 9);
    const d: Vec3 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    expect(norm(unit(d)!)).toBeCloseTo(1, 9);
    expect(axis[0]).toBeCloseTo(d[0] / norm(d), 9);
  });

  it('returns null for coincident points', () => {
    expect(chordAxis(va, va)).toBeNull();
  });
});

describe('normalizeArcAngleDeg', () => {
  it('defaults to 0 and clamps to ±MAX', () => {
    expect(normalizeArcAngleDeg(undefined)).toBe(0);
    expect(normalizeArcAngleDeg(Number.NaN)).toBe(0);
    expect(normalizeArcAngleDeg(12)).toBe(12);
    expect(normalizeArcAngleDeg(1200)).toBe(MAX_ARC_ANGLE_DEG);
    expect(normalizeArcAngleDeg(-1200)).toBe(-MAX_ARC_ANGLE_DEG);
  });
});

describe('arcPoint', () => {
  it('keeps both endpoints exactly on the surface for any angle', () => {
    for (const angle of [0, 15, -35, MAX_ARC_ANGLE_DEG]) {
      const start = arcPoint(va, vb, 0, { lift: 0.2, angle });
      const end = arcPoint(va, vb, 1, { lift: 0.2, angle });
      expect(distance(start, va)).toBeLessThan(1e-9);
      expect(distance(end, vb)).toBeLessThan(1e-9);
    }
  });

  it('matches the classic lifted great circle when the angle is 0', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = arcPoint(va, vb, t, { lift: 0.3 });
      const s = slerp(va, vb, t);
      const f = 1 + 0.3 * Math.sin(Math.PI * t);
      expect(p[0]).toBeCloseTo(s[0] * f, 9);
      expect(p[1]).toBeCloseTo(s[1] * f, 9);
      expect(p[2]).toBeCloseTo(s[2] * f, 9);
    }
  });

  it('follows 1 + lift·sin(πt) for the radius', () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const p = arcPoint(va, vb, t, { lift: 0.4, angle: 25 });
      expect(norm(p)).toBeCloseTo(1 + 0.4 * Math.sin(Math.PI * t), 9);
    }
  });

  it('banks the midpoint off the great-circle plane, more for bigger angles', () => {
    const straight = arcPoint(va, vb, 0.5, { lift: 0 });
    const small = arcPoint(va, vb, 0.5, { lift: 0, angle: 20 });
    const big = arcPoint(va, vb, 0.5, { lift: 0, angle: 60 });
    const off = (p: Vec3): number => distance(straight, p);
    expect(off(small)).toBeGreaterThan(0);
    expect(off(big)).toBeGreaterThan(off(small) * 2);
    // It stays a surface point alongside the chord either way.
    expect(norm(big)).toBeCloseTo(1, 9);
  });

  it('banks longer routes further, for the same angle', () => {
    const SYD: LatLon = { lat: -33.869, lng: 151.209 };
    const short = distance(
      arcPointBetween(LHR, DXB, 0.5, { lift: 0 }),
      arcPointBetween(LHR, DXB, 0.5, { lift: 0, angle: 45 }),
    );
    const long = distance(
      arcPointBetween(LHR, SYD, 0.5, { lift: 0 }),
      arcPointBetween(LHR, SYD, 0.5, { lift: 0, angle: 45 }),
    );
    expect(long).toBeGreaterThan(short * 2);
  });

  it('combines with the lift: the apex is banked and raised', () => {
    const apex = arcPoint(va, vb, 0.5, { lift: 0.3, angle: 45 });
    expect(norm(apex)).toBeCloseTo(1.3, 9);
    const straightApex = arcPoint(va, vb, 0.5, { lift: 0.3, angle: 0 });
    expect(distance(apex, straightApex)).toBeGreaterThan(0);
  });

  it('banks symmetrically: ±angle mirror about the great circle', () => {
    const left = arcPointBetween(LHR, DXB, 0.5, { lift: 0, angle: 25 });
    const right = arcPointBetween(LHR, DXB, 0.5, { lift: 0, angle: -25 });
    const straight = arcPointBetween(LHR, DXB, 0.5, { lift: 0, angle: 0 });
    expect(distance(left, straight)).toBeCloseTo(distance(right, straight), 9);
  });

  it('keeps the arc over the chord: every sample stays within the globe', () => {
    for (const p of arcSamples(LHR, DXB, { lift: 0.2, angle: 40 }, 32)) {
      expect(norm(p)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('rejects antipodal endpoints (no unique great circle)', () => {
    const a = latLngToVec(0, 0);
    const b = latLngToVec(0, 180);
    expect(() => arcPoint(a, b, 0.5, {})).toThrow(RangeError);
  });
});

describe('arcBulge', () => {
  it('is the lift for a straight lifted arc', () => {
    expect(arcBulge(LHR, DXB, { lift: 0.25, angle: 0 })).toBeCloseTo(0.25, 6);
  });

  it('grows when the arc is banked', () => {
    const straight = arcBulge(LHR, DXB, { lift: 0, angle: 0 });
    const banked = arcBulge(LHR, DXB, { lift: 0, angle: 60 });
    expect(straight).toBeCloseTo(0, 9);
    expect(banked).toBeGreaterThan(0.05);
  });
});

describe('arcPointBetween', () => {
  it('agrees with the vector form', () => {
    const a = arcPointBetween(LHR, DXB, 0.37, { lift: 0.12, angle: 12 });
    const b = arcPoint(va, vb, 0.37, { lift: 0.12, angle: 12 });
    expect(distance(a, b)).toBeLessThan(1e-12);
  });

  it('keeps the ground track between the endpoints for moderate angles', () => {
    const mid = vecToLatLng(arcPointBetween(LHR, DXB, 0.5, { lift: 0.2, angle: 20 }));
    expect(mid.lat).toBeGreaterThan(0);
    expect(mid.lat).toBeLessThan(90);
    expect(mid.lng).toBeGreaterThan(-180);
    expect(mid.lng).toBeLessThan(180);
  });
});
