/**
 * CityMarkersLayer — the blinking city dots and their ripple rings.
 *
 * Two `InstancedMesh`es (one draw call each, whatever the city count):
 *
 * - a solid dot per city that breathes between dim and full opacity,
 * - a **ripple** ring per city that expands from the dot and fades out,
 *
 * both animated entirely on the GPU from a `uTime` uniform plus a
 * per-instance golden-ratio phase (`markers/blinkPattern.ts`), so a whole
 * country's cities never blink in unison and the CPU work per frame is a
 * single uniform write.
 *
 * Every ripple parameter is the developer's: colour, ring radius, ring
 * thickness, how far the ring grows, how opaque it peaks, the cycle period
 * and the dot's radius / dim floor (`markers/rippleStyle.ts`). `applyStyle()`
 * restyles the markers live — the same numbers drive the flat world's SVG
 * ripples, so both modes match.
 *
 * Instances sit on the city shell of `LAYER_RADIUS` and keep depth testing,
 * so the opaque ocean sphere hides the far side for free.
 */
import * as THREE from 'three';
import { latLngToVec } from '../core/greatCircle.js';
import { blinkPhase } from '../markers/blinkPattern.js';
import {
  DEFAULT_CITY_DOT_RADIUS,
  DEFAULT_CITY_RING_RADII,
  resolveCityMarkers,
  type CityMarkersOptions,
  type ResolvedCityMarkers,
} from '../markers/rippleStyle.js';
import { CITIES } from '../cities.js';
import type { City } from '../types.js';
import {
  CITY_DOT_FRAGMENT,
  CITY_DOT_VERTEX,
  CITY_RING_FRAGMENT,
  CITY_RING_VERTEX,
} from './cityShader.js';
import { LAYER_RADIUS } from './layerRadii.js';

/** Radius of the solid city dot, in globe radii (the default). */
export const CITY_DOT_RADIUS = DEFAULT_CITY_DOT_RADIUS;
/** Inner / outer radius of the expanding city ring, in globe radii (the defaults). */
export const CITY_RING_RADII: [number, number] = DEFAULT_CITY_RING_RADII;

export interface CityMarkersLayerOptions extends CityMarkersOptions {
  /** Cities to mark (default: the bundled {@link CITIES} dataset). */
  cities?: readonly City[];
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

  private options: CityMarkersLayerOptions;
  private style: ResolvedCityMarkers;
  private readonly parent: THREE.Object3D;
  private readonly cities: readonly City[];
  private dotMaterial!: THREE.ShaderMaterial;
  private ringMaterial!: THREE.ShaderMaterial;
  private dotTime: THREE.IUniform<number> = { value: 0 };
  private ringTime: THREE.IUniform<number> = { value: 0 };
  private dotColor: THREE.IUniform<THREE.Color> = { value: new THREE.Color() };
  private ringColor: THREE.IUniform<THREE.Color> = { value: new THREE.Color() };

  constructor(parent: THREE.Object3D, options: CityMarkersLayerOptions = {}) {
    this.parent = parent;
    this.options = { ...options };
    this.cities = options.cities ?? CITIES;
    this.count = this.cities.length;
    const color = options.color ?? '#39414e';
    this.style = resolveCityMarkers(options, color);

    const built = this.build();
    this.dots = built.dots;
    this.rings = built.rings;
  }

  /** The resolved marker style in use (dot + ripple numbers). */
  get resolvedStyle(): ResolvedCityMarkers {
    return this.style;
  }

  /** Advances the blink. `timeMs` is the frame timestamp. */
  update(timeMs: number): void {
    const seconds = timeMs / 1000;
    this.dotTime.value = seconds;
    this.ringTime.value = seconds;
  }

  /** Restyles the markers (theme switch). */
  setColor(color: string): void {
    this.options.color = color;
    this.style = resolveCityMarkers(this.options, color);
    this.dotColor.value.set(this.style.dot.color);
    this.ringColor.value.set(this.style.ripple.color);
  }

