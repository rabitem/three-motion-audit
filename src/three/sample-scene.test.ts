import { BoxGeometry, Group, Mesh, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createMotionAudit } from '../core/motion-audit.js';
import { createSceneProbe, motionTag, sampleScene, tagObject } from './index.js';

function stage() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const box = tagObject(new Mesh(new BoxGeometry(1, 1, 1)), 'box', { role: 'prop', entity: 'crate' });
  scene.add(box);
  return { scene, camera, box };
}

describe('sampleScene', () => {
  it('samples tagged objects only, in world space', () => {
    const { scene, camera } = stage();
    const group = new Group();
    group.position.set(1, 2, 0);
    group.scale.setScalar(2);
    group.rotation.y = Math.PI / 2;
    const child = new Mesh(new BoxGeometry(1, 1, 1));
    child.position.set(1, 0, 0);
    Object.assign(child.userData, motionTag('child'));
    group.add(child);
    scene.add(group, new Mesh(new BoxGeometry(1, 1, 1)));

    const samples = sampleScene(scene, camera);
    expect(samples.map((sample) => sample.id)).toEqual(['box', 'child']);
    expect(samples[0]).toMatchObject({ entity: 'crate', role: 'prop', visible: true, scale: 1 });
    expect(samples[1]).toMatchObject({
      position: [expect.closeTo(1), expect.closeTo(2), expect.closeTo(-2)],
      quaternion: [expect.closeTo(0), expect.closeTo(Math.SQRT1_2), expect.closeTo(0), expect.closeTo(Math.SQRT1_2)],
      scale: expect.closeTo(2),
    });
  });

  it('lets select choose and name objects, and skips projection when screen is false', () => {
    const { scene, camera } = stage();
    const plain = new Mesh(new BoxGeometry(1, 1, 1));
    plain.name = 'crate-2';
    scene.add(plain);
    const samples = sampleScene(scene, camera, { screen: false, select: (object) => (object.name ? { id: object.name, role: 'crate' } : null) });
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ id: 'crate-2', role: 'crate' });
    expect(samples[0]).not.toHaveProperty('screen');
  });

  it('reports an object under a hidden parent as hidden', () => {
    const { scene, camera, box } = stage();
    const parent = new Group();
    parent.visible = false;
    parent.add(box);
    scene.add(parent);
    expect(sampleScene(scene, camera)[0]?.visible).toBe(false);
  });

  it('projects bounds to normalised device coordinates', () => {
    const { scene, camera } = stage();
    const screen = sampleScene(scene, camera)[0]?.screen;
    expect(screen).toBeDefined();
    expect(screen!.minX).toBeCloseTo(-screen!.maxX);
    expect(screen!.maxX).toBeGreaterThan(0);
    expect(screen!.maxX).toBeLessThan(1);
  });

  it('can track the camera, so a camera cut shows up', () => {
    const { scene, camera } = stage();
    const audit = createMotionAudit();
    const probe = createSceneProbe(audit, scene, camera, { camera: 'main-camera' });
    probe.sample(16);
    probe.sample(32);
    camera.position.set(8, 0, 10);
    camera.updateMatrixWorld();
    probe.sample(48);
    expect(audit.report().anomalies).toMatchObject([{ code: 'teleport', subject: 'main-camera' }]);
  });
});
