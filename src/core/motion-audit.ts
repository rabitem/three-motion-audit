import { builtInDetectors } from '../detectors/index.js';
import { isAtRest, stepSeconds, type Departure, type Detector, type DetectorContext, type FlagOptions, type MotionSpace, type Track, type TrackPoint } from './detector.js';
import { DEFAULT_THRESHOLDS, SCREEN_THRESHOLDS, scaleThresholds, type Thresholds } from './thresholds.js';
import type {
  Anomaly,
  AnomalyCode,
  Bounds,
  BuiltInCode,
  Clock,
  MotionReport,
  ObjectSample,
  Severity,
  TimelineEntry,
  TimelineKind,
  Vec3,
} from './types.js';
import { IDENTITY, angleBetween, distance, round } from './vec.js';

/** Options for one kind of object. */
export interface RoleOptions {
  /**
   * 'screen' judges motion by the projected centre and size (needs `screen` on the samples): for
   * objects that ride on the camera, whose world position says little. Defaults to 'world'.
   */
  space?: MotionSpace;
  /** Overrides for this role, on top of the audit's thresholds. */
  thresholds?: Partial<Thresholds>;
  /** Checks that do not apply to this role: a dragged object follows the pointer, not a script. */
  ignore?: readonly AnomalyCode[];
  /** Where this role's objects may be. Overrides the audit's bounds. */
  bounds?: Bounds;
}

export interface MotionAuditOptions {
  /** Where frame times come from when `frame` is called without one. Defaults to `performance.now`. */
  clock?: Clock;
  /** The size of a typical moving object in scene units; scales the distance and speed defaults. Defaults to 1. */
  unit?: number;
  /** Overrides for every role. Explicit values are not scaled by `unit`. */
  thresholds?: Partial<Thresholds>;
  /** Where objects may be, unless their role says otherwise. */
  bounds?: Bounds;
  /** Options per `role` of the samples. */
  roles?: Record<string, RoleOptions>;
  /** Severity per code; 'off' disables a check. Unknown codes default to 'error'. */
  severity?: Partial<Record<AnomalyCode, Severity | 'off'>>;
  /** Detectors to run after the built-in ones. */
  detectors?: readonly Detector[];
  /** Points kept per object (and attached to motion anomalies). At least 4; defaults to 8. */
  historyFrames?: number;
  /** Timeline entries kept before the rest are counted and dropped. Defaults to 2000. */
  maxTimelineEntries?: number;
}

/** Errors are animation bugs; warnings are visible problems that may be intended; info is diagnostic. */
export const DEFAULT_SEVERITY: Readonly<Record<BuiltInCode, Severity>> = Object.freeze({
  teleport: 'error',
  'path-kink': 'error',
  'rotation-pop': 'error',
  'handoff-pop': 'error',
  'handoff-gap': 'error',
  duplicate: 'error',
  'remount-flicker': 'error',
  'non-finite': 'error',
  'out-of-bounds': 'error',
  offscreen: 'warn',
  'not-settled': 'error',
  'wait-timeout': 'error',
  'scenario-failed': 'error',
});

export type FrameListener = (frame: number, t: number) => void;

const DEFAULT_HISTORY_FRAMES = 8;
/** path-kink compares the acceleration at the last point with the one before it: four points. */
const MIN_HISTORY_FRAMES = 4;
const DEFAULT_MAX_TIMELINE_ENTRIES = 2000;

const performanceClock: Clock = { now: () => globalThis.performance.now() };

/**
 * Records the transforms of named objects frame by frame and reports what a viewer would see
 * go wrong: teleports, kinks, rotation pops, handoff seams, duplicates, flicker. Framework-free:
 * feed it samples from any renderer.
 */
export class MotionAudit {
  private readonly clock: Clock;
  private readonly baseThresholds: Thresholds;
  private readonly roleThresholds = new Map<string | undefined, Thresholds>();
  private readonly detectors: Detector[];
  private readonly historyFrames: number;
  private readonly maxTimelineEntries: number;
  private readonly departureWindowMs: number;

  private readonly live = new Map<string, Track>();
  private departed: Departure[] = [];
  private readonly ids = new Set<string>();
  private readonly anomalies = new Map<string, Anomaly>();
  private timeline: TimelineEntry[] = [];
  private droppedTimelineEntries = 0;
  private readonly listeners = new Set<FrameListener>();
  private startT: number | null = null;
  private currentT = 0;
  private frameIndex = 0;
  private readonly ctx: DetectorContext;

  constructor(private readonly options: MotionAuditOptions = {}) {
    this.clock = options.clock ?? performanceClock;
    this.baseThresholds = { ...scaleThresholds(DEFAULT_THRESHOLDS, options.unit ?? 1), ...options.thresholds };
    this.detectors = [...builtInDetectors(), ...(options.detectors ?? [])];
    this.historyFrames = Math.max(MIN_HISTORY_FRAMES, options.historyFrames ?? DEFAULT_HISTORY_FRAMES);
    this.maxTimelineEntries = options.maxTimelineEntries ?? DEFAULT_MAX_TIMELINE_ENTRIES;
    const roles = [undefined, ...Object.keys(options.roles ?? {})];
    this.departureWindowMs = Math.max(...roles.map((role) => {
      const thresholds = this.thresholdsFor(role);
      return Math.max(thresholds.handoffWindowMs, thresholds.remountWindowMs);
    }));
    this.ctx = this.createContext();
  }

