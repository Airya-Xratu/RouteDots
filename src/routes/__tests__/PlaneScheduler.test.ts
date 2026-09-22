import { describe, expect, it } from 'vitest';
import { PlaneScheduler } from '../PlaneScheduler.js';

describe('PlaneScheduler', () => {
  it('returns null before the start delay elapses', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500, startDelayMs: 200 });
    s.reset(0);
    expect(s.progress(100)).toBeNull();
    expect(s.progress(199)).toBeNull();
    expect(s.progress(200)).toBe(0);
  });

  it('advances monotonically 0→1 during the flight', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500 });
    s.reset(0);
    const samples = [0.1, 0.25, 0.5, 0.75, 0.999];
    let prev = -1;
    for (const t of samples) {
      const p = s.progress(t * 1000)!;
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    expect(s.progress(999)).toBeCloseTo(0.999, 5);
  });

  it('pauses between flights and repeats on the next cycle', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500 });
    s.reset(0);
    expect(s.progress(1000)).toBeNull();
    expect(s.progress(1250)).toBeNull();
    expect(s.progress(1499)).toBeNull();
    // second flight
    expect(s.progress(1500)).toBe(0);
    expect(s.progress(2000)).toBeCloseTo(0.5, 5);
    expect(s.progress(2500)).toBeNull();
    // third flight starts at 3000
    expect(s.progress(3000)).toBe(0);
    expect(s.progress(3500)).toBeCloseTo(0.5, 9);
    expect(s.cycleMs).toBe(1500);
  });

  it('reset() re-anchors the schedule', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500 });
    s.reset(0);
    expect(s.progress(600)).toBe(0.6);
    s.reset(10_000);
    expect(s.progress(10_000 + 500)).toBeCloseTo(0.5, 9);
  });

  it('sanitizes degenerate options', () => {
    const s = new PlaneScheduler({ flightMs: 0, pauseMs: -5 });
    s.reset(0);
    expect(s.progress(0)).toBe(0);
    expect(s.cycleMs).toBe(1);
  });
});
