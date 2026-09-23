/**
 * Blink timing for the airport-city markers. Pure — no DOM, no three.js, no
 * clock reads (time enters as an explicit `timeMs`), fully unit-testable.
 *
 * Every city gets a deterministic phase offset (golden-ratio spacing, so a
 * whole country's dots never blink in unison) and runs the same two-part
 * cycle:
 *
 * - the solid dot breathes between {@link DEFAULT_DOT_DIM} and full opacity,
 * - a ring expands from the dot out to `1 + grow` and fades out.
 *
 * The WebGL shaders in `globe/cityShader.ts` and the flat fallback's CSS
 * keyframes evaluate the same curves; this module is the single written-down
 * definition of them.
 */

/** One full blink + pulse cycle (ms). */
export const DEFAULT_BLINK_PERIOD_MS = 2600;

/** How far the pulse ring expands, as a multiple of its own radius. */
export const DEFAULT_RING_GROW = 2.6;

/** Opacity floor of the blinking dot (it never disappears). */
export const DEFAULT_DOT_DIM = 0.45;

/** Peak opacity of the expanding ring, at the moment it spawns. */
export const DEFAULT_RING_OPACITY = 0.55;

/** Golden-ratio conjugate — spreads phases evenly over [0, 1). */
const GOLDEN = 0.6180339887498949;

/** Deterministic phase offset in [0, 1) for a city at `index`. */
export function blinkPhase(index: number): number {
  const phase = (Math.abs(Math.trunc(index)) * GOLDEN) % 1;
  return phase;
}

/**
 * Sawtooth cycle position in [0, 1) at `timeMs` for a given phase offset.
 * Negative times wrap around, so a negative CSS-style animation delay and
 * this function agree.
 */
export function blinkProgress(
  timeMs: number,
  phase: number,
  periodMs: number = DEFAULT_BLINK_PERIOD_MS,
): number {
  const period = Math.max(1, periodMs);
  return (((timeMs / period + phase) % 1) + 1) % 1;
}

/** Cosine-shaped pulse: 1 at progress 0, 0 at progress 0.5, back to 1. */
export function blinkPulse(progress: number): number {
  return 0.5 + 0.5 * Math.cos(progress * 2 * Math.PI);
}

/** Opacity of the solid dot at a cycle position (dim ↔ bright). */
export function blinkDotOpacity(progress: number, dim: number = DEFAULT_DOT_DIM): number {
  const pulse = Math.pow(blinkPulse(progress), 1.5);
  return dim + (1 - dim) * pulse;
}

/** Scale and opacity of the expanding ring at a cycle position. */
export function blinkRingState(
  progress: number,
  grow: number = DEFAULT_RING_GROW,
  peakOpacity: number = DEFAULT_RING_OPACITY,
): { scale: number; opacity: number } {
  return { scale: 1 + progress * grow, opacity: peakOpacity * (1 - progress) };
}
