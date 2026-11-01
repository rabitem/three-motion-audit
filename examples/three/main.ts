import '../shared/install-clock';
import { BoxGeometry, Mesh, MeshNormalMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createMotionAudit, exposeMotionAudit } from 'three-motion-audit';
import { createSceneProbe, tagObject } from 'three-motion-audit/three';
import { mountPanel } from '../shared/panel';
import { createSlide } from '../shared/slide';

const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 6);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.getElementById('root')!.append(renderer.domElement);

// Tagged objects are what the audit tracks.
const box = tagObject(new Mesh(new BoxGeometry(0.6, 0.6, 0.6), new MeshNormalMaterial()), 'box', { role: 'prop' });
scene.add(box);

const slide = createSlide();
const audit = createMotionAudit();
const probe = createSceneProbe(audit, scene, camera);

renderer.setAnimationLoop(() => {
  box.position.set(...slide.position());
  renderer.render(scene, camera);
  // After the render: the audit sees exactly what was drawn.
  probe.sample();
});

exposeMotionAudit(audit, { scenarios: { slide: slide.scenario } });
mountPanel('slide');
