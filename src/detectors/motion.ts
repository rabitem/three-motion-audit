import { motionUnit, stepSeconds, type Detector, type TrackPoint } from '../core/detector.js';
import type { Thresholds } from '../core/thresholds.js';
import { distance, isBreak, length, round, roundVec, scale, sub } from '../core/vec.js';
import type { Vec3 } from '../core/types.js';

/** Spin changes below this (rad/s) are noise, not a pop: a still object that starts turning slowly. */
const SPIN_NOISE_RAD_PER_S = 3;
/** A pop at least triples the spin of the frame before. */
const SPIN_JUMP_FACTOR = 3;

/** Motion-space velocity into history[index], units/s; null without a point before it. */
function velocityAt(history: readonly TrackPoint[], index: number): Vec3 | null {
  const current = history[index];
  const previous = history[index - 1];
  if (!current || !previous) return null;
  return scale(sub(current.motion, previous.motion), 1 / stepSeconds(previous, current));
}

/** Acceleration at history[index], units/s²; null without two steps before it. */
function accelerationAt(history: readonly TrackPoint[], index: number): Vec3 | null {
  const velocity = velocityAt(history, index);
  const previousVelocity = velocityAt(history, index - 1);
  const start = history[index - 2];
  const end = history[index];
  if (!velocity || !previousVelocity || !start || !end) return null;
  return scale(sub(velocity, previousVelocity), 2 / stepSeconds(start, end));
}

/**
 * A long, fast step that breaks from the one before. Fast alone is not a teleport (a long throw
 * accelerates smoothly); a step out of line with the motion so far is. Hidden ends are exempt:
 * an object may move while nobody sees it.
 */
function isTeleportStep(history: readonly TrackPoint[], index: number, thresholds: Thresholds): boolean {
  const current = history[index];
  const previous = history[index - 1];
  const velocity = velocityAt(history, index);
  if (!current || !previous || !velocity || !current.visible || !previous.visible) return false;
  const large = distance(current.motion, previous.motion) > thresholds.minTeleportDistance && length(velocity) > thresholds.maxSpeed;
  return large && isBreak(velocity, velocityAt(history, index - 1), thresholds.breakRatio);
}

function contextOf(history: readonly TrackPoint[], relative: (t: number) => number) {
  return history.map((point) => ({ t: relative(point.t), position: roundVec(point.position), visible: point.visible }));
}

/** An object that moves further in one frame than its motion so far allows. */
export function teleportDetector(): Detector {
  return {
    name: 'teleport',
    update(track, ctx) {
      if (!ctx.applies('teleport', track)) return;
      const { history } = track;
      const index = history.length - 1;
      if (!isTeleportStep(history, index, ctx.thresholds(track))) return;
      const from = history[index - 1]!.motion;
      const to = history[index]!.motion;
      ctx.flag('teleport', `${track.id} moved ${round(distance(from, to))} ${motionUnit(track, ctx)} in one frame`, {
        subject: track.id,
        data: { from: roundVec(from), to: roundVec(to), speed: round(track.speed, 1), history: contextOf(history, ctx.relative) },
      });
    },
  };
}

/**
 * A sudden change of direction or speed: a snap out of a hover, a seam between two animation
 * phases. Strong but steady curvature (an orbit, a high arc) is smooth and passes.
 */
export function pathKinkDetector(): Detector {
  return {
    name: 'path-kink',
    update(track, ctx) {
      if (!ctx.applies('path-kink', track)) return;
      const thresholds = ctx.thresholds(track);
      const { history } = track;
      const index = history.length - 1;
      if (track.age <= thresholds.graceFrames || index < 2) return;
      if (!history.slice(-3).every((point) => point.visible)) return;
      // A teleport (into this point or the one before) explains the acceleration; it is reported once, as a teleport.
      if (isTeleportStep(history, index, thresholds) || isTeleportStep(history, index - 1, thresholds)) return;

      const acceleration = accelerationAt(history, index);
      if (!acceleration) return;
      const kink = length(acceleration);
      if (kink <= thresholds.maxAcceleration || !isBreak(acceleration, accelerationAt(history, index - 1), thresholds.breakRatio)) return;
      ctx.flag('path-kink', `${track.id} changed direction or speed abruptly (${round(kink, 1)} ${motionUnit(track, ctx)}/s²)`, {
        subject: track.id,
        data: { acceleration: round(kink, 1), history: contextOf(history, ctx.relative) },
      });
    },
  };
}

/** A rotation that snaps (a sudden jump in spin) or strobes (too fast to read, however smooth). */
export function rotationPopDetector(): Detector {
  return {
    name: 'rotation-pop',
    update(track, ctx) {
      if (!ctx.applies('rotation-pop', track)) return;
      const thresholds = ctx.thresholds(track);
      const [previous, current] = track.history.slice(-2);
      if (track.age <= thresholds.graceFrames || !previous || !current || !previous.visible || !current.visible) return;
      const spin = track.angularSpeed;
      const before = track.previousAngularSpeed;
      const sudden = spin > thresholds.rotationPopSpeed && spin > SPIN_JUMP_FACTOR * before + SPIN_NOISE_RAD_PER_S;
      if (!sudden && spin <= thresholds.maxAngularSpeed) return;
      ctx.flag('rotation-pop', `${track.id} turned at ${round(spin, 1)} rad/s (${round(before, 1)} rad/s the frame before)`, {
        subject: track.id,
        data: { angularSpeed: round(spin, 2), previousAngularSpeed: round(before, 2) },
      });
    },
  };
}