  /** Records one drawn frame: every tracked object in it. `t` defaults to the clock. */
  frame(samples: readonly ObjectSample[], t: number = this.clock.now()): void {
    this.startT ??= t;
    this.frameIndex++;
    this.currentT = t;

    const seen = new Set<string>();
    for (const sample of samples) {
      if (seen.has(sample.id)) continue;
      seen.add(sample.id);
      const track = this.live.get(sample.id);
      if (track) this.update(track, sample, t);
      else this.mount(sample, t);
    }
    for (const track of [...this.live.values()]) if (!seen.has(track.id)) this.unmount(track, t);
    for (const detector of this.detectors) detector.endFrame?.(this.ctx);

    this.departed = this.departed.filter((entry) => t - entry.t <= this.departureWindowMs);
    for (const listener of [...this.listeners]) listener(this.frameIndex, t);
  }

  /** Adds a labelled moment to the timeline (an input, a state change) to read anomalies against. */
  event(label: string, data?: Record<string, unknown>, t: number = this.clock.now()): void {
    this.log(t, 'event', label, data);
  }

  /** Reports an anomaly found outside the detectors: an app-level rule such as "one card flies at a time". */
  flag(code: AnomalyCode, message: string, options: FlagOptions & { t?: number } = {}): void {
    this.record(options.t ?? (this.frameIndex > 0 ? this.currentT : this.clock.now()), code, message, options);
  }

  /**
   * Frames went undrawn (a lost WebGL context, a hidden tab): the next frame follows the last one
   * the viewer saw, so motion checks start over instead of reading the gap as a jump.
   */
  breakContinuity(): void {
    for (const track of this.live.values()) {
      track.history = [];
      track.age = 0;
    }
  }

  /** The whole scene went away at once (a route change, an overlay): forget its objects without judging how they left. */
  forgetObjects(): void {
    this.live.clear();
    this.departed = [];
    for (const detector of this.detectors) detector.reset?.();
    this.log(this.currentT, 'run', 'objects forgotten');
  }

  /** Starts a new audit: no objects, anomalies, timeline or frames. */
  reset(): void {
    this.live.clear();
    this.departed = [];
    this.ids.clear();
    this.anomalies.clear();
    this.timeline = [];
    this.droppedTimelineEntries = 0;
    this.startT = null;
    this.currentT = 0;
    this.frameIndex = 0;
    for (const detector of this.detectors) detector.reset?.();
  }

  /** The objects in the last frame. */
  tracks(): readonly Track[] {
    return [...this.live.values()];
  }

  /** Objects still moving (roles that ignore `not-settled` never count). */
  moving(): Track[] {
    return this.tracks().filter((track) => {
      if (!this.ctx.applies('not-settled', track)) return false;
      return !isAtRest(track, this.thresholdsFor(track.role));
    });
  }

  isSettled(): boolean {
    return this.moving().length === 0;
  }

  /** Calls `listener` after every recorded frame; returns the unsubscribe function. */
  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get frames(): number {
    return this.frameIndex;
  }

  now(): number {
    return this.clock.now();
  }

  /** Runs the end-of-audit checks (objects still moving) and returns the report. Call it once per audit. */
  finish(): MotionReport {
    for (const detector of this.detectors) detector.finish?.(this.ctx);
    this.log(this.currentT, 'run', 'finished');
    return this.report();
  }

  /** The report so far, without the end-of-audit checks. */
  report(): MotionReport {
    const anomalies = [...this.anomalies.values()].map((anomaly) => ({ ...anomaly })).sort((a, b) => a.t - b.t || a.frame - b.frame);
    const timeline = this.droppedTimelineEntries === 0 ? [...this.timeline] : [
      ...this.timeline,
      { t: this.relative(this.currentT), frame: this.frameIndex, kind: 'run' as const, label: `timeline truncated (${this.droppedTimelineEntries} entries dropped)` },
    ];
    return {
      version: 1,
      passed: anomalies.every((anomaly) => anomaly.severity === 'info'),
      frames: this.frameIndex,
      durationMs: this.relative(this.currentT),
      objects: this.ids.size,
      anomalies,
      timeline,
    };
  }

  private thresholdsFor(role: string | undefined): Thresholds {
    let thresholds = this.roleThresholds.get(role);
    if (!thresholds) {
      const options = this.roleOptions(role);
      const screen = options?.space === 'screen' ? SCREEN_THRESHOLDS : {};
      thresholds = { ...this.baseThresholds, ...screen, ...options?.thresholds };
      this.roleThresholds.set(role, thresholds);
    }
    return thresholds;
  }

