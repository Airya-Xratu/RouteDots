import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROUTE_THEMES, RouteLayer } from '../RouteLayer.js';

const LHR = { lat: 51.507, lng: -0.128 };
const DXB = { lat: 25.204, lng: 55.271 };

const meshesWith = (layer: RouteLayer, geometry: new () => THREE.BufferGeometry) =>
  layer.group.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.geometry.constructor === geometry,
  );

describe('RouteLayer painter ordering', () => {
  it('stacks outbound (1) below return (2) below pulses (3)', () => {
    const layer = new RouteLayer(new THREE.Group(), { theme: 'light', pulse: true });
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