  /** Applies new marker options live (sizes, period, ripple tuning…). */
  applyStyle(options: Partial<CityMarkersLayerOptions>): ResolvedCityMarkers {
    this.options = { ...this.options, ...options };
    this.style = resolveCityMarkers(this.options, this.options.color ?? '#39414e');
    this.dots.visible = this.style.dot.enabled;
    this.rings.visible = this.style.ripple.enabled;
    this.dotColor.value.set(this.style.dot.color);
    this.ringColor.value.set(this.style.ripple.color);

    const dotUniforms = this.dotMaterial.uniforms;
    dotUniforms.uPeriod!.value = this.style.ripple.periodMs / 1000;
    dotUniforms.uDim!.value = this.style.dot.dim;
    const ringUniforms = this.ringMaterial.uniforms;
    ringUniforms.uPeriod!.value = this.style.ripple.periodMs / 1000;
    ringUniforms.uGrow!.value = this.style.ripple.grow;
    ringUniforms.uPeakOpacity!.value = this.style.ripple.opacity;

    // Sizes are baked into the geometry — rebuild when they changed.
    const size = this.style.dot.size;
    const inner = this.style.ripple.inner;
    const outer = this.style.ripple.size;
    if (
      (this.dots.geometry as THREE.CircleGeometry).parameters?.radius !== size ||
      (this.rings.geometry as THREE.RingGeometry).parameters?.innerRadius !== inner ||
      (this.rings.geometry as THREE.RingGeometry).parameters?.outerRadius !== outer
    ) {
      this.rebuildMeshes();
    }
    return this.style;
  }

  dispose(): void {
    this.disposeMeshes();
  }

  /** Builds both instanced meshes and attaches them to the parent. */
  private build(): {
    dots: THREE.InstancedMesh;
    rings: THREE.InstancedMesh;
  } {
    const radius = this.style.radius ?? LAYER_RADIUS.cities;
    const seconds = this.style.ripple.periodMs / 1000;
    const matrices = this.cities.map((city) => cityInstanceMatrix(city.lat, city.lng, radius));

    this.dotTime = { value: 0 };
    this.dotColor = { value: new THREE.Color(this.style.dot.color) };
    this.dotMaterial = new THREE.ShaderMaterial({
      vertexShader: CITY_DOT_VERTEX,
      fragmentShader: CITY_DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: this.dotTime,
        uPeriod: { value: seconds },
        uDim: { value: this.style.dot.dim },
        uColor: this.dotColor,
      },
    });
    const dots = new THREE.InstancedMesh(
      new THREE.CircleGeometry(this.style.dot.size, 24),
      this.dotMaterial,
      this.count,
    );
    dots.geometry.setAttribute('aPhase', phaseAttribute(this.count));
    dots.frustumCulled = false;
    dots.visible = this.style.dot.enabled;

    this.ringTime = { value: 0 };
    this.ringColor = { value: new THREE.Color(this.style.ripple.color) };
    this.ringMaterial = new THREE.ShaderMaterial({
      vertexShader: CITY_RING_VERTEX,
      fragmentShader: CITY_RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: this.ringTime,
        uPeriod: { value: seconds },
        uGrow: { value: this.style.ripple.grow },
        uPeakOpacity: { value: this.style.ripple.opacity },
        uColor: this.ringColor,
      },
    });
    const rings = new THREE.InstancedMesh(
      new THREE.RingGeometry(this.style.ripple.inner, this.style.ripple.size, 48),
      this.ringMaterial,
      this.count,
    );
    rings.geometry.setAttribute('aPhase', phaseAttribute(this.count));
    rings.frustumCulled = false;
    rings.visible = this.style.ripple.enabled;

    matrices.forEach((matrix, i) => {
      dots.setMatrixAt(i, matrix);
      rings.setMatrixAt(i, matrix);
    });
    dots.instanceMatrix.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = true;

    this.parent.add(dots, rings);
    return { dots, rings };
  }

  /** Rebuilds the geometries whose sizes changed (instance transforms kept). */
  private rebuildMeshes(): void {
    this.dots.geometry.dispose();
    this.dots.geometry = new THREE.CircleGeometry(this.style.dot.size, 24);
    this.dots.geometry.setAttribute('aPhase', phaseAttribute(this.count));
    this.rings.geometry.dispose();
    this.rings.geometry = new THREE.RingGeometry(
      this.style.ripple.inner,
      this.style.ripple.size,
      48,
    );
    this.rings.geometry.setAttribute('aPhase', phaseAttribute(this.count));
  }

  private disposeMeshes(): void {
    this.dots.removeFromParent();
    this.rings.removeFromParent();
    this.dots.geometry.dispose();
    this.rings.geometry.dispose();
    this.dotMaterial.dispose();
    this.ringMaterial.dispose();
  }
}