  private roleOptions(role: string | undefined): RoleOptions | undefined {
    return role === undefined ? undefined : this.options.roles?.[role];
  }

  private severityOf(code: AnomalyCode): Severity | 'off' {
    return this.options.severity?.[code] ?? DEFAULT_SEVERITY[code as BuiltInCode] ?? 'error';
  }

  private createContext(): DetectorContext {
    const audit = this;
    return {
      get t() {
        return audit.currentT;
      },
      get frame() {
        return audit.frameIndex;
      },
      thresholds: (track) => this.thresholdsFor(track?.role),
      bounds: (track) => this.roleOptions(track.role)?.bounds ?? this.options.bounds,
      space: (role) => this.roleOptions(role)?.space ?? 'world',
      applies: (code, track) => this.severityOf(code) !== 'off' && !(track && this.roleOptions(track.role)?.ignore?.includes(code)),
      flag: (code, message, options) => this.record(this.currentT, code, message, options),
      tracks: () => this.tracks(),
      departures: () => this.departed,
      relative: (t) => this.relative(t),
    };
  }

  private relative(t: number): number {
    return round(t - (this.startT ?? t), 1);
  }

  private record(t: number, code: AnomalyCode, message: string, options: FlagOptions = {}): void {
    const severity = options.severity ?? this.severityOf(code);
    if (severity === 'off') return;
    this.startT ??= t;
    const key = `${code}|${options.subject ?? ''}`;
    const existing = this.anomalies.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    this.anomalies.set(key, {
      code,
      severity,
      t: this.relative(t),
      frame: this.frameIndex,
      message,
      ...(options.subject !== undefined ? { subject: options.subject } : {}),
      count: 1,
      ...(options.data ? { data: options.data } : {}),
    });
  }

  private log(t: number, kind: TimelineKind, label: string, data?: Record<string, unknown>): void {
    this.startT ??= t;
    if (this.timeline.length >= this.maxTimelineEntries) {
      this.droppedTimelineEntries++;
      return;
    }
    this.timeline.push({ t: this.relative(t), frame: this.frameIndex, kind, label, ...(data ? { data } : {}) });
  }

  private pointOf(sample: ObjectSample, t: number): TrackPoint {
    return {
      t,
      frame: this.frameIndex,
      position: sample.position,
      motion: this.motionOf(sample),
      quaternion: sample.quaternion ?? IDENTITY,
      visible: sample.visible ?? true,
    };
  }

  /** The projected centre and size for screen-space roles (when the sample has them), else the world position. */
  private motionOf(sample: ObjectSample): Vec3 {
    const { screen } = sample;
    if (this.ctx.space(sample.role) !== 'screen' || !screen) return sample.position;
    return [(screen.minX + screen.maxX) / 2, (screen.minY + screen.maxY) / 2, Math.max(screen.maxX - screen.minX, screen.maxY - screen.minY)];
  }

  private mount(sample: ObjectSample, t: number): void {
    const point = this.pointOf(sample, t);
    const track: Track = {
      id: sample.id,
      entity: sample.entity ?? sample.id,
      role: sample.role,
      sample,
      last: point,
      history: [point],
      age: 0,
      speed: 0,
      angularSpeed: 0,
      previousAngularSpeed: 0,
      restingFrames: 0,
    };
    this.live.set(track.id, track);
    this.ids.add(track.id);
    this.log(t, 'mount', track.id);
    for (const detector of this.detectors) detector.mount?.(track, this.ctx);
    // The entity arrived somewhere: its older departures are settled.
    this.departed = this.departed.filter((entry) => entry.entity !== track.entity && entry.id !== track.id);
  }

  private update(track: Track, sample: ObjectSample, t: number): void {
    const point = this.pointOf(sample, t);
    const previous = track.history[track.history.length - 1];
    track.sample = sample;
    track.last = point;
    track.history.push(point);
    if (track.history.length > this.historyFrames) track.history.shift();
    track.age++;

    if (previous) {
      const seconds = stepSeconds(previous, point);
      track.previousAngularSpeed = track.angularSpeed;
      track.speed = distance(previous.motion, point.motion) / seconds;
      track.angularSpeed = angleBetween(previous.quaternion, point.quaternion) / seconds;
    } else {
      track.previousAngularSpeed = 0;
      track.speed = 0;
      track.angularSpeed = 0;
    }
    const resting = previous !== undefined && isAtRest(track, this.thresholdsFor(track.role));
    track.restingFrames = resting ? track.restingFrames + 1 : 0;

    for (const detector of this.detectors) detector.update?.(track, this.ctx);
  }

  private unmount(track: Track, t: number): void {
    this.live.delete(track.id);
    this.departed.push({
      id: track.id,
      entity: track.entity,
      role: track.role,
      t,
      frame: this.frameIndex,
      position: track.last.position,
      visible: track.last.visible,
    });
    this.log(t, 'unmount', track.id);
    for (const detector of this.detectors) detector.unmount?.(track, this.ctx);
  }
}

export function createMotionAudit(options?: MotionAuditOptions): MotionAudit {
  return new MotionAudit(options);
}
