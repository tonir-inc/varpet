/** Isolated browser QA: real WebGL pixels and the same viewport as the editor. */
import * as THREE from 'three';
import { SelectionOutline } from './selection-outline';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';

const output = document.querySelector<HTMLPreElement>('#result')!;
const errors: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect: id => viewport.setSelection(id), onInteraction() {}, onTransform() {},
  onError: message => errors.push(message),
});
viewport.setScene(demoScene, localCatalog); viewport.setSelection('bed');
document.querySelector<HTMLButtonElement>('#bed')!.onclick = () => viewport.setSelection('bed');
document.querySelector<HTMLButtonElement>('#group')!.onclick = () => viewport.setSelection('bed', ['bed', 'bedside-table']);
document.querySelector<HTMLButtonElement>('#clear')!.onclick = () => viewport.setSelection(null);
let top = false;
document.querySelector<HTMLButtonElement>('#top')!.onclick = () => { top = !top; viewport.setView(top ? 'top' : 'perspective'); };

document.querySelector<HTMLButtonElement>('#run')!.onclick = () => {
  const results: string[] = [];
  const check = (ok: unknown, label: string) => {
    if (!ok) throw new Error(label);
    results.push(`PASS ${label}`); output.textContent = results.join('\n');
  };
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(128, 128); renderer.setPixelRatio(1);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202127');
  const group = new THREE.Group(); scene.add(group);
  const material = new THREE.MeshBasicMaterial({ color: '#78604b' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); group.add(mesh);
  const second = new THREE.Mesh(mesh.geometry, material); second.position.x = 1.6; scene.add(second);
  const hidden = new THREE.Mesh(mesh.geometry, material); hidden.visible = false; scene.add(hidden);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50); camera.position.set(0, 0, 6); camera.updateMatrixWorld();
  const ortho = new THREE.OrthographicCamera(-2.5, 2.5, 2.5, -2.5, 0.1, 50); ortho.position.copy(camera.position); ortho.updateMatrixWorld();
  const pass = new SelectionOutline(scene, camera);
  pass.downSampleRatio = 1; pass.setSize(128, 128);
  const read = new THREE.WebGLRenderTarget(128, 128), write = read.clone();
  const pixels = new Uint8Array(128 * 128 * 4);
  const background = scene.background;
  const draw = () => {
    renderer.setRenderTarget(read); renderer.setClearColor('#202127', 1); renderer.clear();
    renderer.render(scene, pass.renderCamera);
    if (pass.enabled) pass.render(renderer, write, read, 0, false);
    renderer.readRenderTargetPixels(read, 0, 0, 128, 128, pixels);
    let white = 0, violet = 0, right = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
      if (r > 210 && g > 210 && b > 210) { white++; if ((i / 4) % 128 > 85) right++; }
      if (b > r + 10 && r > g + 5) violet++;
    }
    return { white, violet, right };
  };
  try {
    check(!pass.enabled, 'no selection disables the pass');
    const original = JSON.stringify(demoScene);
    pass.setSelection([group]);
    let sample = draw();
    check(sample.white > 40 && sample.violet > 40, 'perspective renders a white contour and violet halo');
    check(sample.right === 0, 'unselected neighbour has no white outline');
    check(scene.background === background && scene.overrideMaterial === null && !hidden.visible && mesh.visible,
      'outline restores scene background, material and exact visibility');
    check(renderer.autoClear && !renderer.shadowMap.enabled && renderer.getRenderTarget() === read,
      'outline restores renderer state');
    pass.setSelection([group, second]); sample = draw();
    check(sample.right > 30, 'multi-selection outlines the second object too');
    group.visible = false; pass.setSelection([group]); sample = draw();
    check(sample.white === 0 && sample.violet === 0 && !group.visible, 'hidden parent layers stay hidden without ghost outlines');
    group.visible = true; pass.renderCamera = ortho; sample = draw();
    check(sample.white > 40 && sample.violet > 40, 'orthographic view retains white contour and violet halo');
    check(pass.prepareMaskMaterial.uniforms.selectionOrthographic!.value === true, 'Top uses orthographic depth conversion');
    pass.renderCamera = camera; draw();
    check(pass.prepareMaskMaterial.uniforms.selectionOrthographic!.value === false, 'returning to 3D restores perspective depth conversion');
    mesh.material = new THREE.MeshBasicMaterial({ color: '#95bbcc', transparent: true, opacity: 0.3, depthWrite: false });
    sample = draw(); check(sample.white > 40, 'selected glass retains its outline');
    mesh.material.dispose(); mesh.material = material;
    pass.setSelection([]); sample = draw();
    check(!pass.enabled && sample.white === 0 && sample.violet === 0, 'clearing selection removes the outline completely');
    pass.downSampleRatio = 2; pass.setSize(256, 256);
    check(pass.renderTargetEdgeBuffer1.width === 128 && pass.renderTargetMaskBuffer.width === 256,
      'retina resize keeps edge buffers at CSS pixel resolution');
    check(original === JSON.stringify(demoScene) && errors.length === 0, 'viewport feedback leaves the document unchanged and reports no rendering errors');
    let disposed = 0;
    for (const target of [pass.renderTargetMaskBuffer, pass.renderTargetDepthBuffer, pass.renderTargetMaskDownSampleBuffer,
      pass.renderTargetBlurBuffer1, pass.renderTargetBlurBuffer2, pass.renderTargetEdgeBuffer1, pass.renderTargetEdgeBuffer2]) {
      target.addEventListener('dispose', () => disposed++);
    }
    pass.dispose(); check(disposed === 7, 'all seven outline render targets are disposed');
    output.textContent += `\nCOMPLETE ${results.length} selection checks.`;
  } catch (error) {
    output.textContent += `\nFAIL ${error instanceof Error ? error.message : String(error)}`;
    pass.dispose();
  } finally {
    read.dispose(); write.dispose(); mesh.geometry.dispose(); material.dispose(); renderer.dispose();
  }
};
