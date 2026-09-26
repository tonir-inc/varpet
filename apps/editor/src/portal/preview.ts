import * as THREE from 'three';
import type { SceneDocument } from '../contracts';
import { makeStructure } from '../render/structure';
import { disposeObject } from '../render/assets';

/** Event-driven 3D view, with no editor controls or scene mutations. */
export function renderApartmentPreview(host: HTMLElement, document: SceneDocument): () => void {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {display:'block', width:'100%', height:'100%'});
  host.append(canvas);
  const scene = new THREE.Scene();
  const model = makeStructure(document);
  model.ceilings.visible = false;
  model.dimensions.visible = false;
  scene.add(model.group);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8f93a6', 2));
  const light = new THREE.DirectionalLight('#fff1dc', 3);
  light.position.set(-5, 12, 6);
  scene.add(light);
  const bounds = model.bounds;
  const center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 200);
  camera.position.copy(center).add(new THREE.Vector3(14, 19, 17));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  model.updateWalls(camera, 'cutaway', false, performance.now(), true);
  let left=Infinity, right=-Infinity, bottom=Infinity, top=-Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
    left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
  }
  function render() {
    const width=host.clientWidth, height=host.clientHeight;
    if (!width || !height) return;
    const aspect=width/height, span=Math.max((top-bottom)*1.1, (right-left)*1.1/aspect);
    const cx=(left+right)/2, cy=(bottom+top)/2;
    camera.left=cx-span*aspect/2;camera.right=cx+span*aspect/2;
    camera.top=cy+span/2;camera.bottom=cy-span/2;
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);renderer.render(scene,camera);
  }
  const observer = new ResizeObserver(render);
  observer.observe(host);
  render();
  return () => {observer.disconnect();disposeObject(model.group);renderer.dispose();renderer.forceContextLoss();canvas.remove();};
}
