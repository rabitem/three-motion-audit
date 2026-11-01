import { Box3, Quaternion, Vector3, type Camera, type Object3D } from 'three';
import type { MotionAudit } from '../core/motion-audit.js';
import type { ObjectSample, ScreenBounds } from '../core/types.js';

/** The `userData` key tagged objects carry. */
export const USER_DATA_KEY = 'motionAudit';

/** How a tracked object is named in the audit. */
export interface TrackTag {
  id: string;
  entity?: string;
  role?: string;
}

/** `userData` for a tracked object: `<mesh userData={motionTag('card:A', { role: 'card', entity: 'A' })} />`. */
export function motionTag(id: string, options: Omit<TrackTag, 'id'> = {}): Record<string, TrackTag> {
  return { [USER_DATA_KEY]: { id, ...options } };
}

/** Tags an object for tracking; returns it. */
export function tagObject<T extends Object3D>(object: T, id: string, options: Omit<TrackTag, 'id'> = {}): T {
  object.userData[USER_DATA_KEY] = { id, ...options };
  return object;
}

function taggedOf(object: Object3D): TrackTag | null {
  const tag = object.userData[USER_DATA_KEY] as TrackTag | undefined;
  return tag && typeof tag.id === 'string' ? tag : null;
}

export interface SampleOptions {
  /** Which objects to track and as what. Defaults to objects tagged with `motionTag` or `tagObject`. */
  select?: (object: Object3D) => TrackTag | null | undefined;
  /** Project each object's bounds to the screen (needed for `offscreen` and screen-space roles). Defaults to true when there is a camera. */
  screen?: boolean;
  /** Track the camera as an object with this id and role 'camera', so camera cuts show as teleports. */
  camera?: string | false;
}

export function isVisibleInScene(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

const box = new Box3();
const corner = new Vector3();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();

/** Normalised-device-coordinate bounds of an object's world bounding box; null when it is empty. */
export function projectBounds(object: Object3D, camera: Camera): ScreenBounds | null {
  box.setFromObject(object);
  if (box.isEmpty()) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < 8; index++) {
    corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z).project(camera);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  }
  return { minX, maxX, minY, maxY };
}

function sampleOf(object: Object3D, tag: TrackTag, camera: Camera | null, screen: boolean): ObjectSample {
  object.getWorldPosition(position);
  object.getWorldQuaternion(rotation);
  object.getWorldScale(scale);
  const sample: ObjectSample = {
    id: tag.id,
    position: [position.x, position.y, position.z],
    quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)),
    visible: isVisibleInScene(object),
  };
  if (tag.entity !== undefined) sample.entity = tag.entity;
  if (tag.role !== undefined) sample.role = tag.role;
  if (camera && screen && sample.position.every(Number.isFinite)) sample.screen = projectBounds(object, camera);
  return sample;
}

/** Every tracked object under `root`, with world transform, visibility and (with a camera) screen bounds. */
export function sampleScene(root: Object3D, camera: Camera | null, options: SampleOptions = {}): ObjectSample[] {
  const select = options.select ?? taggedOf;
  const screen = options.screen ?? camera !== null;
  const samples: ObjectSample[] = [];
  root.traverse((object) => {
    const tag = select(object);
    if (tag) samples.push(sampleOf(object, tag, camera, screen));
  });
  if (camera && options.camera) samples.push(sampleOf(camera, { id: options.camera, role: 'camera' }, null, false));
  return samples;
}

export interface SceneProbe {
  /** Samples the scene into the audit. Call it after each render. */
  sample(t?: number): void;
}

/** Binds an audit to a scene and camera: `probe.sample()` after `renderer.render(scene, camera)`. */
export function createSceneProbe(audit: MotionAudit, scene: Object3D, camera: Camera | null, options: SampleOptions = {}): SceneProbe {
  return {
    sample(t) {
      audit.frame(sampleScene(scene, camera, options), t);
    },
  };
}
