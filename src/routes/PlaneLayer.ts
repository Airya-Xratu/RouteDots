/**
 * PlaneLayer — a small plane sprite that repeatedly flies the outbound arc.
 *
 * The sprite follows the same lifted great circle as the outbound tube
 * (plus a hair of clearance), is oriented along its ground track by
 * projecting the tangent into camera space, and is hidden while the
 * scheduler is in its pause phase.
 */
import * as THREE from 'three';
import { latLngToVec, slerp, type Vec3 } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';
import { easeInOutCubic } from './easing.js';
import { PlaneScheduler } from './PlaneScheduler.js';
import { drawPlane } from './planeSilhouette.js';

export interface PlaneLayerOptions {
  /** Sprite size in globe units (default 0.024). */
  size?: number;
  /** Sprite colour (default #14161a). */
  color?: string;
  /** Clear the plane above the arc by this many globe radii (default 0.02). */
  clearance?: number;
  flightMs?: number;
  pauseMs?: number;
  /** Delay before the first flight (ms, default 0). */
  startDelayMs?: number;
}

export class PlaneLayer {
  readonly sprite: THREE.Sprite;

  private readonly scheduler: PlaneScheduler;
  private readonly clearance: number;
  private from: LatLon | null = null;
  private to: LatLon | null = null;
  private lift = 0;
  private va: Vec3 | null = null;
  private vb: Vec3 | null = null;
  private readonly tmp1 = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(parent: THREE.Object3D, options: PlaneLayerOptions = {}) {
    this.clearance = options.clearance ?? 0.02;
    this.scheduler = new PlaneScheduler({
      flightMs: options.flightMs,
      pauseMs: options.pauseMs,
      startDelayMs: options.startDelayMs,
    });

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PlaneLayer: 2D canvas context unavailable');
    ctx.translate(64, 64);
    drawPlane(ctx, 92, options.color ?? '#14161a');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    const size = options.size ?? 0.024;
    this.sprite.scale.set(size, size, 1);
    // Painter order on the globe: borders 0 < outbound 1 < return 2 <
    // pulses 3 < plane 4 (see RouteLayer) — the plane always flies on top.
    this.sprite.renderOrder = 4;
    this.sprite.visible = false;
    parent.add(this.sprite);
  }

  /** Points the plane along the arc `from` → `to` (with `lift`). */
  setArc(from: LatLon, to: LatLon, lift: number, timeMs: number): void {
    this.from = from;
    this.to = to;
    this.lift = lift;
    this.va = latLngToVec(from.lat, from.lng);
    this.vb = latLngToVec(to.lat, to.lng);
    this.scheduler.reset(timeMs);
  }

  private lastProgress: number | null = null;

  /** Route progress of the last frame: 0→1 while flying, null while paused. */
  getProgress(): number | null {
    return this.lastProgress;
  }

  /** Advances the plane. `timeMs` is the frame timestamp. */
  update(timeMs: number, camera: THREE.Camera): void {
    if (!this.from || !this.to || !this.va || !this.vb) return;
    // Scheduler stays linear; easing shapes the *motion* (gentle take-off
    // and landing), not the fly/pause timing.
    const raw = this.scheduler.progress(timeMs);
    this.lastProgress = raw;
    if (raw === null) {
      this.sprite.visible = false;
      return;
    }
    const t = easeInOutCubic(raw);

    const s = slerp(this.va, this.vb, t);
    const f = 1 + (this.lift + this.clearance) * Math.sin(Math.PI * t);
    this.sprite.position.set(s[0] * f, s[1] * f, s[2] * f);
    this.sprite.visible = true;

    // Heading: project a short tangent into camera space.
    const eps = 0.002;
    const s2 = slerp(this.va, this.vb, Math.min(1, t + eps));
    const f2 = 1 + (this.lift + this.clearance) * Math.sin(Math.PI * Math.min(1, t + eps));
    this.tmp1.copy(this.sprite.position);
    this.tmp2.set(s2[0] * f2, s2[1] * f2, s2[2] * f2);
    // world positions (globe group is at the origin, no transform)
    const c1 = this.tmp1.clone().applyMatrix4(camera.matrixWorldInverse);
    const c2 = this.tmp2.clone().applyMatrix4(camera.matrixWorldInverse);
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    if (Math.hypot(dx, dy) > 1e-6) {
      // texture nose points up (+y): rotation = direction - 90°
      (this.sprite.material as THREE.SpriteMaterial).rotation = Math.atan2(dy, dx) - Math.PI / 2;
    }
  }

  /** Forgets the current arc; the plane hides until a new arc is set. */
  clear(): void {
    this.from = null;
    this.to = null;
    this.va = null;
    this.vb = null;
    this.lastProgress = null;
    this.sprite.visible = false;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    const material = this.sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
