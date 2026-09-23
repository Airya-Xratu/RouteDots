/**
 * BordersLayer — white country-border lines drawn on the map.
 *
 * The bundled world-atlas `countries-110m` topology is decoded once into
 * border polylines (shared TopoJSON arcs, so every border appears exactly
 * once) and lifted onto a sphere just above the country fills as a single
 * `LineSegments` draw call. Lines behind the globe are occluded by the
 * opaque sphere; lines are drawn below the route arcs.
 */
import * as THREE from 'three';
import { latLngToVec } from '../core/greatCircle.js';
import { decodeBorderArcs, type Ring } from '../core/topojson.js';
import countriesTopo from '../data/countries-110m.js';
import { LAYER_RADIUS } from './layerRadii.js';

export interface BordersLayerOptions {
  /** Line colour (default: the theme's border colour). */
  color?: string;
  /** Line opacity, 0..1 (default {@link DEFAULT_BORDER_OPACITY}). */
  opacity?: number;
  /** Sphere radius the lines sit on, in globe radii (default {@link DEFAULT_BORDER_RADIUS}). */
  radius?: number;
}

/** Radius the border lines are lifted to, as a fraction of the globe radius. */
export const DEFAULT_BORDER_RADIUS: number = LAYER_RADIUS.borders;

/** Border line opacity — white hairlines separating the grey country fills. */
export const DEFAULT_BORDER_OPACITY = 1;

/** Default border colour when no theme is in play. */
export const DEFAULT_BORDER_COLOR = '#ffffff';

/**
 * Converts border polylines ([lng, lat] rings) into a flat array of 3D line
 * segment vertices on a sphere of the given radius: one pair per segment.
 * Pure and unit-tested; the class below only wraps it in a `LineSegments`.
 */
export function borderSegments(rings: Ring[], radius = DEFAULT_BORDER_RADIUS): Float32Array {
  let segmentCount = 0;
  for (const ring of rings) segmentCount += Math.max(0, ring.length - 1);

  const positions = new Float32Array(segmentCount * 2 * 3);
  let offset = 0;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!;
      const b = ring[i]!;
      for (const [lng, lat] of [a, b]) {
        const [x, y, z] = latLngToVec(lat, lng, radius);
        positions[offset++] = x;
        positions[offset++] = y;
        positions[offset++] = z;
      }
    }
  }
  return positions;
}

/** Total number of line segments in a decoded border polyline set. */
export function countBorderSegments(rings: Ring[]): number {
  let count = 0;
  for (const ring of rings) count += Math.max(0, ring.length - 1);
  return count;
}

export class BordersLayer {
  /** Single draw call holding every border segment. */
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** Number of line segments drawn. */
  readonly segmentCount: number;

  constructor(parent: THREE.Object3D, options: BordersLayerOptions = {}) {
    const rings = decodeBorderArcs(countriesTopo);
    this.segmentCount = countBorderSegments(rings);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(borderSegments(rings, options.radius), 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: options.color ?? DEFAULT_BORDER_COLOR,
      transparent: true,
      opacity: options.opacity ?? DEFAULT_BORDER_OPACITY,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geometry, material);
    parent.add(this.lines);
  }

  /** Restyles the border colour (theme switch / palette updates). */
  setColor(color: string): void {
    this.lines.material.color.set(color);
  }

  /** Restyles the border opacity, 0..1. */
  setOpacity(opacity: number): void {
    this.lines.material.opacity = Math.min(1, Math.max(0, opacity));
    this.lines.material.transparent = this.lines.material.opacity < 1;
    this.lines.material.needsUpdate = true;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
