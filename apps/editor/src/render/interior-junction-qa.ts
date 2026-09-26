/** Real GPU comparison on the reported M6 corner; never loads/saves user state. */
import * as THREE from 'three';
import m6 from '../../../../apartments/m6-12-54/scene.json';
import type { SceneDocument, QualityMode } from '../contracts';
import { createViewport } from './viewport';
import { createApartmentStore } from '../core/apartment-store';
import { StudioRenderer } from './studio-renderer';

const scene = createApartmentStore(m6 as unknown as SceneDocument, []).scene;
const originalScene = JSON.stringify(scene);
let world: THREE.Scene | undefined, camera: THREE.Camera | undefined, renderer: THREE.WebGLRenderer | undefined;
const previous = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  previous.apply(this, args);
  if (args[1] instanceof THREE.Scene && args[1].background) { world = args[1]; camera = args[2]; renderer = args[0]; }
};
const output = document.querySelector<HTMLPreElement>('#result')!;
const errors: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() {}, onError(message) { errors.push(message); },
});
viewport.setScene(scene, []); viewport.setSelection('room-bedroom-large'); viewport.setView('inside');
viewport.setDoorAngle('door-bedroom-large', Math.PI / 2);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function stripes(data: ImageData): number {
  // Smooth, unoccluded central leaf patch. A planar material/light gradient has
  // low second differences; repeated shadow-map bands have much higher energy.
  const { width, height } = data;
  const luminance = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return (data.data[index]! + data.data[index + 1]! + data.data[index + 2]!) / 3;
  };
  let energy = 0, count = 0;
  const step = Math.max(1, Math.round(width / 250));
  for (let y = Math.round(height * .56); y < height * .8; y++) {
    for (let x = Math.round(width * .66); x < width * .72; x++) {
      const difference = luminance(x - step, y) - 2 * luminance(x, y) + luminance(x + step, y);
      energy += difference * difference; count++;
    }
  }
  return Math.sqrt(energy / count);
}
function capture(quality: QualityMode, id: string, label: string): number {
  if (!renderer || !world || !(camera instanceof THREE.PerspectiveCamera)) throw new Error('No rendered interior');
  const size = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(1000, 760, false);
  const pipeline = new StudioRenderer(renderer, world, camera); pipeline.setInterior(true); pipeline.setQuality(quality);
  try {
    pipeline.setSize(1000, 760); pipeline.render(camera);
    const copy = document.createElement('canvas'); copy.width = 1000; copy.height = 760;
    const context = copy.getContext('2d')!; context.drawImage(renderer.domElement, 0, 0);
    const image = document.querySelector<HTMLImageElement>(`#${id}`) ?? document.createElement('img');
    image.id = id; image.alt = label; image.width = 1000; image.src = copy.toDataURL('image/png'); document.body.append(image);
    return stripes(context.getImageData(0, 0, 1000, 760));
  } finally {
    pipeline.dispose(); renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false);
  }
}
async function run(): Promise<void> {
  output.textContent = 'Running real GPU comparison';
  try {
    await delay(1000);
    camera!.position.set(-5.3, 1.65, 3.2); camera!.lookAt(-3.5, 1.65, .721); camera!.updateMatrixWorld(true);
    // Keep the pixel probe stable across unrelated navigation lens changes.
    if (camera instanceof THREE.PerspectiveCamera) { camera.fov = 60; camera.aspect = 1000 / 760; camera.zoom = 1; camera.updateProjectionMatrix(); }
    const lights: THREE.SpotLight[] = [];
    world!.getObjectByName('Window daylight preview')!.traverse(object => { if (object instanceof THREE.SpotLight) lights.push(object); });
    const lines: string[] = [];
    for (const quality of ['balanced', 'high'] as const) {
      viewport.setQuality(quality); await delay(200);
      const radii = lights.map(light => light.shadow.radius);
      const fixed = capture(quality, `fixed-${quality}`, `Repaired M6 corner · ${quality}`);
      lights.forEach(light => { light.shadow.radius = 3; });
      const legacy = capture(quality, `legacy-${quality}`, `Previous daylight filter · ${quality}`);
      lights.forEach((light, index) => { light.shadow.radius = radii[index]!; });
      const pass = fixed < legacy * .5;
      lines.push(`${pass ? 'PASS' : 'FAIL'} ${quality}: door stripe energy ${legacy.toFixed(3)} → ${fixed.toFixed(3)}`);
    }
    lines.push(`${JSON.stringify(scene) === originalScene ? 'PASS' : 'FAIL'} scene unchanged`);
    lines.push(`${errors.length === 0 ? 'PASS' : 'FAIL'} viewport errors: ${errors.join('; ') || 'none'}`);
    output.textContent = lines.join('\n');
  } catch (error) { output.textContent = `FAIL ${String(error)}`; }
}
const button = document.createElement('button'); button.textContent = 'Compare daylight filtering';
button.onclick = () => void run(); document.querySelector('#controls')!.append(button);
void run();
window.addEventListener('pagehide', () => { viewport.dispose(); THREE.Mesh.prototype.onBeforeRender = previous; }, { once: true });
