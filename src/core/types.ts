export type Vec3 = readonly [number, number, number];

/** A rotation as x, y, z, w. */
export type Quat = readonly [number, number, number, number];

/** Projected bounds in normalised device coordinates: the viewport spans -1..1 on both axes. */
export interface ScreenBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** One object as it was drawn in one frame. */
export interface ObjectSample {
  /** Stable name of the rendered object. The same id in two frames is the same object. */
  id: string;
  /**
   * What the object shows, shared by every object that shows it: a card drawn first by the hand,
   * then by the table, is one entity with two ids. Defaults to the id.
   */
  entity?: string;
  /** The kind of object ('card', 'camera'). Selects the role's options. */
  role?: string;
  /** World position. */
  position: Vec3;
  /** World rotation. Defaults to no rotation. */
  quaternion?: Quat;
  /** World scale (the largest axis). */
  scale?: number;
  /** False when the object or an ancestor is hidden. Defaults to true. */
  visible?: boolean;
  /** Projected bounds, for on-screen checks and screen-space motion. */
  screen?: ScreenBounds | null;
}

export type Severity = 'error' | 'warn' | 'info';

export type BuiltInCode =
  | 'teleport'
  | 'path-kink'
  | 'rotation-pop'
  | 'handoff-pop'
  | 'handoff-gap'
  | 'duplicate'
  | 'remount-flicker'
  | 'non-finite'
  | 'out-of-bounds'
  | 'offscreen'
  | 'not-settled'
  | 'wait-timeout'
  | 'scenario-failed';

/** A built-in code, or any code a custom detector or `audit.flag` uses. */
export type AnomalyCode = BuiltInCode | (string & {});

export interface Anomaly {
  code: AnomalyCode;
  severity: Severity;
  /** Milliseconds since the audit started, at the first occurrence. */
  t: number;
  /** Frame of the first occurrence, counted from 1; 0 when raised before any frame. */
  frame: number;
  message: string;
  /** What it is about (an object id, an entity, a handoff); anomalies are deduplicated per code and subject. */
  subject?: string;
  /** How many frames raised it. */
  count: number;
  data?: Record<string, unknown>;
}

export type TimelineKind = 'mount' | 'unmount' | 'event' | 'run';

export interface TimelineEntry {
  t: number;
  frame: number;
  kind: TimelineKind;
  label: string;
  data?: Record<string, unknown>;
}

export interface MotionReport {
  version: 1;
  /** The scenario that produced it, when one did. */
  scenario?: string;
  /** No error or warning anomalies (info is diagnostic only). */
  passed: boolean;
  frames: number;
  /** Clock time from the start of the audit (its first frame, event or flag) to the last frame, ms. */
  durationMs: number;
  /** Distinct object ids seen. */
  objects: number;
  /** Ordered by time of first occurrence. */
  anomalies: Anomaly[];
  timeline: TimelineEntry[];
}

/** Where time comes from. Defaults to `performance.now`, which a virtual clock replaces. */
export interface Clock {
  now(): number;
}

/** Axis limits in world units; an omitted side is unbounded. */
export interface Bounds {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minZ?: number;
  maxZ?: number;
}
