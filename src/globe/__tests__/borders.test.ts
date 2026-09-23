import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { latLngToVec } from '../../core/greatCircle.js';
import countries from '../../data/countries-110m.js';
import {
  BordersLayer,
  DEFAULT_BORDER_OPACITY,
  borderSegments,
  countBorderSegments,
} from '../BordersLayer.js';
import { LAYER_RADIUS } from '../layerRadii.js';
import { decodeBorderArcs, type Ring } from '../../core/topojson.js';

const TRIANGLE: Ring = [
  [0, 0],
  [90, 0],
  [0, 90],
];

describe('countBorderSegments', () => {
  it('counts one segment per consecutive pair', () => {
    expect(countBorderSegments([TRIANGLE])).toBe(2);
    expect(countBorderSegments([TRIANGLE, TRIANGLE])).toBe(4);
    expect(countBorderSegments([])).toBe(0);
    expect(countBorderSegments([[[1, 1]]])).toBe(0); // single point
  });
});

describe('borderSegments', () => {
  it('emits two vertices per segment, on the requested sphere radius', () => {
    const radius = 1.002;
    const positions = borderSegments([TRIANGLE], radius);
    expect(positions).toHaveLength(2 * 2 * 3);

    for (let v = 0; v < positions.length / 3; v++) {
      const x = positions[v * 3]!;
      const y = positions[v * 3 + 1]!;
      const z = positions[v * 3 + 2]!;
      expect(Math.hypot(x, y, z)).toBeCloseTo(radius, 6); // float32 storage
    }

    // First segment starts at lng 0, lat 0.
    const expected = latLngToVec(0, 0, radius);
    for (let i = 0; i < 3; i++) {
      expect(positions[i]).toBeCloseTo(expected[i]!, 6);
    }
  });

  it('chains consecutive segments (ring i end == ring i+1 start)', () => {
    const positions = borderSegments([TRIANGLE], 1);
    const end = positions.slice(3, 6);
    const start = positions.slice(6, 9);
    expect([...end]).toEqual([...start]);
  });
});

describe('BordersLayer — bundled countries', () => {
  const rings = decodeBorderArcs(countries);

  it('builds one LineSegments draw call with every border segment', () => {
    const parent = new THREE.Group();
    const layer = new BordersLayer(parent, { color: '#ff0000', opacity: 0.4 });

    expect(layer.segmentCount).toBe(countBorderSegments(rings));
    expect(layer.segmentCount).toBeGreaterThan(5000);

    const attr = layer.lines.geometry.getAttribute('position');
    expect(attr.count).toBe(layer.segmentCount * 2);
    expect(layer.lines.material.color.getHexString()).toBe('ff0000');
    expect(layer.lines.material.opacity).toBe(0.4);
    expect(layer.lines.material.transparent).toBe(true);
    expect(layer.lines.parent).toBe(parent);

    layer.dispose();
    expect(layer.lines.parent).toBeNull();
  });

  it('uses the defaults when no options are given', () => {
    const layer = new BordersLayer(new THREE.Group());
    // White hairlines at full opacity, lifted just above the country fills.
    expect(layer.lines.material.color.getHexString()).toBe('ffffff');
    expect(layer.lines.material.opacity).toBe(DEFAULT_BORDER_OPACITY);
    const positions = layer.lines.geometry.getAttribute('position');
    expect(Math.hypot(positions.getX(0), positions.getY(0), positions.getZ(0))).toBeCloseTo(
      LAYER_RADIUS.borders,
      6,
    );
    layer.dispose();
  });
});
