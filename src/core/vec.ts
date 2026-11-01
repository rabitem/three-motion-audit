import type { Quat, Vec3 } from './types.js';

export const IDENTITY: Quat = [0, 0, 0, 1];

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Smallest rotation between two unit quaternions, radians. */
export function angleBetween(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

/** True when `current` differs from `previous` by more than `ratio` of itself: a sudden change, not a gradual one. */
export function isBreak(current: Vec3, previous: Vec3 | null, ratio: number): boolean {
  const size = length(current);
  return size > 0 && (!previous || length(sub(current, previous)) > ratio * size);
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function roundVec(a: Vec3): Vec3 {
  return [round(a[0]), round(a[1]), round(a[2])];
}

export function isFiniteVec(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}
