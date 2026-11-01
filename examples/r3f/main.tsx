import '../shared/install-clock';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Mesh } from 'three';
import { createMotionAudit, exposeMotionAudit } from 'three-motion-audit';
import { MotionAuditProbe, motionTag } from 'three-motion-audit/r3f';
import { mountPanel } from '../shared/panel';
import { createSlide } from '../shared/slide';

const slide = createSlide();
const audit = createMotionAudit();
exposeMotionAudit(audit, { scenarios: { slide: slide.scenario } });

function SlidingBox() {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    ref.current?.position.set(...slide.position());
  });
  // motionTag names the object for the audit.
  return (
    <mesh ref={ref} userData={motionTag('box', { role: 'prop' })}>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshNormalMaterial />
    </mesh>
  );
}

createRoot(document.getElementById('root')!).render(
  <Canvas camera={{ position: [0, 1, 6], fov: 50 }}>
    <SlidingBox />
    <MotionAuditProbe audit={audit} />
  </Canvas>
);
mountPanel('slide');
