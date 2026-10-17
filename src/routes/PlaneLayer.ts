/**
 * PlaneLayer — a plane icon that repeatedly flies the route arc.
 *
 * The sprite follows the same lifted *and banked* arc as the route tube
 * (plus a hair of clearance) through the shared `arcPoint` maths, is oriented
 * along its ground track by projecting the tangent into camera space, and is
 * hidden while the scheduler is in its pause phase.
 *
 * For **round-trip** routes (single-edge mode) the scheduler hands back both
 * a leg (`'outbound'` or `'return'`) and a progress, and the plane flies the
 * arc in that direction — no second tube. A `flightStateCallback` notifies
 * the RouteLayer each frame so the dash direction and trail mask track the
 * plane.
 *
 * The icon itself is a swappable component — see {@link PlaneIcon}: pass a
 * preset name, custom SVG path data, or your own canvas paint function.
 */
import * as THREE from 'three';
import { latLngToVec, vecToLatLng, type Vec3 } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';
import { arcPoint, type ArcShape } from './arcPath.js';
import { easeInOutCubic } from './easing.js';
import { PlaneIcon, type PlaneIconSource } from './PlaneIcon.js';
import { PlaneScheduler, type FlightLeg, type FlightProgress } from './PlaneScheduler.js';

export interface PlaneLayerOptions {
  /** Sprite size in globe units (default 0.024). */
  size?: number;
  /** Sprite colour (default #14161a). */
  color?: string;
  /** Clear the plane above the arc by this many globe radii (default 0.02). */
  clearance?: number;
  flightMs?: number;
  pauseMs?: number;
  /** Delay before the first flight in ms (default 0). */
  startDelayMs?: number;
  /** True for round-trip (outbound → pause → return → pause). */
  roundTrip?: boolean;
  /**
   * The airplane icon: a preset name (`'airliner'` | `'jet'` | `'arrow'` |
   * `'dot'`), SVG path data, a `PlaneIcon`, or a custom draw function.
   */
  icon?: PlaneIconSource;
}

/** Sprite texture size in px (the icon paints itself into this box). */
const TEXTURE_SIZE = 128;

export class PlaneLayer {
  readonly sprite: THREE.Sprite;

  private options: PlaneLayerOptions;
  private icon: PlaneIcon;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private scheduler: PlaneScheduler;
  private readonly clearance: number;
  private shape: ArcShape = { lift: 0, angle: 0 };
  private va: Vec3 | null = null;
  private vb: Vec3 | null = null;
  private anchorMs: number | null = null;
  private readonly tmp1 = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  /** Called every flying frame so the route layer can sync dashes/trail. */
  private onFlight?: (leg: FlightLeg, t: number) => void;

  constructor(parent: THREE.Object3D, options: PlaneLayerOptions = {}) {
    this.options = { ...options };
    this.clearance = options.clearance ?? 0.02;
    this.icon = PlaneIcon.from(options.icon);
    this.scheduler = new PlaneScheduler({
      flightMs: options.flightMs,
      pauseMs: options.pauseMs,
      startDelayMs: options.startDelayMs,
      roundTrip: options.roundTrip,
    });

    this.texture = new THREE.CanvasTexture(this.paintIcon());
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    const size = options.size ?? 0.024;
    this.sprite.scale.set(size, size, 1);
    // Painter order on the globe: borders 0 < outbound 1 < return 2 <
    // pulses 3 < plane 4 (see RouteLayer) — the plane always flies on top.
    this.sprite.renderOrder = 4;
    this.sprite.visible = false;
    parent.add(this.sprite);
  }

  /** Registers a callback invoked every frame with the plane's leg/progress. */
  setFlightStateCallback(cb: (leg: FlightLeg, t: number) => void): void {
    this.onFlight = cb;
  }

  /** The icon component in use. */
  get planeIcon(): PlaneIcon {
    return this.icon;
  }

  /** The arc the plane is currently flying. */
  get arcShape(): ArcShape {
    return { ...this.shape };
  }

  /**
   * Points the plane along the arc `from` → `to`.
   *
   * `shape` is either a bare lift (the historical signature) or a full
   * `{ lift, angle }` arc shape, so the plane flies the same curve as its
   * route tube.
   */
  setArc(
    from: LatLon,
    to: LatLon,
    shape: number | ArcShape,
    timeMs: number,
    opts: { roundTrip?: boolean } = {},
  ): void {
    this.shape = typeof shape === 'number' ? { lift: shape, angle: 0 } : { ...shape };
    this.va = latLngToVec(from.lat, from.lng);
    this.vb = latLngToVec(to.lat, to.lng);
    this.anchorMs = timeMs;
    this.scheduler = new PlaneScheduler({
      flightMs: this.options.flightMs,
      pauseMs: this.options.pauseMs,
      startDelayMs: this.options.startDelayMs,
      roundTrip: opts.roundTrip ?? this.options.roundTrip,
    });
    this.scheduler.reset(timeMs);
  }

