import { isAtRest, motionUnit, type Detector, type DetectorContext, type Track } from '../core/detector.js';
import type { Bounds, ScreenBounds, Vec3 } from '../core/types.js';
import { IDENTITY, isFiniteVec, round, roundVec } from '../core/vec.js';

/** JSON turns NaN and Infinity into null; name them instead. */
const jsonNumber = (value: number): number | string => (Number.isFinite(value) ? value : String(value));

function checkFinite(track: Track, ctx: DetectorContext): void {
  if (!ctx.applies('non-finite', track)) return;
  const { position, quaternion = IDENTITY, scale = 1 } = track.sample;
  if (isFiniteVec([...position, ...quaternion, scale])) return;
  ctx.flag('non-finite', `${track.id} has a non-finite transform`, {
    subject: track.id,
    data: { position: position.map(jsonNumber), quaternion: quaternion.map(jsonNumber), scale: jsonNumber(scale) },
  });
}

/** Non-finite transforms (NaN from a division by zero, an Infinity scale). */
export function nonFiniteDetector(): Detector {
  return { name: 'non-finite', mount: checkFinite, update: checkFinite };
}

function outside(position: Vec3, bounds: Bounds): boolean {
  const [x, y, z] = position;
  return (
    (bounds.minX !== undefined && x < bounds.minX) ||
    (bounds.maxX !== undefined && x > bounds.maxX) ||
    (bounds.minY !== undefined && y < bounds.minY) ||
    (bounds.maxY !== undefined && y > bounds.maxY) ||
    (bounds.minZ !== undefined && z < bounds.minZ) ||
    (bounds.maxZ !== undefined && z > bounds.maxZ)
  );
}

function checkBounds(track: Track, ctx: DetectorContext): void {
  const bounds = ctx.bounds(track);
  if (!bounds || !track.last.visible || !ctx.applies('out-of-bounds', track)) return;
  if (!outside(track.last.position, bounds)) return;
  ctx.flag('out-of-bounds', `${track.id} left its bounds at ${roundVec(track.last.position).join(', ')}`, {
    subject: track.id,
    data: { position: roundVec(track.last.position), bounds },
  });
}

/** Visible objects outside their role's bounds: a card through the table, a prop below the floor. */
export function boundsDetector(): Detector {
  return { name: 'out-of-bounds', mount: checkBounds, update: checkBounds };
}

/** Share of projected bounds outside the viewport, 0 when fully visible. */
function hiddenFraction(screen: ScreenBounds, tolerance: number): number {
  const limit = 1 + tolerance;
  const axisHidden = (min: number, max: number) => {
    const size = Math.max(max - min, 1e-6);
    const visible = Math.max(0, Math.min(max, limit) - Math.max(min, -limit));
    return 1 - visible / size;
  };
  return Math.max(axisHidden(screen.minX, screen.maxX), axisHidden(screen.minY, screen.maxY));
}

/** An object that came to rest partly outside the viewport. Passing through the edge in motion is fine. */
export function offscreenDetector(): Detector {
  return {
    name: 'offscreen',
    update(track, ctx) {
      const { screen } = track.sample;
      if (!screen || !track.last.visible || !ctx.applies('offscreen', track)) return;
      const thresholds = ctx.thresholds(track);
      if (track.restingFrames < thresholds.restFrames) return;
      const hidden = hiddenFraction(screen, thresholds.offscreenTolerance);
      if (hidden <= thresholds.offscreenMaxHidden) return;
      ctx.flag('offscreen', `${Math.round(hidden * 100)}% of ${track.id} rests outside the viewport`, {
        subject: track.id,
        data: { hidden: round(hidden, 2), screen },
      });
    },
  };
}

/** Objects still moving when the audit finishes: an animation that never ends, a drift. */
export function notSettledDetector(): Detector {
  return {
    name: 'not-settled',
    finish(ctx) {
      for (const track of ctx.tracks()) {
        if (!ctx.applies('not-settled', track)) continue;
        if (isAtRest(track, ctx.thresholds(track))) continue;
        ctx.flag('not-settled', `${track.id} still moves at the end (${round(track.speed, 3)} ${motionUnit(track, ctx)}/s, ${round(track.angularSpeed, 3)} rad/s)`, {
          subject: track.id,
          data: { speed: round(track.speed, 3), angularSpeed: round(track.angularSpeed, 3) },
        });
      }
    },
  };
}
