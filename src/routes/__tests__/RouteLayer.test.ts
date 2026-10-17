import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROUTE_THEMES, RouteLayer } from '../RouteLayer.js';
import { GreatCircleCurve } from '../GreatCircleCurve.js';
import { DEFAULT_OUTBOUND_LIFT } from '../RouteModel.js';

const LHR = { lat: 51.507, lng: -0.128 };
const DXB = { lat: 25.204, lng: 55.271 };
const SYD = { lat: -33.868, lng: 151.209 };
const CDG = { lat: 49.01, lng: 2.55 };

const meshesWith = (layer: RouteLayer, geometry: new () => THREE.BufferGeometry) =>
  layer.group.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.geometry.constructor === geometry,
  );

describe('RouteLayer painter ordering', () => {
  it('round trip (single edge): one tube at renderOrder 1, pulses at 3', () => {
    const layer = new RouteLayer(new THREE.Group(), { theme: 'light', pulse: true });
    layer.setRoute(LHR, DXB, true);

    const arcs = meshesWith(layer, THREE.TubeGeometry);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.renderOrder).toBe(1);

    const pulses = meshesWith(layer, THREE.RingGeometry);
    expect(pulses).toHaveLength(4);
    expect(pulses.every((m) => m.renderOrder === 3)).toBe(true);
  });

  it('dualEdge round trip: outbound (1) below return (2) below pulses (3)', () => {
    const layer = new RouteLayer(new THREE.Group(), {
      theme: 'light',
      pulse: true,
      dualEdge: true,
    });
    layer.setRoute(LHR, DXB, true);

    const arcs = meshesWith(layer, THREE.TubeGeometry);
    expect(arcs).toHaveLength(2);
    expect(arcs.map((m) => m.renderOrder).sort((a, b) => a - b)).toEqual([1, 2]);

    const pulses = meshesWith(layer, THREE.RingGeometry);
    expect(pulses).toHaveLength(4);
    expect(pulses.every((m) => m.renderOrder === 3)).toBe(true);
  });

  it('keeps arcs at 1 when there is no return leg', () => {
    const layer = new RouteLayer(new THREE.Group(), { pulse: false });
    layer.setRoute(LHR, DXB, false);
    const arcs = meshesWith(layer, THREE.TubeGeometry);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.renderOrder).toBe(1);
  });
});

describe('ROUTE_THEMES — lighter light-theme route colours', () => {
  it('uses the softened palette for outbound and return', () => {
    expect(ROUTE_THEMES.light.outbound.color).toBe('#4f5b6b');
    expect(ROUTE_THEMES.light.return.color).toBe('#8a94a6');
  });
});

describe('RouteLayer line widths', () => {
  it('builds a sane tube even when the width is authored in px', () => {
    // Regression: the docs / studio author `dash.width` (and `width`) in px —
    // fed straight into TubeGeometry as a globe-radius radius, `width: 1.8`
    // produced a tube 1.8× the planet and the lines vanished on the globe.
    const layer = new RouteLayer(new THREE.Group(), {
      theme: 'light',
      width: 1.8,
      dash: { width: 6 },
    });
    layer.setRoute(LHR, DXB, true);

    for (const arc of meshesWith(layer, THREE.TubeGeometry)) {
      arc.geometry.computeBoundingSphere();
      const radius = arc.geometry.boundingSphere!.radius;
      // The curve itself reaches ~1.2 globe radii; a sane tube adds < 0.01.
      expect(radius).toBeLessThan(1.5);
    }
    // `dash.width` intentionally wins over the path width when dashes are on.
    expect(layer.resolvedStyle.outbound.width).toBe(6);
  });
});

describe('RouteLayer dash spacing', () => {
  /** Dash uniforms of the first (and only) tube of a fresh layer. */
  const dashOf = (from: typeof LHR, to: typeof LHR) => {
    const layer = new RouteLayer(new THREE.Group(), { theme: 'light' });
    layer.setRoute(from, to, false);
    const arc = meshesWith(layer, THREE.TubeGeometry)[0]!;
    const uniforms = (arc.material as THREE.ShaderMaterial).uniforms;
    return {
      count: uniforms.uDashCount!.value as number,
      solid: uniforms.uDashSolid!.value as number,
      flow: uniforms.uFlow!.value as number,
      arcLength: new GreatCircleCurve(from, to, DEFAULT_OUTBOUND_LIFT).getLength(),
    };
  };

  it('gives a short hop and a long haul the same dash length', () => {
    const hop = dashOf(LHR, CDG);
    const haul = dashOf(LHR, SYD);
    // A world-unit pattern: the arc length decides the *number* of dashes…
    // (the lift bulges the short hop into a ~0.21-radius bump, so the two
    // routes differ ~13× rather than the 50× of their ground distances).
    expect(haul.arcLength).toBeGreaterThan(hop.arcLength * 10);
    expect(haul.count).toBeGreaterThan(hop.count * 10);
    // …so the dash period in globe radii is the same on both routes.
    const period = (d: { count: number; arcLength: number }) => d.arcLength / d.count;
    expect(period(haul)).toBeCloseTo(period(hop), 6);
    // Duty cycle and flow rate are identical too.
    expect(haul.solid).toBeCloseTo(hop.solid, 9);
    expect(haul.flow).toBeCloseTo(hop.flow, 9);
  });

  it('counts ~14 dashes on a quarter-globe route (the historical look)', () => {
    // LHR → SYD is roughly a quarter of the way round the planet.
    const haul = dashOf(LHR, SYD);
    const quarters = haul.arcLength / (Math.PI / 2);
    expect(haul.count / quarters).toBeCloseTo(14, 0);
  });
});
