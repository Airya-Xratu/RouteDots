/**
 * Easing curves for route animations. Pure math — no clock, no DOM.
 *
 * The plane's *scheduler* stays linear (it owns the fly/pause timing); the
 * *layer* applies the easing when mapping schedule progress onto motion, so
 * the plane lifts off and lands gently while the timing stays predictable.
 */

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * easeInOutCubic: slow start, accelerating through the middle, gentle
 * landing. Clamps inputs outside [0, 1].
 */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
