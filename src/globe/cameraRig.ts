/**
 * Pure camera state machine for the globe: current point of view, auto
 * rotation, and tweened transitions between views. No three.js, no DOM —
 * fully unit-testable.
 */
import { latLngToVec, type Vec3 } from '../core/greatCircle.js';

export interface ViewState {
  /** Camera latitude in degrees (clamped to ±89.9). */
  lat: number;
  /** Camera longitude in degrees. */
  lng: number;
  /** Camera altitude as a multiple of the globe radius (min 1.05). */
  altitude: number;
}

export interface TweenOptions {
  /** Duration in ms (default 1200). */
  durationMs?: number;
}

export interface CameraRigOptions {
  initial: ViewState;
  /** Auto-rotation speed in degrees of longitude per second (default 0). */
  autoRotateSpeed?: number;
  /** Min / max altitude (defaults 1.05 / 4). */
  minAltitude?: number;
  maxAltitude?: number;
}

const MIN_LAT = -89.9;
const MAX_LAT = 89.9;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Shortest signed angular difference a→b in degrees (result in (-180, 180]). */
export function lngDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

/**
 * Holds the camera point of view and advances it over time (auto-rotation and
 * tweens). All time parameters are explicit so the rig is deterministic in
 * tests.
 */
export class CameraRig {
  private _state: ViewState;
  private readonly minAltitude: number;
  private readonly maxAltitude: number;
  private autoRotateSpeed: number;
  private autoRotateEnabled: boolean;

  private tweenStart: ViewState | null = null;
  private tweenTarget: ViewState | null = null;
  private tweenLngSpan = 0;
  private tweenStartMs = 0;
  private tweenDurationMs = 0;

  constructor(options: CameraRigOptions) {
    this.minAltitude = options.minAltitude ?? 1.05;
    this.maxAltitude = options.maxAltitude ?? 4;
    this.autoRotateSpeed = options.autoRotateSpeed ?? 0;
    this.autoRotateEnabled = this.autoRotateSpeed > 0;
    this._state = this.sanitized(options.initial);
  }

  get state(): ViewState {
    return { ...this._state };
  }

  private sanitized(v: ViewState): ViewState {
    return {
      lat: clamp(v.lat, MIN_LAT, MAX_LAT),
      lng: ((v.lng + 540) % 360) - 180,
      altitude: clamp(v.altitude, this.minAltitude, this.maxAltitude),
    };
  }

  setAutoRotate(enabled: boolean): void {
    this.autoRotateEnabled = enabled && this.autoRotateSpeed > 0;
  }

  isAutoRotating(): boolean {
    return this.autoRotateEnabled && !this.tweenActive;
  }

  /** Jumps to `view` immediately (cancels any running tween). */
  snapTo(view: ViewState): void {
    this._state = this.sanitized(view);
    this.tweenStart = null;
    this.tweenTarget = null;
  }

  /** Starts a tween toward `target`. `nowMs` is the current timestamp. */
  startTween(target: ViewState, nowMs: number, options: TweenOptions = {}): void {
    const from = this._state;
    const to = this.sanitized(target);
    this.tweenStart = { ...from };
    this.tweenTarget = to;
    this.tweenLngSpan = lngDelta(from.lng, to.lng);
    this.tweenStartMs = nowMs;
    this.tweenDurationMs = Math.max(1, options.durationMs ?? 1200);
  }

  get tweenActive(): boolean {
    return this.tweenStart !== null && this.tweenTarget !== null;
  }

  /**
   * Advances the rig by `dtSec`. Returns true when a tween is in progress.
   * Call once per animation frame.
   */
  update(dtSec: number, nowMs: number): boolean {
    if (this.tweenStart && this.tweenTarget) {
      const t = (nowMs - this.tweenStartMs) / this.tweenDurationMs;
      if (t >= 1) {
        this._state = { ...this.tweenTarget };
        this.tweenStart = null;
        this.tweenTarget = null;
      } else {
        const k = easeOutCubic(t);
        const from = this.tweenStart;
        const to = this.tweenTarget;
        this._state = {
          lat: from.lat + (to.lat - from.lat) * k,
          lng: ((from.lng + this.tweenLngSpan * k + 540) % 360) - 180,
          altitude: from.altitude + (to.altitude - from.altitude) * k,
        };
      }
      return true;
    }
    if (this.autoRotateEnabled && dtSec > 0) {
      this._state.lng = ((this._state.lng + this.autoRotateSpeed * dtSec + 540) % 360) - 180;
    }
    return false;
  }

  /** World-space camera position for a globe of radius `r`. */
  position(r = 1): Vec3 {
    return latLngToVec(this._state.lat, this._state.lng, r * this._state.altitude);
  }
}
