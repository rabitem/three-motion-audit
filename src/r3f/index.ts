import { addAfterEffect, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MotionAudit } from '../core/motion-audit.js';
import { sampleScene, type SampleOptions } from '../three/index.js';

export { motionTag, tagObject, type SampleOptions, type TrackTag } from '../three/index.js';

/**
 * Samples the canvas's tracked objects into `audit` after every rendered frame. Call it inside
 * a `<Canvas>`. It samples after the render, so it sees exactly what was drawn, whatever the
 * order of `useFrame` callbacks.
 */
export function useMotionAudit(audit: MotionAudit, options: SampleOptions = {}): void {
  const get = useThree((state) => state.get);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(
    () =>
      addAfterEffect(() => {
        const { scene, camera } = get();
        audit.frame(sampleScene(scene, camera, optionsRef.current));
      }),
    [audit, get]
  );
}

export interface MotionAuditProbeProps extends SampleOptions {
  audit: MotionAudit;
}

/** `useMotionAudit` as a component: `<MotionAuditProbe audit={audit} />` inside a `<Canvas>`. */
export function MotionAuditProbe({ audit, ...options }: MotionAuditProbeProps): null {
  useMotionAudit(audit, options);
  return null;
}
