import type { Scenario, Vec3 } from 'three-motion-audit';

const SLIDE_MS = 800;
const LIFT_MS = 800;
/** Where the buggy lift starts: a stale offset instead of where the slide ended. */
const STALE_LIFT_START_X = 1.2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (progress: number) => progress * progress * (3 - 2 * progress);

/**
 * The box slides from x=-2 to 0, then lifts to (1.5, 1). With `pop`, the lift starts from a
 * stale x: the box jumps 1.2 units in one frame where the two phases meet.
 */
function boxPosition(elapsedMs: number, pop: boolean): Vec3 {
  if (elapsedMs < SLIDE_MS) return [-2 + 2 * easeInOut(clamp01(elapsedMs / SLIDE_MS)), 0, 0];
  const lift = easeInOut(clamp01((elapsedMs - SLIDE_MS) / LIFT_MS));
  const startX = pop ? STALE_LIFT_START_X : 0;
  return [startX + (1.5 - startX) * lift, lift, 0];
}

/** The animation and the scenario that plays it. `?pop` in the URL seeds the bug. */
export function createSlide() {
  const pop = new URLSearchParams(location.search).has('pop');
  let startedAt: number | null = null;
  const elapsed = () => (startedAt === null ? 0 : performance.now() - startedAt);

  const scenario: Scenario = async (ctx) => {
    startedAt = performance.now();
    ctx.event('slide started', { pop });
    await ctx.waitUntil(() => elapsed() >= SLIDE_MS + LIFT_MS, { label: 'the slide to finish' });
  };

  return { position: () => boxPosition(elapsed(), pop), scenario };
}
