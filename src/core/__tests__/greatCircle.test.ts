import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  greatCircleArc,
  greatCircleDistanceKm,
  greatCircleMidpoint,
  latLngToVec,
  norm,
  slerp,
  vecToLatLng,
} from '../greatCircle.js';
import type { LatLon } from '../../types.js';

const LHR: LatLon = { lat: 51.507, lng: -0.128 };
const DXB: LatLon = { lat: 25.204, lng: 55.271 };
const THR: LatLon = { lat: 35.689, lng: 51.389 };
const JFK: LatLon = { lat: 40.713, lng: -74.006 };
const SYD: LatLon = { lat: -33.869, lng: 151.209 };

describe('latLngToVec / vecToLatLng', () => {
  it('round-trips a spread of points', () => {
    const points: LatLon[] = [
      { lat: 0, lng: 0 },
      { lat: 51.507, lng: -0.128 },
      { lat: -33.869, lng: 151.209 },
      { lat: 90, lng: 123.4 },
      { lat: -90, lng: -123.4 },
      { lat: 12.3, lng: 179.9 },
      { lat: 12.3, lng: -179.9 },
      { lat: 45, lng: 180 },
    ];
    for (const p of points) {
      const v = latLngToVec(p.lat, p.lng);
      expect(norm(v)).toBeCloseTo(1, 12);
      const back = vecToLatLng(v);
      expect(back.lat).toBeCloseTo(p.lat, 9);
      // Longitude is undefined exactly at the poles.
      if (Math.abs(p.lat) < 89) {
        const lngDiff = Math.abs(((back.lng - p.lng + 540) % 360) - 180);
        expect(lngDiff).toBeLessThan(1e-9);
      }
    }
  });
});

describe('slerp', () => {
  const a = latLngToVec(LHR.lat, LHR.lng);
  const b = latLngToVec(DXB.lat, DXB.lng);

  it('returns the endpoints at t=0 and t=1', () => {
    expect(slerp(a, b, 0)).toEqual(a);
    const end = slerp(a, b, 1);
    end.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 12));
  });

  it('stays on the unit sphere and is symmetric', () => {
    for (const t of [0.1, 0.37, 0.5, 0.9]) {
      expect(norm(slerp(a, b, t))).toBeCloseTo(1, 9);
      const fwd = slerp(a, b, t);
      const bwd = slerp(b, a, 1 - t);
      fwd.forEach((v, i) => expect(v).toBeCloseTo(bwd[i]!, 9));
    }
  });

  it('advances the central angle linearly with t', () => {
    const omega = angularDistance(LHR, DXB);
    for (const t of [0.15, 0.5, 0.8]) {
      const p = slerp(a, b, t);
      const angle = Math.acos(Math.min(1, a[0] * p[0] + a[1] * p[1] + a[2] * p[2]));
      expect(angle).toBeCloseTo(omega * t, 6);
    }
  });

  it('throws for antipodal endpoints', () => {
    const n = latLngToVec(0, 0);
    const s = latLngToVec(0, 180);
    expect(() => slerp(n, s, 0.5)).toThrow(RangeError);
  });
});

describe('distances', () => {
  it('matches reference great-circle distances (haversine, R=6371)', () => {
    const refs: [LatLon, LatLon, number, number][] = [
      [LHR, DXB, 5473.5, 5],
      [THR, DXB, 1223.5, 5],
      [JFK, SYD, 15988.8, 10],
    ];
    for (const [a, b, expected, tol] of refs) {
      expect(Math.abs(greatCircleDistanceKm(a, b) - expected)).toBeLessThan(tol);
    }
  });
});

describe('greatCircleMidpoint', () => {
  it('is equidistant from both endpoints', () => {
    const mid = greatCircleMidpoint(LHR, DXB);
    const dTotal = greatCircleDistanceKm(LHR, DXB);
    const d1 = greatCircleDistanceKm(LHR, mid);
    const d2 = greatCircleDistanceKm(mid, DXB);
    expect(d1).toBeCloseTo(dTotal / 2, -1); // within ~10 km
    expect(d2).toBeCloseTo(dTotal / 2, -1);
  });

  it('falls over the expected region for LHR→DXB', () => {
    const mid = greatCircleMidpoint(LHR, DXB);
    expect(mid.lat).toBeGreaterThan(25);
    expect(mid.lat).toBeLessThan(55);
    expect(mid.lng).toBeGreaterThan(-10);
    expect(mid.lng).toBeLessThan(60);
  });
});

describe('greatCircleArc', () => {
  it('samples segments+1 points with endpoints on the surface', () => {
    const pts = greatCircleArc(LHR, DXB, { segments: 32, lift: 0.25 });
    expect(pts).toHaveLength(33);
    expect(norm(pts[0]!)).toBeCloseTo(1, 9);
    expect(norm(pts[pts.length - 1]!)).toBeCloseTo(1, 9);
  });

  it('peaks at 1 + lift at the midpoint and stays unimodal', () => {
    const pts = greatCircleArc(LHR, DXB, { segments: 64, lift: 0.3 });
    const radii = pts.map(norm);
    const middle = radii[32]!;
    expect(middle).toBeCloseTo(1.3, 6);
    for (let i = 1; i < 32; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
    for (let i = 33; i < radii.length; i++) expect(radii[i]!).toBeLessThan(radii[i - 1]!);
    for (const r of radii) {
      expect(r).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(r).toBeLessThanOrEqual(1.3 + 1e-9);
    }
  });

  it('degenerates to a surface-hugging great circle when lift is 0', () => {
    const pts = greatCircleArc(LHR, DXB, { segments: 16, lift: 0 });
    for (const p of pts) expect(norm(p)).toBeCloseTo(1, 9);
  });

  it('throws for antipodal endpoints', () => {
    expect(() => greatCircleArc({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, {})).toThrow(RangeError);
  });
});
