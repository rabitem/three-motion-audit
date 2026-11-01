import type { Detector } from '../core/detector.js';
import { duplicateDetector, handoffDetector, remountFlickerDetector } from './handoff.js';
import { pathKinkDetector, rotationPopDetector, teleportDetector } from './motion.js';
import { boundsDetector, nonFiniteDetector, notSettledDetector, offscreenDetector } from './placement.js';

/** Fresh instances of every built-in detector (some keep per-audit state). */
export function builtInDetectors(): Detector[] {
  return [
    nonFiniteDetector(),
    teleportDetector(),
    pathKinkDetector(),
    rotationPopDetector(),
    remountFlickerDetector(),
    handoffDetector(),
    duplicateDetector(),
    boundsDetector(),
    offscreenDetector(),
    notSettledDetector(),
  ];
}
