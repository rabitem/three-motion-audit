import type { Departure, Detector, DetectorContext, Track } from '../core/detector.js';
import { distance, round, roundVec } from '../core/vec.js';
import type { Vec3 } from '../core/types.js';

interface PreviousOwner {
  id: string;
  role: string | undefined;
  position: Vec3;
  /** Frames drawn with neither owner. Mounting in the frame the old owner leaves is seamless. */
  gapFrames: number;
  gapMs: number;
}

function latest<T>(items: readonly T[], match: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    if (match(item)) return item;
  }
  return undefined;
}

function previousOwner(track: Track, ctx: DetectorContext): PreviousOwner | null {
  // A hidden owner (the original while a copy is dragged) is not what the viewer saw last.
  const live = ctx.tracks().find((other) => other.id !== track.id && other.entity === track.entity && other.last.visible);
  if (live) return { id: live.id, role: live.role, position: live.last.position, gapFrames: 0, gapMs: 0 };

  const window = ctx.thresholds(track).handoffWindowMs;
  const departed = latest(ctx.departures(), (entry: Departure) =>
    entry.id !== track.id && entry.entity === track.entity && entry.visible && ctx.t - entry.t <= window
  );
  if (!departed) return null;
  return { id: departed.id, role: departed.role, position: departed.position, gapFrames: ctx.frame - departed.frame, gapMs: ctx.t - departed.t };
}

/**
 * Seams where one object takes an entity over from another (a card leaves the hand and the
 * table draws it): a jump in position (`handoff-pop`) or blank frames in between (`handoff-gap`).
 */
export function handoffDetector(): Detector {
  return {
    name: 'handoff',
    mount(track, ctx) {
      const checkPop = ctx.applies('handoff-pop', track);
      const checkGap = ctx.applies('handoff-gap', track);
      if (!checkPop && !checkGap) return;
      const previous = previousOwner(track, ctx);
      if (!previous) return;
      const thresholds = ctx.thresholds(track);
      const subject = `${previous.id}->${track.id}`;

      // Screen-space owners ride on the camera, so their world positions are not comparable.
      const comparable = ctx.space(track.role) === 'world' && ctx.space(previous.role) === 'world';
      const jump = distance(previous.position, track.last.position);
      if (checkPop && comparable && jump > thresholds.handoffTolerance) {
        ctx.flag('handoff-pop', `${track.entity} jumped ${round(jump)} units moving from ${previous.id} to ${track.id}`, {
          subject,
          data: { from: roundVec(previous.position), to: roundVec(track.last.position), jump: round(jump) },
        });
      }
      if (checkGap && previous.gapFrames > thresholds.handoffMaxGapFrames) {
        ctx.flag('handoff-gap', `${track.entity} was missing for ${previous.gapFrames} frame(s) (${round(previous.gapMs, 1)}ms) between ${previous.id} and ${track.id}`, {
          subject,
          data: { gapFrames: previous.gapFrames, gapMs: round(previous.gapMs, 1) },
        });
      }
    },
  };
}

/** An object that unmounts and mounts again almost at once: a React key change, a Suspense fallback. */
export function remountFlickerDetector(): Detector {
  return {
    name: 'remount-flicker',
    mount(track, ctx) {
      if (!ctx.applies('remount-flicker', track)) return;
      const departed = latest(ctx.departures(), (entry: Departure) => entry.id === track.id);
      if (!departed) return;
      const afterMs = ctx.t - departed.t;
      if (afterMs > ctx.thresholds(track).remountWindowMs) return;
      ctx.flag('remount-flicker', `${track.id} unmounted and mounted again after ${round(afterMs, 1)}ms`, {
        subject: track.id,
        data: { afterMs: round(afterMs, 1), gapFrames: ctx.frame - departed.frame },
      });
    },
  };
}

/** One entity drawn by two objects at once for longer than a handoff takes. */
export function duplicateDetector(): Detector {
  const frames = new Map<string, number>();
  return {
    name: 'duplicate',
    endFrame(ctx) {
      const owners = new Map<string, { ids: string[]; track: Track }>();
      for (const track of ctx.tracks()) {
        if (!track.last.visible || !ctx.applies('duplicate', track)) continue;
        const entry = owners.get(track.entity);
        if (entry) entry.ids.push(track.id);
        else owners.set(track.entity, { ids: [track.id], track });
      }
      for (const entity of [...frames.keys()]) {
        if ((owners.get(entity)?.ids.length ?? 0) < 2) frames.delete(entity);
      }
      for (const [entity, { ids, track }] of owners) {
        if (ids.length < 2) continue;
        const count = (frames.get(entity) ?? 0) + 1;
        frames.set(entity, count);
        if (count > ctx.thresholds(track).duplicateMaxFrames) {
          ctx.flag('duplicate', `${entity} is drawn by ${ids.join(' and ')} at once`, { subject: entity, data: { ids } });
        }
      }
    },
    reset() {
      frames.clear();
    },
  };
}
