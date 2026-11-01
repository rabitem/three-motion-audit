import { describe, expect, it } from 'vitest';
import { codes, createRecorder, sample, yaw } from '../test-support/fixtures.js';

describe('teleport', () => {
  it('accepts smooth motion', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 30; index++) step([sample('a', [index * 0.05, 0.3, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('does not call a smoothly accelerating long throw a teleport', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 12; index++) {
      step([sample('a', [0, 6.5 - 0.01 * index * index - 0.25 * index, 6 - 0.3 * index])]);
    }
    expect(audit.report().anomalies).toEqual([]);
  });

  it('flags an object that jumps across the scene in one frame', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0.3, 0])]);
    step([sample('a', [0, 0.3, 0])]);
    step([sample('a', [2, 0.3, 0])]);
    const [teleport] = audit.report().anomalies;
    expect(teleport).toMatchObject({ code: 'teleport', subject: 'a', severity: 'error', frame: 3 });
    expect(teleport?.data).toMatchObject({ from: [0, 0.3, 0], to: [2, 0.3, 0] });
  });

  it('flags a jump that breaks sideways out of steady motion', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 5; index++) step([sample('a', [index * 0.1, 0, 0])]);
    step([sample('a', [0.4, 0, 1.5])]);
    expect(codes(audit)).toEqual(['teleport']);
  });

  it('lets an object move while it is hidden', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0, 0])]);
    step([sample('a', [0, 0, 0], { visible: false })]);
    step([sample('a', [3, 0, 0], { visible: false })]);
    step([sample('a', [3, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('judges speed in clock time, so time-based motion on uneven frames is smooth', () => {
    const { audit, step, now } = createRecorder();
    const frameTimes = [16, 33, 8, 50, 16, 120, 16, 16, 40, 16];
    for (let index = 0; index < 40; index++) {
      const seconds = (now() + frameTimes[index % frameTimes.length]!) / 1000;
      step([sample('a', [2 * Math.cos(seconds), 0, 2 * Math.sin(seconds)], { quaternion: yaw(seconds * 3) })], frameTimes[index % frameTimes.length]);
    }
    expect(audit.report().anomalies).toEqual([]);
  });
});

describe('path-kink', () => {
  it('flags an object snapping out of a hover', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 5; index++) step([sample('a', [0, 0.3, 0])]);
    step([sample('a', [0.18, 0.3, 0])]);
    expect(codes(audit)).toEqual(['path-kink']);
  });

  it('accepts a tight orbit above maxAcceleration, because its curvature is steady', () => {
    const { audit, step } = createRecorder();
    // radius 1, 0.4 rad/frame: 24 units/s, 576 units/s² (above maxAcceleration 540)
    for (let index = 0; index < 30; index++) step([sample('a', [Math.cos(index * 0.4), 0.3, Math.sin(index * 0.4)])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('keeps the four points a kink needs even when historyFrames is set lower', () => {
    const { audit, step } = createRecorder({ historyFrames: 3 });
    for (let index = 0; index < 30; index++) step([sample('a', [Math.cos(index * 0.4), 0.3, Math.sin(index * 0.4)])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('reports a teleport once, not also as the kinks around it', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 5; index++) step([sample('a', [0, 0, 0])]);
    for (let index = 0; index < 5; index++) step([sample('a', [2, 0, 0])]);
    expect(codes(audit)).toEqual(['teleport']);
  });

  it('gives a freshly mounted object graceFrames to set up its path, and no more', () => {
    const inGrace = createRecorder();
    for (const x of [0, 0, 0.18, 0.36]) inGrace.step([sample('a', [x, 0, 0])]);
    expect(inGrace.audit.report().anomalies).toEqual([]);

    const afterGrace = createRecorder();
    for (const x of [0, 0, 0, 0.18, 0.36]) afterGrace.step([sample('a', [x, 0, 0])]);
    expect(afterGrace.audit.report().anomalies).toMatchObject([{ code: 'path-kink', subject: 'a', frame: 4 }]);
  });
});

describe('rotation-pop', () => {
  it('flags a sudden rotation snap', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 4; index++) step([sample('a', [0, 0, 0], { quaternion: yaw(0) })]);
    step([sample('a', [0, 0, 0], { quaternion: yaw(0.6) })]);
    expect(codes(audit)).toEqual(['rotation-pop']);
  });

  it('accepts a steady fast spin', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 30; index++) step([sample('a', [0, 0, 0], { quaternion: yaw(index * 0.3) })]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('flags a spin too fast to read, however smoothly it is reached', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 30; index++) step([sample('a', [0, 0, 0], { quaternion: yaw(index * index * 0.02) })]);
    expect(codes(audit)).toEqual(['rotation-pop']);
  });
});
