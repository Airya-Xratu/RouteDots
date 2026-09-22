/**
 * Pure timing for the repeating plane flight: fly the route for `flightMs`,
 * pause for `pauseMs`, repeat. No clock access — time is an explicit
 * parameter, which makes it trivially testable.
 */
export interface PlaneTimingOptions {
  /** Flight duration in ms (default 4500). */
  flightMs?: number;
  /** Pause between flights in ms (default 700). */
  pauseMs?: number;
  /** Delay before the first flight in ms (default 0). */
  startDelayMs?: number;
}

export class PlaneScheduler {
  private readonly flightMs: number;
  private readonly pauseMs: number;
  private readonly startDelayMs: number;
  private start: number | null = null;

  constructor(options: PlaneTimingOptions = {}) {
    this.flightMs = Math.max(1, options.flightMs ?? 4500);
    this.pauseMs = Math.max(0, options.pauseMs ?? 700);
    this.startDelayMs = Math.max(0, options.startDelayMs ?? 0);
  }

  /** Anchors the schedule at `timeMs` (call when a route is set). */
  reset(timeMs: number): void {
    this.start = timeMs;
  }

  /**
   * Route progress at `timeMs`: 0 → 1 while flying, `null` while paused
   * (or before the start delay elapses).
   */
  progress(timeMs: number): number | null {
    if (this.start === null) return null;
    const elapsed = timeMs - this.start - this.startDelayMs;
    if (elapsed < 0) return null;
    const cycle = this.flightMs + this.pauseMs;
    const inCycle = elapsed % cycle;
    if (inCycle >= this.flightMs) return null;
    return inCycle / this.flightMs;
  }

  get cycleMs(): number {
    return this.flightMs + this.pauseMs;
  }
}
