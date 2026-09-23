/**
 * Pure geometry for the flat world's route arcs.
 *
 * The flat map draws each leg as a quadratic Bézier: the control point sits a
 * perpendicular `bulge` away from the chord, rotated out of the straight
 * perpendicular by the leg's **curve angle** — so the flat world bends exactly
 * where the globe bends (the angle is measured in each leg's own travel
 * direction, which is why a round trip's two arcs lean mirror-symmetrically,
 * just as they do on the sphere).
 *
 * The bulge keeps the historical flat-map look (`max(14, chord · 0.28)`), with
 * the return leg bulging 25 % more — the flat-world twin of the globe's
 * higher return lift.
 *
 * Pure: the projection is injected, so this is unit-testable in Node.
 */
import { DEG } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';
import { normalizeArcAngleDeg } from '../routes/arcPath.js';

/** A quadratic arc in map pixel space. */
export interface FlatArcGeometry {
  /** SVG path data: `M x1 y1 Q cx cy x2 y2`. */
  d: string;
  /** Start / control / end points in map px. */
  from: [number, number];
  control: [number, number];
  to: [number, number];
  /** Perpendicular distance from the chord to the control point, in px. */
  bulge: number;
  /** Curve angle actually applied, in degrees. */
  angle: number;
}

export interface FlatArcInput {
  from: LatLon;
  to: LatLon;
  /** lat/lng → map px (equirectangular by default). */
  project: (point: LatLon) => [number, number];
  /** Curve angle in degrees (banks the arc off the straight perpendicular). */
  angle?: number;
  /** Multiplier on the bulge (the return leg uses 1.25). */
  bulgeScale?: number;
  /** Minimum bulge in px (default 14). */
  minBulge?: number;
  /** Bulge as a fraction of the chord length (default 0.28). */
  bulgeRatio?: number;
  /** Decimal places in the emitted path data (default 2). */
  digits?: number;
}

const round = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
};

/**
 * Builds the quadratic arc between two points of the flat map.
 *
 * The rotation is applied to the travel-left normal `(dy, −dx) / |d|`, which
 * for the outbound leg points up-screen and for the return leg down-screen —
 * the two legs never overlap, even before any angle is configured.
 */
export function flatArcGeometry(input: FlatArcInput): FlatArcGeometry {
  const { from, to, project, bulgeScale = 1, minBulge = 14, bulgeRatio = 0.28, digits = 2 } = input;
  const angle = normalizeArcAngleDeg(input.angle);

  const a = project(from);
  const b = project(to);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const chord = Math.hypot(dx, dy);
  const bulge = Math.max(minBulge, chord * bulgeRatio) * bulgeScale;

  // Travel-left normal in screen coordinates (y grows downward).
  let nx = 0;
  let ny = -1;
  if (chord > 1e-6) {
    nx = dy / chord;
    ny = -dx / chord;
  }
  // Rotate it by the curve angle (screen-clockwise for positive angles).
  const radians = angle * DEG;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dirX = nx * cos - ny * sin;
  const dirY = nx * sin + ny * cos;

  const midX = (a[0] + b[0]) / 2;
  const midY = (a[1] + b[1]) / 2;
  const control: [number, number] = [midX + dirX * bulge, midY + dirY * bulge];

  return {
    d: `M ${round(a[0], digits)} ${round(a[1], digits)} Q ${round(control[0], digits)} ${round(
      control[1],
      digits,
    )} ${round(b[0], digits)} ${round(b[1], digits)}`,
    from: [a[0], a[1]],
    control,
    to: [b[0], b[1]],
    bulge,
    angle,
  };
}

/**
 * Framing box of one or more quadratic arcs: the control points are included,
 * so a banked arc is always fully in view.
 */
export function flatArcBounds(
  geometries: readonly FlatArcGeometry[],
  padding = 60,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (geometries.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const arc of geometries) {
    for (const [x, y] of [arc.from, arc.control, arc.to]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}
