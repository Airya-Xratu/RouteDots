/**
 * CityMarkersLayer — blinking circles at every airport city.
 *
 * Two `InstancedMesh`es (one draw call each, whatever the city count):
 *
 * - a solid dot per city that breathes between dim and full opacity,
 * - a ring per city that expands from the dot and fades out,
 *
 * both animated entirely on the GPU from a `uTime` uniform plus a
 * per-instance golden-ratio phase (`markers/blinkPattern.ts`), so a whole
 * country's cities never blink in unison and the CPU work per frame is a
 * single uniform write.
 *
 * Instances sit on the city shell of `LAYER_RADIUS` and keep depth testing,
 * so the opaque ocean sphere hides the far side for free.
 */
import * as THREE from 'three';
import { latLngToVec } from '../core/greatCircle.js';
import {
  DEFAULT_BLINK_PERIOD_MS,
  DEFAULT_DOT_DIM,
  DEFAULT_RING_GROW,
  DEFAULT_RING_OPACITY,
  blinkPhase,
} from '../markers/blinkPattern.js';
import { CITIES } from '../cities.js';
import type { City } from '../types.js';
import {
  CITY_DOT_FRAGMENT,
  CITY_DOT_VERTEX,
  CITY_RING_FRAGMENT,
  CITY_RING_VERTEX,
} from './cityShader.js';
import { LAYER_RADIUS } from './layerRadii.js';

/** Radius of the solid city dot, in globe radii. */
export const CITY_DOT_RADIUS = 0.006;
/** Inner / outer radius of the expanding city ring, in globe radii. */
export const CITY_RING_RADII: [number, number] = [0.0085, 0.011];

export interface CityMarkersLayerOptions {
  /** Cities to mark (default: the bundled {@link CITIES} dataset). */
  cities?: readonly City[];
  /** Marker colour (default '#39414e'). */
  color?: string;
  /** Shell radius in globe radii (default {@link LAYER_RADIUS.cities}). */
  radius?: number;
  /** Blink / pulse period in ms (default {@link DEFAULT_BLINK_PERIOD_MS}). */
  periodMs?: number;
}

const UP = new THREE.Vector3(0, 0, 1);

/** Oriented instance matrix placing a +Z-facing marker at a lat/lng point. */
export function cityInstanceMatrix(lat: number, lng: number, radius: number): THREE.Matrix4 {
  const [x, y, z] = latLngToVec(lat, lng, radius);
  const position = new THREE.Vector3(x, y, z);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, position.clone().normalize());
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
}

function phaseAttribute(count: number): THREE.InstancedBufferAttribute {
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = blinkPhase(i);
  return new THREE.InstancedBufferAttribute(phases, 1);
}

export class CityMarkersLayer {
  /** Breathing solid dots, one instance per city. */
  readonly dots: THREE.InstancedMesh;
  /** Expanding pulse rings, one instance per city. */
  readonly rings: THREE.InstancedMesh;
  /** Number of marked cities. */
  readonly count: number;

  private readonly dotMaterial: THREE.ShaderMaterial;
  private readonly ringMaterial: THREE.ShaderMaterial;
  private readonly dotTime: THREE.IUniform<number>;
  private readonly ringTime: THREE.IUniform<number>;
  private readonly dotColor: THREE.IUniform<THREE.Color>;
  private readonly ringColor: THREE.IUniform<THREE.Color>;

  constructor(parent: THREE.Object3D, options: CityMarkersLayerOptions = {}) {
    const cities = options.cities ?? CITIES;
    this.count = cities.length;
    const radius = options.radius ?? LAYER_RADIUS.cities;
    const periodSec = Math.max(1, options.periodMs ?? DEFAULT_BLINK_PERIOD_MS) / 1000;
    const color = new THREE.Color(options.color ?? '#39414e');

    const matrices = cities.map((city) => cityInstanceMatrix(city.lat, city.lng, radius));

    const dotTime: THREE.IUniform<number> = { value: 0 };
    this.dotTime = dotTime;
    const dotColor: THREE.IUniform<THREE.Color> = { value: color };
    this.dotColor = dotColor;
    this.dotMaterial = new THREE.ShaderMaterial({
      vertexShader: CITY_DOT_VERTEX,
      fragmentShader: CITY_DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: dotTime,
        uPeriod: { value: periodSec },
        uDim: { value: DEFAULT_DOT_DIM },
        uColor: dotColor,
      },
    });
    this.dots = new THREE.InstancedMesh(
      new THREE.CircleGeometry(CITY_DOT_RADIUS, 24),
      this.dotMaterial,
      this.count,
    );
    this.dots.geometry.setAttribute('aPhase', phaseAttribute(this.count));
    this.dots.frustumCulled = false;

    const ringTime: THREE.IUniform<number> = { value: 0 };
    this.ringTime = ringTime;
    const ringColor: THREE.IUniform<THREE.Color> = { value: color };
    this.ringColor = ringColor;
    this.ringMaterial = new THREE.ShaderMaterial({
      vertexShader: CITY_RING_VERTEX,
      fragmentShader: CITY_RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: ringTime,
        uPeriod: { value: periodSec },
        uGrow: { value: DEFAULT_RING_GROW },
        uPeakOpacity: { value: DEFAULT_RING_OPACITY },
        uColor: ringColor,
      },
    });
    this.rings = new THREE.InstancedMesh(
      new THREE.RingGeometry(CITY_RING_RADII[0], CITY_RING_RADII[1], 32),
      this.ringMaterial,
      this.count,
    );
    this.rings.geometry.setAttribute('aPhase', phaseAttribute(this.count));
    this.rings.frustumCulled = false;

    matrices.forEach((matrix, i) => {
      this.dots.setMatrixAt(i, matrix);
      this.rings.setMatrixAt(i, matrix);
    });
    this.dots.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;

    parent.add(this.dots, this.rings);
  }

  /** Advances the blink. `timeMs` is the frame timestamp. */
  update(timeMs: number): void {
    const seconds = timeMs / 1000;
    this.dotTime.value = seconds;
    this.ringTime.value = seconds;
  }

  /** Restyles the markers (theme switch). */
  setColor(color: string): void {
    const value = new THREE.Color(color);
    this.dotColor.value.copy(value);
    this.ringColor.value.copy(value);
  }

  dispose(): void {
    this.dots.removeFromParent();
    this.rings.removeFromParent();
    this.dots.geometry.dispose();
    this.rings.geometry.dispose();
    this.dotMaterial.dispose();
    this.ringMaterial.dispose();
  }
}
