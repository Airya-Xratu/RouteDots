import { describe, expect, it } from 'vitest';
import type { LatLon } from '../../types.js';
import { flatArcBounds, flatArcGeometry } from '../routePath.js';

const WIDTH = 1600;
const HEIGHT = 800;

/** Equirectangular projection, matching the flat world. */
const project = (p: LatLon): [number, number] => [
  ((p.lng + 180) / 360) * WIDTH,
  ((90 - p.lat) / 180) * HEIGHT,
];

const LHR: LatLon = { lat: 51.507, lng: -0.128 };
const DXB: LatLon = { lat: 25.204, lng: 55.271 };

interface ArcLike {
  from: [number, number];
  to: [number, number];
  control: [number, number];
}

/**
 * Decomposes the control-point offset into its components along the chord
 * (positive = toward the destination) and perpendicular to it.
 */
const offsetComponents = (arc: ArcLike): { along: number; perpendicular: number } => {
  const dx = arc.to[0] - arc.from[0];
  const dy = arc.to[1] - arc.from[1];
  const length = Math.hypot(dx, dy);
  const ox = arc.control[0] - (arc.from[0] + arc.to[0]) / 2;
  const oy = arc.control[1] - (arc.from[1] + arc.to[1]) / 2;
  return {
    along: (ox * dx + oy * dy) / length,
    perpendicular: Math.abs((ox * dy - oy * dx) / length),
  };
};

describe('flatArcGeometry', () => {
  it('starts at the origin and ends at the destination', () => {
    const arc = flatArcGeometry({ from: LHR, to: DXB, project });
    expect(arc.from).toEqual(project(LHR));
    expect(arc.to).toEqual(project(DXB));
    const round2 = (v: number): number => Math.round(v * 100) / 100;
    expect(arc.d.startsWith(`M ${round2(arc.from[0])} ${round2(arc.from[1])}`)).toBe(true);
    expect(arc.d.endsWith(`${round2(arc.to[0])} ${round2(arc.to[1])}`)).toBe(true);
    expect(arc.d).toContain('Q');
  });

  it('bulges perpendicular to the chord (max(14, chord · 0.28))', () => {
    const arc = flatArcGeometry({ from: LHR, to: DXB, project });
    const chord = Math.hypot(arc.to[0] - arc.from[0], arc.to[1] - arc.from[1]);
    expect(arc.bulge).toBeCloseTo(Math.max(14, chord * 0.28), 6);
    // A pure perpendicular offset means no projection along the chord.
    const components = offsetComponents(arc);
    expect(components.along).toBeCloseTo(0, 9);
    expect(components.perpendicular).toBeCloseTo(arc.bulge, 9);
  });

  it('bulges the outbound leg up-screen and the return leg down-screen', () => {
    const outbound = flatArcGeometry({ from: LHR, to: DXB, project, bulgeScale: 1 });
    const back = flatArcGeometry({ from: DXB, to: LHR, project, bulgeScale: 1.25 });
    const midY = (p: { from: [number, number]; to: [number, number] }): number =>
      (p.from[1] + p.to[1]) / 2;
    expect(outbound.control[1]).toBeLessThan(midY(outbound));
    expect(back.control[1]).toBeGreaterThan(midY(back));
    expect(back.bulge).toBeGreaterThan(outbound.bulge);
  });

  it('keeps a minimum bulge for very short hops', () => {
    const near: LatLon = { lat: 51.5, lng: -0.2 };
    const arc = flatArcGeometry({ from: LHR, to: near, project });
    expect(arc.bulge).toBeCloseTo(14, 6);
  });

  it('leans the bulge by the curve angle: cos across the chord, sin along it', () => {
    const straight = flatArcGeometry({ from: LHR, to: DXB, project });
    const lean = flatArcGeometry({ from: LHR, to: DXB, project, angle: 30 });
    const mirrored = flatArcGeometry({ from: LHR, to: DXB, project, angle: -30 });
    expect(lean.angle).toBe(30);

    const straightParts = offsetComponents(straight);
    const leanParts = offsetComponents(lean);
    const mirrorParts = offsetComponents(mirrored);
    const radians = (30 * Math.PI) / 180;

    expect(leanParts.perpendicular).toBeCloseTo(straight.bulge * Math.cos(radians), 6);
    expect(Math.abs(leanParts.along)).toBeCloseTo(straight.bulge * Math.sin(radians), 6);
    // Mirroring the angle mirrors the lean and keeps the reach.
    expect(leanParts.along).toBeCloseTo(-mirrorParts.along, 6);
    expect(leanParts.perpendicular).toBeCloseTo(mirrorParts.perpendicular, 6);
    expect(straightParts.perpendicular).toBeCloseTo(straight.bulge, 6);
  });

  it('clamps the angle like the globe does', () => {
    const arc = flatArcGeometry({ from: LHR, to: DXB, project, angle: 900 });
    expect(arc.angle).toBe(85);
  });

  it('emits rounded, compact path data', () => {
    const arc = flatArcGeometry({ from: LHR, to: DXB, project, digits: 1 });
    const numbers = arc.d
      .replace(/[MQL]/g, ' ')
      .trim()
      .split(/[\s,]+/);
    for (const value of numbers) {
      expect(value).toMatch(/^-?\d+(\.\d)?$/);
    }
  });

  it('survives coincident endpoints', () => {
    const arc = flatArcGeometry({ from: LHR, to: LHR, project });
    expect(arc.d).toContain('Q');
    expect(arc.bulge).toBeCloseTo(14, 6);
  });
});

describe('flatArcBounds', () => {
  it('returns null without arcs', () => {
    expect(flatArcBounds([])).toBeNull();
  });

  it('covers the endpoints, the control point and the padding', () => {
    const arc = flatArcGeometry({ from: LHR, to: DXB, project, angle: 40 });
    const bounds = flatArcBounds([arc], 60)!;
    for (const [x, y] of [arc.from, arc.control, arc.to]) {
      expect(bounds.minX).toBeLessThanOrEqual(x - 0 + 0.0001);
      expect(bounds.maxX).toBeGreaterThanOrEqual(x);
      expect(bounds.minY).toBeLessThanOrEqual(y);
      expect(bounds.maxY).toBeGreaterThanOrEqual(y);
    }
    expect(bounds.minX).toBeCloseTo(Math.min(arc.from[0], arc.control[0], arc.to[0]) - 60, 6);
  });

  it('always contains the chord, whatever the angle', () => {
    const arc = flatArcGeometry({ from: LHR, to: DXB, project, angle: 60 });
    const bounds = flatArcBounds([arc])!;
    expect(bounds.minX).toBeLessThanOrEqual(Math.min(arc.from[0], arc.to[0]));
    expect(bounds.maxX).toBeGreaterThanOrEqual(Math.max(arc.from[0], arc.to[0]));
    expect(bounds.minY).toBeLessThanOrEqual(Math.min(arc.from[1], arc.to[1]));
    expect(bounds.maxY).toBeGreaterThanOrEqual(Math.max(arc.from[1], arc.to[1]));
  });
});
