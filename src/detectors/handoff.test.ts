import { describe, expect, it } from 'vitest';
import { codes, createRecorder, sample } from '../test-support/fixtures.js';

const inHand = (position: [number, number, number]) => sample('hand:A', position, { entity: 'A', role: 'hand' });
const onTable = (position: [number, number, number]) => sample('table:A', position, { entity: 'A', role: 'table' });

describe('handoffs', () => {
  it('accepts an entity changing object in one frame at the same spot', () => {
    const { audit, step } = createRecorder();
    step([inHand([1, 0, 0])]);
    step([onTable([1, 0, 0])]);
    step([onTable([1, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('flags blank frames between the old object and the new one', () => {
    const { audit, step } = createRecorder();
    step([inHand([1, 0, 0])]);
    step([]);
    step([]);
    step([onTable([1, 0, 0])]);
    const [gap] = audit.report().anomalies;
    expect(gap).toMatchObject({ code: 'handoff-gap', subject: 'hand:A->table:A', data: { gapFrames: 2 } });
  });

  it('flags a jump in position between the old object and the new one', () => {
    const { audit, step } = createRecorder();
    step([inHand([1, 0, 0])]);
    step([onTable([1.4, 0, 0])]);
    expect(codes(audit)).toEqual(['handoff-pop']);
  });

  it('does not link objects that are too far apart in time', () => {
    const { audit, step } = createRecorder();
    step([inHand([1, 0, 0])]);
    step([]);
    step([], 2000);
    step([onTable([3, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('judges handoffs from a screen-space object by timing only', () => {
    const { audit, step } = createRecorder({ roles: { hand: { space: 'screen' } } });
    step([inHand([0, -2, 5])]);
    step([onTable([1, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);

    const gap = createRecorder({ roles: { hand: { space: 'screen' } } });
    gap.step([inHand([0, -2, 5])]);
    gap.step([]);
    gap.step([onTable([1, 0, 0])]);
    expect(gap.audit.report().anomalies).toMatchObject([{ code: 'handoff-gap', data: { gapFrames: 1 } }]);
  });

  it("keeps a departure for as long as the new owner's role allows", () => {
    const { audit, step } = createRecorder({ roles: { table: { thresholds: { handoffWindowMs: 5000 } } } });
    step([inHand([1, 0, 0])]);
    step([]);
    step([], 3000);
    step([onTable([1, 0, 0])]);
    expect(audit.report().anomalies).toMatchObject([{ code: 'handoff-gap', subject: 'hand:A->table:A', data: { gapFrames: 2 } }]);
  });
});

describe('duplicate', () => {
  it('flags an entity drawn by two objects for several frames, once per frame over the limit', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 4; index++) step([inHand([1, 0, 0]), onTable([1, 0, 0])]);
    expect(audit.report().anomalies).toMatchObject([{ code: 'duplicate', subject: 'A', count: 2 }]);
  });

  it('allows a brief overlap while one object takes over from another', () => {
    const { audit, step } = createRecorder();
    step([inHand([1, 0, 0])]);
    step([inHand([1, 0, 0]), onTable([1, 0, 0])]);
    step([inHand([1, 0, 0]), onTable([1, 0, 0])]);
    step([onTable([1, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('ignores a hidden copy', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 4; index++) step([sample('hand:A', [1, 0, 0], { entity: 'A', visible: false }), onTable([1, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });
});

describe('remount-flicker', () => {
  it('flags an object that unmounts and mounts again almost at once', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0, 0])]);
    step([]);
    step([]);
    step([sample('a', [0, 0, 0])]);
    expect(audit.report().anomalies).toMatchObject([{ code: 'remount-flicker', subject: 'a', data: { gapFrames: 2 } }]);
  });

  it('accepts an object that comes back much later', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0, 0])]);
    step([]);
    step([sample('a', [0, 0, 0])], 500);
    expect(audit.report().anomalies).toEqual([]);
  });
});
