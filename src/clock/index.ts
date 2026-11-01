import type { Clock } from '../core/types.js';

/** How the clock advances: 'play' with the display, 'fast' back to back, 'paused' only when stepped. */
export type ClockMode = 'play' | 'paused' | 'fast';

type Callback = (...args: unknown[]) => void;

/** The globals a virtual clock replaces. `globalThis` in a page; a stand-in object in tests. */
export interface ClockTarget {
  performance: { now(): number };
  Date: { now(): number };
  setTimeout: (callback: Callback, ms?: number, ...args: unknown[]) => unknown;
  clearTimeout: (id?: unknown) => void;
  setInterval: (callback: Callback, ms?: number, ...args: unknown[]) => unknown;
  clearInterval: (id?: unknown) => void;
  requestAnimationFrame?: (callback: (time: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
}

export interface VirtualClockOptions {
  /** Virtual milliseconds per frame. Defaults to 1000 / 60. */
  frameMs?: number;
  /** 'play' runs `speed` frames per display frame, 'fast' runs frames back to back, 'paused' only steps when asked. Defaults to 'play'. */
  mode?: ClockMode;
  /** Virtual frames per display frame in 'play' mode, clamped to 0.125..8. Defaults to 1. */
  speed?: number;
  /** The globals to replace. Defaults to `globalThis`. */
  target?: ClockTarget;
}

interface Timer {
  id: number;
  at: number;
  seq: number;
  callback: Callback;
  args: unknown[];
  intervalMs: number | null;
}

type Saved = Pick<ClockTarget, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval' | 'requestAnimationFrame' | 'cancelAnimationFrame'> & {
  performanceNow: () => number;
  dateNow: () => number;
};

export type FrameCallback = (now: number, frame: number) => void;

const MIN_SPEED = 0.125;
const MAX_SPEED = 8;

/**
 * A deterministic clock for the page under test. Once installed it replaces `performance.now`,
 * `Date.now`, timers and `requestAnimationFrame` with a virtual timeline that advances in fixed
 * frame steps, so animation code (R3F `useFrame`, `THREE.Clock`, timeouts) sees identical timing
 * on every run, however loaded the machine is. Install it before any animation code runs.
 */
export class VirtualClock implements Clock {
  readonly frameMs: number;
  private readonly target: ClockTarget;
  private saved: Saved | null = null;
  private virtualNow = 0;
  private epoch = 0;
  private frameCount = 0;
  private seq = 0;
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();
  private frameCallbacks = new Map<number, (time: number) => void>();
  private readonly listeners = new Set<FrameCallback>();
  private currentMode: ClockMode;
  private speed: number;
  private driving = false;
  private pendingFrames = 0;
  private wake: (() => void) | null = null;
  private channel: MessageChannel | null = null;
  private yields: Array<() => void> = [];
  private readonly advances = new Set<() => void>();

  constructor(options: VirtualClockOptions = {}) {
    this.frameMs = options.frameMs ?? 1000 / 60;
    this.currentMode = options.mode ?? 'play';
    this.speed = clampSpeed(options.speed ?? 1);
    this.target = options.target ?? (globalThis as unknown as ClockTarget);
  }

  get installed(): boolean {
    return this.saved !== null;
  }

  get mode(): ClockMode {
    return this.currentMode;
  }

  get frame(): number {
    return this.frameCount;
  }

  now(): number {
    return this.virtualNow;
  }

  install(): this {
    if (this.saved) return this;
    const target = this.target;
    const saved: Saved = {
      performanceNow: target.performance.now,
      dateNow: target.Date.now,
      setTimeout: target.setTimeout,
      clearTimeout: target.clearTimeout,
      setInterval: target.setInterval,
      clearInterval: target.clearInterval,
      requestAnimationFrame: target.requestAnimationFrame,
      cancelAnimationFrame: target.cancelAnimationFrame,
    };
    this.saved = saved;
    this.virtualNow = saved.performanceNow.call(target.performance);
    this.epoch = saved.dateNow.call(target.Date) - this.virtualNow;

    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => this.yields.shift()?.();
      // Node keeps the process alive while a port listens; a page ignores this.
      (channel.port1 as { unref?: () => void }).unref?.();
      this.channel = channel;
    }

    target.performance.now = () => this.virtualNow;
    target.Date.now = () => Math.round(this.epoch + this.virtualNow);
    target.setTimeout = (callback, ms, ...args) => this.schedule(callback, ms, args, null);
    target.setInterval = (callback, ms, ...args) => this.schedule(callback, ms, args, Math.max(1, Number(ms) || 0));
    target.clearTimeout = (id) => {
      this.timers.delete(id as number);
    };
    target.clearInterval = target.clearTimeout;
    target.requestAnimationFrame = (callback) => {
      const id = this.nextId++;
      this.frameCallbacks.set(id, callback);
      return id;
    };
    target.cancelAnimationFrame = (id) => {
      this.frameCallbacks.delete(id);
    };

    this.startDriver();
    return this;
  }

