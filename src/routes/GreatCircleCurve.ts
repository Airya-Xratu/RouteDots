/**
 * three.js Curve implementation of a lifted, banked great-circle arc, for use
 * with TubeGeometry.
 *
 * The maths lives in `arcPath.ts` (`arcPoint`) so the tube, the plane flying
 * it and the flat world all share one definition: slerp along the great
 * circle, optionally banked about the chord by the arc's curve angle, scaled
 * out to `1 + lift·sin(πt)` — the classic airline-map bulge.
 */
import * as THREE from 'three';
import { latLngToVec, type Vec3 } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';
import { arcPoint } from './arcPath.js';

export class GreatCircleCurve extends THREE.Curve<THREE.Vector3> {
  readonly from: LatLon;
  readonly to: LatLon;
  readonly lift: number;
  readonly angle: number;

  private readonly va: Vec3;
  private readonly vb: Vec3;

  constructor(from: LatLon, to: LatLon, lift: number, angle = 0) {
    super();
    this.from = from;
    this.to = to;
    this.lift = lift;
    this.angle = angle;
    this.va = latLngToVec(from.lat, from.lng);
    this.vb = latLngToVec(to.lat, to.lng);
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const p = arcPoint(this.va, this.vb, t, { lift: this.lift, angle: this.angle });
    return target.set(p[0], p[1], p[2]);
  }
}
