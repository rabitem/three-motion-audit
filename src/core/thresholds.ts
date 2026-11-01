/**
 * Limits the built-in detectors judge motion by. Distances are in scene units and rates are per
 * second of clock time, so the checks hold on an irregular real clock as well as a fixed virtual one.
 */
export interface Thresholds {
  /** Speed faster than any intended motion, units/s. A teleport is faster than this and breaks from the previous step. */
  maxSpeed: number;
  /** Steps shorter than this are never teleports, units. */
  minTeleportDistance: number;
  /** Path acceleration above which a sudden change reads as a kink, units/s². Steady curvature (an orbit) is fine. */
  maxAcceleration: number;
  /** A step or an acceleration breaks from the previous one when they differ by more than this share of it. */
  breakRatio: number;
  /** Angular speed above which a sudden change of spin is a pop, rad/s. */
  rotationPopSpeed: number;
  /** Angular speed that strobes however smoothly it is reached, rad/s. */
  maxAngularSpeed: number;
  /** Frames after a mount before path kinks and rotation pops count (the first steps set up the path). */
  graceFrames: number;
  /** How far an entity may jump when another object takes it over, units. */
  handoffTolerance: number;
  /** Frames an entity may be missing while another object takes it over. 0: any blank frame is a flicker. */
  handoffMaxGapFrames: number;
  /** How long a departed object is remembered as the previous owner of its entity, ms. */
  handoffWindowMs: number;
  /** An id that unmounts and mounts again within this time flickered, ms. */
  remountWindowMs: number;
  /** Frames an entity may be drawn by two objects at once. */
  duplicateMaxFrames: number;
  /** Below this speed an object is at rest, units/s. */
  restSpeed: number;
  /** Below this angular speed an object is at rest, rad/s. */
  restAngularSpeed: number;
  /** Frames an object must rest before its placement on screen is judged. */
  restFrames: number;
  /** Share of a resting object's projected bounds that may lie outside the viewport. */
  offscreenMaxHidden: number;
  /** Slack around the viewport, in normalised device coordinates. */
  offscreenTolerance: number;
}

/**
 * Defaults for a scene where a typical moving object is about one unit across. Tuned on objects
 * about 0.6 units across, moving at up to ~15 units/s, on a 60 Hz virtual clock.
 */
export const DEFAULT_THRESHOLDS: Readonly<Thresholds> = Object.freeze({
  maxSpeed: 30,
  minTeleportDistance: 0.2,
  maxAcceleration: 540,
  breakRatio: 0.5,
  rotationPopSpeed: 7.2,
  maxAngularSpeed: 48,
  graceFrames: 2,
  handoffTolerance: 0.08,
  handoffMaxGapFrames: 0,
  handoffWindowMs: 1500,
  remountWindowMs: 400,
  duplicateMaxFrames: 2,
  restSpeed: 0.02,
  restAngularSpeed: 0.05,
  restFrames: 10,
  offscreenMaxHidden: 0.15,
  offscreenTolerance: 0.02,
});

/** Thresholds measured in world units; `unit` scales them. */
export const DISTANCE_THRESHOLDS = ['maxSpeed', 'minTeleportDistance', 'maxAcceleration', 'handoffTolerance', 'restSpeed'] as const;

/**
 * Defaults for roles judged in screen space (`space: 'screen'`), where motion is the projected
 * centre and size in normalised device coordinates (the viewport spans 2). Any break larger than
 * an eighth of the viewport is a jump, whatever the speed.
 */
export const SCREEN_THRESHOLDS: Readonly<Partial<Thresholds>> = Object.freeze({
  maxSpeed: 0,
  minTeleportDistance: 0.25,
  maxAcceleration: 270,
  restSpeed: 0.01,
});

export function scaleThresholds(thresholds: Readonly<Thresholds>, unit: number): Thresholds {
  const scaled: Thresholds = { ...thresholds };
  for (const key of DISTANCE_THRESHOLDS) scaled[key] = thresholds[key] * unit;
  return scaled;
}
