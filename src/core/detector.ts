import type { Thresholds } from './thresholds.js';
import type { AnomalyCode, Bounds, ObjectSample, Quat, Severity, Vec3 } from './types.js';

/** World position, or projected centre and size for objects that ride on the camera. */
export type MotionSpace = 'world' | 'screen';

/** Where an object was in one frame. */
export interface TrackPoint {
  t: number;
  frame: number;
  position: Vec3;
  /** What its motion is judged in: the world position, or the projected centre and size for screen-space roles. */
  motion: Vec3;
  quaternion: Quat;
  visible: boolean;
}

/** Two frames with one timestamp would read as infinite speed; a millisecond is the floor. */
const MIN_STEP_MS = 1;

/** Clock time between two points, seconds. Internal: not exported from the package. */
export function stepSeconds(from: TrackPoint, to: TrackPoint): number {
  return Math.max(to.t - from.t, MIN_STEP_MS) / 1000;
}

/** One object followed from mount to unmount. Detectors read it; the recorder updates it. */
export interface Track {
  readonly id: string;
  readonly entity: string;
  readonly role: string | undefined;
  /** The latest sample. */
  sample: ObjectSample;
  /** The latest point. */
  last: TrackPoint;
  /** Recent points, oldest first, ending with `last`. A continuity break empties it. */
  history: TrackPoint[];
  /** Frames since mount (0 in the mount frame). */
  age: number;
  /** Motion-space units per second over the last step; 0 with nothing to compare. */
  speed: number;
  /** Radians per second over the last step. */
  angularSpeed: number;
  /** Radians per second over the step before. */
  previousAngularSpeed: number;
  /** Consecutive frames at rest (speed and angular speed under the rest limits). */
  restingFrames: number;
}

/** At rest: speed and angular speed both within the rest limits. Internal: not exported from the package. */
export function isAtRest(track: Pick<Track, 'speed' | 'angularSpeed'>, thresholds: Thresholds): boolean {
  return track.speed <= thresholds.restSpeed && track.angularSpeed <= thresholds.restAngularSpeed;
}

/**
 * The unit a track's motion-space distances are in: NDC for screen-space roles with projected
 * bounds, else scene units. Internal: not exported from the package.
 */
export function motionUnit(track: Track, ctx: DetectorContext): string {
  return ctx.space(track.role) === 'screen' && track.sample.screen ? 'NDC' : 'units';
}

/** An object that left the scene recently: a candidate previous owner of its entity. */
export interface Departure {
  id: string;
  entity: string;
  role: string | undefined;
  t: number;
  /** The first frame drawn without it. */
  frame: number;
  position: Vec3;
  visible: boolean;
}

export interface FlagOptions {
  subject?: string;
  data?: Record<string, unknown>;
  /** Overrides the code's configured severity. */
  severity?: Severity;
}

export interface DetectorContext {
  /** Clock time of the frame being judged. */
  readonly t: number;
  readonly frame: number;
  /** Thresholds for a track's role (or the defaults without one). */
  thresholds(track?: Track | Departure): Thresholds;
  /** Bounds for a track's role, if any. */
  bounds(track: Track): Bounds | undefined;
  /** The space a role's motion is judged in. */
  space(role: string | undefined): MotionSpace;
  /** False when the code is switched off, or the track's role ignores it. */
  applies(code: AnomalyCode, track?: Track): boolean;
  flag(code: AnomalyCode, message: string, options?: FlagOptions): void;
  /** Every object present in the frame being judged. During mounts and updates, objects leaving this frame are still listed. */
  tracks(): readonly Track[];
  /** Objects that left within the handoff and remount windows, oldest first. */
  departures(): readonly Departure[];
  /** Milliseconds since the audit started, as reports show times. */
  relative(t: number): number;
}

/**
 * A check over the recorded frames. Every hook is optional. Within a frame the recorder calls
 * `mount` and `update` per sample, then `unmount` per object that is gone, then `endFrame`;
 * `finish` runs once when the audit finishes.
 */
export interface Detector {
  readonly name: string;
  mount?(track: Track, ctx: DetectorContext): void;
  update?(track: Track, ctx: DetectorContext): void;
  unmount?(track: Track, ctx: DetectorContext): void;
  endFrame?(ctx: DetectorContext): void;
  finish?(ctx: DetectorContext): void;
  /** Forget per-object state (the audit was reset, or its objects were forgotten). */
  reset?(): void;
}
