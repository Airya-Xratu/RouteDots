/**
 * Pure timing for the repeating plane flight.
 *
 * For one-way routes the schedule is the classic fly → pause → repeat.
 * For round-trip routes the plane flies outbound, pauses at the destination,
 * flies *back* along the same edge, pauses at the origin, and repeats. Each
 * direction shares the same flight duration, and both pauses share the same
 * pause duration.
 *
 * No clock access — time is an explicit parameter, which makes it trivially
 * testable.
 */
export interface PlaneTimingOptions {
  /** Flight duration in ms per leg (default 4500). */
  flightMs?: number;
  /** Pause between legs in ms (default 700). */
  pauseMs?: number;
  /** Delay before the first flight in ms (default 0). */
  startDelayMs?: number;
  /** True for a round trip (outbound → pause → return → pause). */
  roundTrip?: boolean;
}

/** Which leg of the cycle the plane is currently on. */
export type FlightLeg = 'outbound' | 'return';

/** Scheduler progress result for the current instant. */
export interface FlightProgress {
  /** 0 → 1 along the current leg. */
  t: number;
  /** Direction the plane is heading. */
  leg: FlightLeg;
  /** True while paused at an endpoint. */
  paused: boolean;
}

export class PlaneScheduler {
  private readonly flightMs: number;
  private readonly pauseMs: number;
  private readonly startDelayMs: number;
  private readonly roundTrip: boolean;
  private start: number | null = null;

  constructor(options: PlaneTimingOptions = {}) {
    this.flightMs = Math.max(1, options.flightMs ?? 4500);
    this.pauseMs = Math.max(0, options.pauseMs ?? 700);
    this.startDelayMs = Math.max(0, options.startDelayMs ?? 0);
    this.roundTrip = options.roundTrip === true;
  }

  /** Anchors the schedule at `timeMs` (call when a route is set). */
  reset(timeMs: number): void {
    this.start = timeMs;
  }

  /**
   * Flight state at `timeMs`: the leg, the progress along it (0 → 1), and
   * whether the plane is paused at an endpoint. Returns `null` before the
   * start delay elapses.
   */
  progress(timeMs: number): FlightProgress | null {
    if (this.start === null) return null;
    const elapsed = timeMs - this.start - this.startDelayMs;
    if (elapsed < 0) return null;

    if (this.roundTrip) {
      // Outbound flight → pause at dest → return flight → pause at origin.
      const legMs = this.flightMs + this.pauseMs;
      const cycle = legMs * 2;
      const inCycle = elapsed % cycle;
      if (inCycle < this.flightMs) {
        return { t: inCycle / this.flightMs, leg: 'outbound', paused: false };
      }
      if (inCycle < legMs) {
        return { t: 1, leg: 'outbound', paused: true };
      }
      const inReturn = inCycle - legMs;
      if (inReturn < this.flightMs) {
        return { t: inReturn / this.flightMs, leg: 'return', paused: false };
      }
      return { t: 0, leg: 'return', paused: true };
    }

    // One-way: fly outbound → pause → repeat.
    const cycle = this.flightMs + this.pauseMs;
    const inCycle = elapsed % cycle;
    if (inCycle >= this.flightMs) {
      return { t: 1, leg: 'outbound', paused: true };
    }
    return { t: inCycle / this.flightMs, leg: 'outbound', paused: false };
  }

  /** Total cycle duration in ms (one full loop). */
  get cycleMs(): number {
    const legMs = this.flightMs + this.pauseMs;
    return this.roundTrip ? legMs * 2 : legMs;
  }

  /** Whether the scheduler is configured for round-trip flight. */
  get isRoundTrip(): boolean {
    return this.roundTrip;
  }
}
