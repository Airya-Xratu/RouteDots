import { describe, expect, it } from 'vitest';
import { PlaneScheduler } from '../PlaneScheduler.js';

describe('PlaneScheduler', () => {
  it('returns null before the start delay elapses', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500, startDelayMs: 200 });
    s.reset(0);
    expect(s.progress(100)).toBeNull();
    expect(s.progress(199)).toBeNull();
    const p = s.progress(200);
    expect(p).not.toBeNull();
    expect(p!.t).toBe(0);
    expect(p!.leg).toBe('outbound');
    expect(p!.paused).toBe(false);
  });

  it('advances monotonically 0→1 during the flight', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500 });
    s.reset(0);
    const samples = [0.1, 0.25, 0.5, 0.75, 0.999];
    let prev = -1;
    for (const t of samples) {
      const p = s.progress(t * 1000)!;
      expect(p.t).toBeGreaterThan(prev);
      expect(p.leg).toBe('outbound');
      expect(p.paused).toBe(false);
      prev = p.t;
    }
    expect(s.progress(999)!.t).toBeCloseTo(0.999, 5);
  });

  it('pauses between flights and repeats on the next cycle (one-way)', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500 });
    s.reset(0);
    expect(s.progress(1000)?.paused).toBe(true);
    expect(s.progress(1250)?.paused).toBe(true);
    expect(s.progress(1499)?.paused).toBe(true);
    // second flight
    expect(s.progress(1500)?.t).toBe(0);
    expect(s.progress(2000)?.t).toBeCloseTo(0.5, 5);
    expect(s.progress(2500)?.paused).toBe(true);
    // third flight starts at 3000
    expect(s.progress(3000)?.t).toBe(0);
    expect(s.progress(3500)?.t).toBeCloseTo(0.5, 9);
    expect(s.cycleMs).toBe(1500);
  });

  it('round trip: outbound → pause → return → pause → repeat', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500, roundTrip: true });
    s.reset(0);
    // Flying outbound.
    expect(s.progress(0)).toMatchObject({ t: 0, leg: 'outbound', paused: false });
    expect(s.progress(500)).toMatchObject({ t: 0.5, leg: 'outbound', paused: false });
    // Pause at destination.
    expect(s.progress(1000)).toMatchObject({ t: 1, leg: 'outbound', paused: true });
    expect(s.progress(1250)).toMatchObject({ t: 1, leg: 'outbound', paused: true });
    // Flying back.
    expect(s.progress(1500)).toMatchObject({ t: 0, leg: 'return', paused: false });
    expect(s.progress(2000)).toMatchObject({ t: 0.5, leg: 'return', paused: false });
    expect(s.progress(2499)).toMatchObject({ t: 0.999, leg: 'return', paused: false });
    // Pause at origin.
    expect(s.progress(2500)).toMatchObject({ t: 0, leg: 'return', paused: true });
    expect(s.progress(2999)).toMatchObject({ t: 0, leg: 'return', paused: true });
    // Next cycle starts with outbound again.
    expect(s.progress(3000)).toMatchObject({ t: 0, leg: 'outbound', paused: false });
    expect(s.cycleMs).toBe(3000);
  });

  it('reset() re-anchors the schedule', () => {
    const s = new PlaneScheduler({ flightMs: 1000, pauseMs: 500 });
    s.reset(0);
    expect(s.progress(600)!.t).toBe(0.6);
    s.reset(10_000);
    expect(s.progress(10_000 + 500)!.t).toBeCloseTo(0.5, 9);
  });

  it('sanitizes degenerate options', () => {
    const s = new PlaneScheduler({ flightMs: 0, pauseMs: -5 });
    s.reset(0);
    expect(s.progress(0)!.t).toBe(0);
    expect(s.cycleMs).toBe(1);
  });
});
