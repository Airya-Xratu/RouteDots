import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CITIES } from '../../cities.js';
import { latLngToVec } from '../../core/greatCircle.js';
import { blinkPhase } from '../../markers/blinkPattern.js';
import { CityMarkersLayer, CITY_DOT_RADIUS, cityInstanceMatrix } from '../CityMarkersLayer.js';
import { LAYER_RADIUS } from '../layerRadii.js';

const uniformsOf = (mesh: THREE.InstancedMesh): Record<string, THREE.IUniform> =>
  (mesh.material as THREE.ShaderMaterial).uniforms;

const TEST_CITIES = [
  { code: 'AAA', name: 'A', country: 'X', lat: 10, lng: 20 },
  { code: 'BBB', name: 'B', country: 'X', lat: -30, lng: -40 },
  { code: 'CCC', name: 'C', country: 'X', lat: 0, lng: 0 },
];

describe('cityInstanceMatrix', () => {
  it('places the marker on the shell, oriented outward', () => {
    const matrix = cityInstanceMatrix(10, 20, LAYER_RADIUS.cities);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.length()).toBeCloseTo(LAYER_RADIUS.cities, 6);

    const expected = latLngToVec(10, 20, LAYER_RADIUS.cities);
    expect(position.x).toBeCloseTo(expected[0], 6);
    expect(position.y).toBeCloseTo(expected[1], 6);
    expect(position.z).toBeCloseTo(expected[2], 6);

    // Local +Z maps to the outward normal.
    const normal = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix).sub(position).normalize();
    expect(normal.dot(position.clone().normalize())).toBeCloseTo(1, 6);
  });
});

describe('CityMarkersLayer', () => {
  it('marks the bundled city dataset by default', () => {
    const parent = new THREE.Group();
    const layer = new CityMarkersLayer(parent);
    expect(layer.count).toBe(CITIES.length);
    expect(layer.dots.count).toBe(CITIES.length);
    expect(layer.rings.count).toBe(CITIES.length);
    expect(layer.dots.parent).toBe(parent);
    expect(layer.rings.parent).toBe(parent);
    layer.dispose();
  });

  it('builds one instance per city with golden-ratio phases', () => {
    const parent = new THREE.Group();
    const layer = new CityMarkersLayer(parent, { cities: TEST_CITIES });
    expect(layer.count).toBe(3);

    const phases = layer.dots.geometry.getAttribute('aPhase');
    for (let i = 0; i < 3; i++) {
      // Stored as a float32 instanced attribute — allow float32 rounding.
      expect(phases.getX(i)).toBeCloseTo(blinkPhase(i), 6);
    }
    // Both meshes share the same placement.
    const a = new THREE.Matrix4();
    const b = new THREE.Matrix4();
    layer.dots.getMatrixAt(1, a);
    layer.rings.getMatrixAt(1, b);
    expect(a.elements).toEqual(b.elements);

    layer.dispose();
    expect(layer.dots.parent).toBeNull();
    expect(layer.rings.parent).toBeNull();
  });

  it('advances the blink clock through one uniform per mesh', () => {
    const parent = new THREE.Group();
    const layer = new CityMarkersLayer(parent, { cities: TEST_CITIES, periodMs: 1000 });
    layer.update(2500);
    expect(uniformsOf(layer.dots).uTime!.value).toBeCloseTo(2.5, 9);
    expect(uniformsOf(layer.rings).uTime!.value).toBeCloseTo(2.5, 9);
    expect(uniformsOf(layer.dots).uPeriod!.value).toBeCloseTo(1, 9);
    layer.dispose();
  });

  it('restyles both meshes on theme switches', () => {
    const parent = new THREE.Group();
    const layer = new CityMarkersLayer(parent, { cities: TEST_CITIES, color: '#ff0000' });
    const colorOf = (mesh: THREE.InstancedMesh): string =>
      (uniformsOf(mesh).uColor!.value as THREE.Color).getHexString();
    expect(colorOf(layer.dots)).toBe('ff0000');
    layer.setColor('#00ff00');
    expect(colorOf(layer.dots)).toBe('00ff00');
    expect(colorOf(layer.rings)).toBe('00ff00');
    layer.dispose();
  });

  it('uses sane marker sizes', () => {
    expect(CITY_DOT_RADIUS).toBeGreaterThan(0);
    expect(CITY_DOT_RADIUS).toBeLessThan(0.01);
  });
});
