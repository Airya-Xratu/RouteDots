/**
 * Horizon-aware camera tracking: while a route is set, the camera eases back
 * toward the plane whenever the plane leaves the visible disc.
 *
 * Pure state machine — no three.js, no clock access (time enters as explicit
 * `dtSec`), fully unit-testable. The caller (RouteDots) applies the returned
 * camera state and forwards the suggested auto-rotation flag.
 *
 * Semantics:
 * - "Visible disc" = the spherical cap around the camera's sub-point out to
 *   the horizon for the current camera altitude, minus a safety margin so
 *   the plane is re-centred before it can slip behind the limb.
 * - Idle auto-rotation is suggested OFF while a route is set.
 * - User control always wins: while the user drags or a `setView` tween is
 *   running, the tracker neither moves the camera nor fights the rotation
 *   state — it just reports.
 */
import { angularDistance, DEG } from '../core/greatCircle.js';
import { lngDelta, type ViewState } from '../globe/cameraRig.js';
import type { LatLon } from '../types.js';

export interface CameraTrackingOptions {
  /** Degrees subtracted from the visible horizon (default 5). */
  marginDeg?: number;
  /** Chase strength: fraction per second, `1 - e^(-k·dt)` (default 2.5). */
  easePerSecond?: number;
}

export interface TrackingInput {
  /** Current camera state. */
  camera: ViewState;
  /** The plane's current ground position. */
  plane: LatLon;
  /** Frame delta in seconds (non-negative). */
  dtSec: number;
  /** A route is set — tracking is engaged and idle rotation pauses. */
  routeActive: boolean;
  /** The user is dragging or a `setView` tween is running — they win. */
  userControlled: boolean;
}

export interface TrackingStep {
  /** Camera state to apply this frame (unchanged when not adjusted). */
  camera: ViewState;
  /** Tracking is engaged: a route is set and the user is not in control. */
  tracking: boolean;
  /** The camera moved toward the plane this frame. */
  adjusted: boolean;
  /** Suggested idle auto-rotation state (off while a route is set). */
  autoRotate: boolean;
}

/** Angular radius (degrees) of the cap visible from a camera at `altitude` globe radii. */
export function visibleHorizonDeg(altitude: number): number {
  if (!Number.isFinite(altitude) || altitude <= 1) return 0;
  return Math.acos(1 / altitude) / DEG;
}

/**
 * Tracking threshold: the visible horizon for the camera altitude minus a
 * margin (default 5°), clamped to a small positive floor.
 */
export function trackingThresholdDeg(altitude: number, marginDeg = 5): number {
  return Math.max(1, visibleHorizonDeg(altitude) - marginDeg);
}

const DEFAULT_EASE_PER_SECOND = 2.5;

/**
 * Computes one tracking step.
 *
 * When the route is active, the user is not in control, and the plane sits
 * outside the threshold disc, the camera eases toward the plane by
 * `1 - e^(-k·dt)` (shortest way around for longitude), keeping its altitude.
 */
export function trackCamera(
  input: TrackingInput,
  options: CameraTrackingOptions = {},
): TrackingStep {
  const { camera, plane, dtSec, routeActive, userControlled } = input;
  const marginDeg = options.marginDeg ?? 5;
  const easePerSecond = options.easePerSecond ?? DEFAULT_EASE_PER_SECOND;

  // Idle auto-rotation only makes sense without a route to follow.
  if (!routeActive) {
    return { camera, tracking: false, adjusted: false, autoRotate: true };
  }

  if (userControlled) {
    return { camera, tracking: false, adjusted: false, autoRotate: false };
  }

  const thresholdDeg = trackingThresholdDeg(camera.altitude, marginDeg);
  const separationDeg = angularDistance(camera, plane) / DEG;
  if (separationDeg <= thresholdDeg || dtSec <= 0) {
    return { camera, tracking: true, adjusted: false, autoRotate: false };
  }

  // Ease the camera back toward the plane (altitude unchanged), taking the
  // shortest way around for longitude.
  const k = 1 - Math.exp(-easePerSecond * dtSec);
  const next: ViewState = {
    lat: camera.lat + (plane.lat - camera.lat) * k,
    lng: ((camera.lng + lngDelta(camera.lng, plane.lng) * k + 540) % 360) - 180,
    altitude: camera.altitude,
  };
  return { camera: next, tracking: true, adjusted: true, autoRotate: false };
}
