import { afterEach, describe, expect, it, vi } from 'vitest';
import { VirtualClock, type ClockTarget } from './index.js';

const FRAME = 1000 / 60;

/** Stand-ins for the page globals, so the test runner's own timers stay real. */
function fakePage() {
  const noop = () => 0;
  const target: ClockTarget = {
    performance: { now: () => 1000 },
    Date: { now: () => 1_700_000_000_000 },
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
  };
  return { target };
}

let clock: VirtualClock | null = null;
afterEach(() => {
  clock?.uninstall();
  clock = null;
});

function pausedClock() {
  const page = fakePage();
  clock = new VirtualClock({ mode: 'paused', target: page.target }).install();
  return { clock, ...page };
}

describe('VirtualClock', () => {
  it('advances time in whole frames when stepped', async () => {
    const { clock, target } = pausedClock();
    expect(target.performance.now()).toBe(1000);
    await clock.step(3);
    expect(clock.frame).toBe(3);
    expect(target.performance.now()).toBeCloseTo(1000 + 3 * FRAME);
    expect(target.Date.now()).toBe(1_700_000_000_050);
  });

  it('fires timers in due order at virtual time', async () => {
    const { clock, target } = pausedClock();
    const fired: Array<[string, number]> = [];
    target.setTimeout(() => fired.push(['late', target.performance.now()]), 40);
    target.setTimeout(() => fired.push(['soon', target.performance.now()]), 10);
    const cancelled = target.setTimeout(() => fired.push(['cancelled', 0]), 5);
    target.clearTimeout(cancelled);
    const interval = target.setInterval(() => fired.push(['tick', target.performance.now()]), 20);

    await clock.advance(50);
    target.clearInterval(interval);
    expect(fired.map(([name]) => name)).toEqual(['soon', 'tick', 'late', 'tick']);
    expect(fired.map(([, at]) => Math.round(at - 1000))).toEqual([17, 33, 50, 50]);
  });

  it('gives animation frame callbacks the virtual time, once each', async () => {
    const { clock, target } = pausedClock();
    const times: number[] = [];
    const loop = (time: number) => {
      times.push(time);
      if (times.length < 3) target.requestAnimationFrame!(loop);
    };
    target.requestAnimationFrame!(loop);
    await clock.step(5);
    expect(times.map((time) => Math.round(time - 1000))).toEqual([17, 33, 50]);
  });

  it('runs frames on its own in fast mode', async () => {
    const page = fakePage();
    clock = new VirtualClock({ mode: 'fast', target: page.target }).install();
    await clock.advance(1000);
    expect(clock.frame).toBeGreaterThanOrEqual(60);
  });

  it('plays speed frames per display frame, and a mode change does not wait for one', async () => {
    const page = fakePage();
    const display: Array<(time: number) => void> = [];
    page.target.requestAnimationFrame = (callback) => display.push(callback);
    clock = new VirtualClock({ mode: 'play', speed: 2, target: page.target }).install();
    expect(clock.frame).toBe(0);
    display.shift()!(0);
    await vi.waitFor(() => expect(clock!.frame).toBe(2));
    clock.setMode('fast');
    await vi.waitFor(() => expect(clock!.frame).toBeGreaterThan(10));
  });

  it('puts the real globals back on uninstall', () => {
    const { target } = fakePage();
    const original = { ...target, dateNow: target.Date.now, performanceNow: target.performance.now };
    clock = new VirtualClock({ mode: 'paused', target }).install();
    clock.uninstall();
    expect(target.setTimeout).toBe(original.setTimeout);
    expect(target.clearTimeout).toBe(original.clearTimeout);
    expect(target.setInterval).toBe(original.setInterval);
    expect(target.clearInterval).toBe(original.clearInterval);
    expect(target.Date.now).toBe(original.dateNow);
    expect(target.performance.now).toBe(original.performanceNow);
    expect(target.requestAnimationFrame).toBeUndefined();
    expect(target.cancelAnimationFrame).toBeUndefined();
  });

  it('releases a pending advance when uninstalled', async () => {
    const page = fakePage();
    clock = new VirtualClock({ mode: 'play', target: page.target }).install();
    const advanced = clock.advance(1000);
    clock.uninstall();
    await expect(advanced).resolves.toBeUndefined();
  });
});
