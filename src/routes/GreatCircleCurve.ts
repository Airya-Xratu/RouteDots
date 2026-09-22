/**
 * three.js Curve implementation of a lifted great-circle arc, for use with
 * TubeGeometry. Evaluates the same math as `greatCircleArc` (slerp +
 * 1 + lift·sin(πt) radius) directly, without sampling an array.
 */
import * as THREE from 'three';
import { latLngToVec, slerp, type Vec3 } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';

export class GreatCircleCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    readonly from: LatLon,
    readonly to: LatLon,
    readonly lift: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const p: Vec3 = slerp(
      latLngToVec(this.from.lat, this.from.lng),
      latLngToVec(this.to.lat, this.to.lng),
      t,
    );
    const f = 1 + this.lift * Math.sin(Math.PI * t);
    return target.set(p[0] * f, p[1] * f, p[2] * f);
  }
}
