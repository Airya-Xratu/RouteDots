import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BLINK_PERIOD_MS,
  DEFAULT_DOT_DIM,
  DEFAULT_RING_GROW,
  DEFAULT_RING_OPACITY,
  blinkDotOpacity,
  blinkPhase,
  blinkProgress,
  blinkPulse,
  blinkRingState,
} from '../blinkPattern.js';

describe('blinkPhase', () => {
  it('stays in [0, 1) and is deterministic', () => {
    for (let i = 0; i < 50; i++) {
      const phase = blinkPhase(i);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
      expect(blinkPhase(i)).toBe(phase);
    }
  });

  it('spreads neighbouring cities apart', () => {
    const phases = Array.from({ length: 31 }, (_, i) => blinkPhase(i));
    const sorted = [...phases].sort((a, b) => a - b);
    let smallestGap = 1;
    for (let i = 1; i < sorted.length; i++) {
      smallestGap = Math.min(smallestGap, sorted[i]! - sorted[i - 1]!);
    }
    const wrapGap = 1 - sorted[sorted.length - 1]! + sorted[0]!;
    smallestGap = Math.min(smallestGap, wrapGap);
    // 31 evenly spread phases would gap 1/31; the golden ratio keeps the
    // worst gap within a factor of two of that.
    expect(smallestGap).toBeGreaterThan(1 / 62);
    expect(new Set(phases).size).toBe(31);
  });
});

describe('blinkProgress', () => {
  it('is a sawtooth over the period', () => {
    expect(blinkProgress(0, 0)).toBeCloseTo(0, 9);
    expect(blinkProgress(DEFAULT_BLINK_PERIOD_MS / 4, 0)).toBeCloseTo(0.25, 9);
    expect(blinkProgress(DEFAULT_BLINK_PERIOD_MS, 0)).toBeCloseTo(0, 9);
  });

  it('shifts by the phase offset', () => {
    expect(blinkProgress(0, 0.25)).toBeCloseTo(0.25, 9);
  });

  it('wraps negative times (CSS-style negative delays agree)', () => {
    expect(blinkProgress(-DEFAULT_BLINK_PERIOD_MS / 4, 0)).toBeCloseTo(0.75, 9);
  });

  it('honours a custom period and clamps degenerate ones', () => {
    expect(blinkProgress(500, 0, 1000)).toBeCloseTo(0.5, 9);
    expect(blinkProgress(500, 0, 0)).toBeCloseTo(0, 9);
  });
});

describe('blinkPulse / blinkDotOpacity', () => {
  it('peaks at the start of the cycle and bottoms out halfway', () => {
    expect(blinkPulse(0)).toBeCloseTo(1, 9);
    expect(blinkPulse(0.5)).toBeCloseTo(0, 9);
    expect(blinkPulse(1)).toBeCloseTo(1, 6);
  });

  it('keeps the dot between dim and bright', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const opacity = blinkDotOpacity(p);
      expect(opacity).toBeGreaterThanOrEqual(DEFAULT_DOT_DIM - 1e-9);
      expect(opacity).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(blinkDotOpacity(0)).toBeCloseTo(1, 9);
    expect(blinkDotOpacity(0.5)).toBeCloseTo(DEFAULT_DOT_DIM, 9);
  });
});

describe('blinkRingState', () => {
  it('expands monotonically while fading out', () => {
    let previousScale = 0;
    let previousOpacity = Number.POSITIVE_INFINITY;
    for (let p = 0; p <= 1; p += 0.05) {
      const { scale, opacity } = blinkRingState(p);
      expect(scale).toBeGreaterThan(previousScale);
      expect(opacity).toBeLessThanOrEqual(previousOpacity + 1e-9);
      previousScale = scale;
      previousOpacity = opacity;
    }
  });

  it('starts at the dot and ends fully grown and transparent', () => {
    expect(blinkRingState(0)).toEqual({ scale: 1, opacity: DEFAULT_RING_OPACITY });
    expect(blinkRingState(1).scale).toBeCloseTo(1 + DEFAULT_RING_GROW, 9);
    expect(blinkRingState(1).opacity).toBeCloseTo(0, 9);
  });
});
