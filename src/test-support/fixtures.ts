import { createMotionAudit, type MotionAudit, type MotionAuditOptions } from '../core/motion-audit.js';
import type { ObjectSample, Quat, Vec3 } from '../core/types.js';

/* Builders for the tests. Not part of the package. */

export const FRAME_MS = 1000 / 60;

/** One object at `position`; `entity` and `role` come from overrides. */
export function sample(id: string, position: Vec3, overrides: Partial<ObjectSample> = {}): ObjectSample {
  return { id, position, ...overrides };
}

export function yaw(radians: number): Quat {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

/** An audit on a manual clock, stepped one frame (60 Hz unless told otherwise) at a time. */
export function createRecorder(options: Omit<MotionAuditOptions, 'clock'> = {}) {
  let now = 0;
  const audit = createMotionAudit({ ...options, clock: { now: () => now } });
  const step = (samples: ObjectSample[], ms = FRAME_MS) => {
    now += ms;
    audit.frame(samples);
  };
  return { audit, step, now: () => now };
}

export function codes(audit: MotionAudit): string[] {
  return audit.report().anomalies.map((anomaly) => anomaly.code);
}

export function finishedCodes(audit: MotionAudit): string[] {
  return audit.finish().anomalies.map((anomaly) => anomaly.code);
}