  /** Swaps the icon component (rebuilds the sprite texture). */
  setIcon(source: PlaneIconSource | undefined): void {
    this.options.icon = source;
    this.icon = PlaneIcon.from(source);
    this.texture.image = this.paintIcon();
    this.texture.needsUpdate = true;
    this.material.needsUpdate = true;
  }

  /** Restyles / retimes the plane in place (showcase sliders, theme switch). */
  applyStyle(options: Partial<PlaneLayerOptions>): void {
    const next = { ...this.options, ...options };
    const iconChanged = next.icon !== this.options.icon || next.color !== this.options.color;
    const timingChanged =
      next.flightMs !== this.options.flightMs ||
      next.pauseMs !== this.options.pauseMs ||
      next.startDelayMs !== this.options.startDelayMs ||
      next.roundTrip !== this.options.roundTrip;
    this.options = next;
    if (iconChanged) this.setIcon(next.icon);
    if (next.size !== undefined) this.sprite.scale.set(next.size, next.size, 1);
    if (timingChanged) {
      this.scheduler = new PlaneScheduler({
        flightMs: next.flightMs,
        pauseMs: next.pauseMs,
        startDelayMs: next.startDelayMs,
        roundTrip: next.roundTrip,
      });
      if (this.anchorMs !== null) this.scheduler.reset(this.anchorMs);
    }
  }

  private lastProgress: FlightProgress | null = null;
  private lastGround: LatLon | null = null;

  /** Route progress of the last frame, or null while paused/delayed. */
  getProgress(): number | null {
    return this.lastProgress && !this.lastProgress.paused ? this.lastProgress.t : null;
  }

  /** Current flight leg (useful for camera logic during return flights). */
  getCurrentLeg(): FlightLeg | null {
    return this.lastProgress ? this.lastProgress.leg : null;
  }

  /**
   * Ground position (lat/lng) of the plane's last frame — held during the
   * pause phase so camera tracking doesn't jump — or null before the first
   * flight.
   */
  getGroundPosition(): LatLon | null {
    return this.lastGround ? { ...this.lastGround } : null;
  }

  /** Advances the plane. `timeMs` is the frame timestamp. */
  update(timeMs: number, camera: THREE.Camera): void {
    if (!this.va || !this.vb) return;
    const state = this.scheduler.progress(timeMs);
    this.lastProgress = state;
    if (state === null || state.paused) {
      this.sprite.visible = false;
      // During destination pause, snap the trail to full for a moment so the
      // outbound line stays whole; at origin pause we likewise reveal the
      // return tube fully. But we simply leave the trail at its last value
      // (1 at the end of a leg) which is correct.
      return;
    }

    const t = easeInOutCubic(state.t);
    // For the return leg we fly the curve backwards: sample at 1 - t on the
    // A→B arc to get B→A without building a second curve.
    const param = state.leg === 'return' ? 1 - t : t;

    const shape: ArcShape = {
      lift: (this.shape.lift ?? 0) + this.clearance,
      angle: this.shape.angle,
    };
    const s = arcPoint(this.va, this.vb, param, shape);
    this.sprite.position.set(s[0], s[1], s[2]);
    this.lastGround = vecToLatLng([s[0], s[1], s[2]]);
    this.sprite.visible = true;

    // Notify the route layer so it can flip dashes / trail.
    this.onFlight?.(state.leg, state.t);

    // Heading: project a short tangent into camera space.
    const eps = 0.002;
    const paramAhead = Math.min(1, param + (state.leg === 'return' ? -eps : eps));
    const paramAheadClamped = Math.max(0, Math.min(1, paramAhead));
    const s2 = arcPoint(this.va, this.vb, paramAheadClamped, shape);
    this.tmp1.copy(this.sprite.position);
    this.tmp2.set(s2[0], s2[1], s2[2]);
    const c1 = this.tmp1.clone().applyMatrix4(camera.matrixWorldInverse);
    const c2 = this.tmp2.clone().applyMatrix4(camera.matrixWorldInverse);
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    if (Math.hypot(dx, dy) > 1e-6) {
      // texture nose points up (+y): rotation = direction - 90°
      this.material.rotation = Math.atan2(dy, dx) - Math.PI / 2;
    }
  }

  /** Forgets the current arc; the plane hides until a new arc is set. */
  clear(): void {
    this.va = null;
    this.vb = null;
    this.anchorMs = null;
    this.lastProgress = null;
    this.lastGround = null;
    this.sprite.visible = false;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.map?.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  /** Paints the icon component into a square canvas for the sprite texture. */
  private paintIcon(): HTMLCanvasElement {
    return this.icon.toCanvas({ size: TEXTURE_SIZE, color: this.options.color ?? '#14161a' });
  }
}