  /** Puts the real globals back. Pending virtual timers are dropped. */
  uninstall(): void {
    const saved = this.saved;
    if (!saved) return;
    const target = this.target;
    target.performance.now = saved.performanceNow;
    target.Date.now = saved.dateNow;
    target.setTimeout = saved.setTimeout;
    target.clearTimeout = saved.clearTimeout;
    target.setInterval = saved.setInterval;
    target.clearInterval = saved.clearInterval;
    target.requestAnimationFrame = saved.requestAnimationFrame;
    target.cancelAnimationFrame = saved.cancelAnimationFrame;
    this.saved = null;
    this.currentMode = 'paused';
    this.wake?.();
    this.channel?.port1.close();
    this.channel = null;
    for (const resolve of this.yields.splice(0)) resolve();
    for (const finish of [...this.advances]) finish();
    this.timers.clear();
    this.frameCallbacks.clear();
  }

  setMode(mode: ClockMode, speed = this.speed): void {
    this.currentMode = mode;
    this.speed = clampSpeed(speed);
    // A driver parked on a display frame (which never comes in a hidden tab) re-reads the mode.
    this.wake?.();
    this.startDriver();
  }

  /** Calls `listener` after every frame; returns the unsubscribe function. */
  onFrame(listener: FrameCallback): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Runs exactly `count` frames, yielding to the event loop between them. Works in any mode. */
  async step(count = 1): Promise<void> {
    for (let index = 0; index < count; index++) {
      this.tick();
      await this.yieldToEventLoop();
    }
  }

  /**
   * Resolves once virtual time has advanced by `ms`, or the clock is uninstalled: stepped here while
   * paused, by the driver otherwise.
   */
  async advance(ms: number): Promise<void> {
    const until = this.virtualNow + ms;
    if (this.currentMode === 'paused') {
      while (this.virtualNow < until && this.saved) await this.step();
      return;
    }
    if (!this.saved) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        unsubscribe();
        this.advances.delete(finish);
        resolve();
      };
      const unsubscribe = this.onFrame((now) => {
        if (now >= until) finish();
      });
      this.advances.add(finish);
    });
  }

  private schedule(callback: Callback, ms: number | undefined, args: unknown[], intervalMs: number | null): number {
    const id = this.nextId++;
    this.timers.set(id, { id, at: this.virtualNow + Math.max(0, Number(ms) || 0), seq: this.seq++, callback, args, intervalMs });
    return id;
  }

  private runDueTimers(): void {
    for (;;) {
      let next: Timer | null = null;
      for (const timer of this.timers.values()) {
        if (timer.at > this.virtualNow) continue;
        if (!next || timer.at < next.at || (timer.at === next.at && timer.seq < next.seq)) next = timer;
      }
      if (!next) return;
      if (next.intervalMs === null) this.timers.delete(next.id);
      else {
        next.at += next.intervalMs;
        next.seq = this.seq++;
      }
      try {
        next.callback(...next.args);
      } catch (error) {
        console.error('[VirtualClock] timer callback failed', error);
      }
    }
  }

  private tick(): void {
    if (!this.saved) return;
    this.virtualNow += this.frameMs;
    this.frameCount++;
    this.runDueTimers();

    const callbacks = this.frameCallbacks;
    this.frameCallbacks = new Map();
    for (const callback of callbacks.values()) {
      try {
        callback(this.virtualNow);
      } catch (error) {
        console.error('[VirtualClock] animation frame callback failed', error);
      }
    }
    for (const listener of [...this.listeners]) listener(this.virtualNow, this.frameCount);
  }

  /** Lets promises, React commits and effects run between frames, as they would in a browser. */
  private yieldToEventLoop(): Promise<void> {
    const saved = this.saved;
    if (!saved) return Promise.resolve();
    return new Promise((resolve) => {
      if (this.channel) {
        this.yields.push(resolve);
        this.channel.port2.postMessage(null);
      } else {
        saved.setTimeout.call(this.target, () => resolve(), 0);
      }
    });
  }

  /** Waits for a real display frame (a real timer where there is none), or for `setMode`. */
  private displayFrame(saved: Saved): Promise<boolean> {
    return new Promise((resolve) => {
      this.wake = () => resolve(true);
      if (saved.requestAnimationFrame) saved.requestAnimationFrame.call(this.target, () => resolve(false));
      else saved.setTimeout.call(this.target, () => resolve(false), this.frameMs);
    });
  }

  private startDriver(): void {
    const saved = this.saved;
    if (!saved || this.driving || this.currentMode === 'paused') return;
    this.driving = true;
    const loop = async () => {
      while (this.saved && this.currentMode !== 'paused') {
        if (this.currentMode === 'fast') {
          this.tick();
          await this.yieldToEventLoop();
          continue;
        }
        const woken = await this.displayFrame(saved);
        this.wake = null;
        if (woken) continue;
        this.pendingFrames += this.speed;
        while (this.pendingFrames >= 1 && this.currentMode === 'play' && this.saved) {
          this.pendingFrames -= 1;
          this.tick();
          await this.yieldToEventLoop();
        }
      }
      this.driving = false;
    };
    void loop();
  }
}

function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/** Creates a virtual clock and installs it on the page (or `options.target`). */
export function installVirtualClock(options: VirtualClockOptions = {}): VirtualClock {
  return new VirtualClock(options).install();
}
