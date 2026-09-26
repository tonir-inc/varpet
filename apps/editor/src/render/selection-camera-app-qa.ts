/** Loads the real app. UI events exercise the selection scheduler and actual inspector geometry. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const wardrobe = 'bedroom-wardrobe';
const runtimeErrors: string[] = [];
window.addEventListener('error', event => runtimeErrors.push(`Uncaught: ${event.message}`));
window.addEventListener('unhandledrejection', event => runtimeErrors.push(`Unhandled rejection: ${String(event.reason)}`));
let world: THREE.Scene | undefined, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined, orbit: OrbitControls | undefined;
let samples: THREE.Vector3[] = [];
const originalBeforeRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  originalBeforeRender.apply(this, args);
  const [renderer, scene, renderedCamera] = args;
  if (renderer.domElement.parentElement?.id !== 'viewport' || !(scene instanceof THREE.Scene) || !scene.background
    || !(renderedCamera instanceof THREE.PerspectiveCamera || renderedCamera instanceof THREE.OrthographicCamera)) return;
  world = scene; camera = renderedCamera;
  if (!samples.at(-1)?.equals(camera.position)) samples.push(camera.position.clone());
};
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function (...args) {
  if (this.domElement?.parentElement?.id === 'viewport') orbit = this;
  return originalUpdate.apply(this, args);
};
await import('../main');
OrbitControls.prototype.update = originalUpdate;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.style.width = '1100px'; app.style.height = '800px';
const panel = document.createElement('aside');
panel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:1000;background:#171d25f5;border:1px solid #a68bc6;border-radius:8px;padding:10px;color:white;width:570px;max-width:90vw;font:12px system-ui';
panel.innerHTML = '<strong>Real app selection camera QA</strong> <button id="run-app-camera" style="padding:6px">Run integration</button><pre id="app-camera-result" style="max-height:160px;overflow:auto;white-space:pre-wrap;margin-top:8px">Ready. Loads main.ts and its real selection, inspector and focus handlers.</pre>';
document.body.append(panel);
const output = panel.querySelector<HTMLPreElement>('#app-camera-result')!, button = panel.querySelector<HTMLButtonElement>('#run-app-camera')!;
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => { const result = document.querySelector<T>(selector); if (!result) throw new Error(`Missing UI ${selector}`); return result; };
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const results: string[] = [];
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
function root(): THREE.Object3D {
  let found: THREE.Object3D | undefined;
  world?.traverse(node => { if (node.userData.objectId === wardrobe) found = node; });
  if (!found || !camera || !orbit) throw new Error('Main viewport has not rendered the wardrobe');
  return found;
}
function projected(): { left: number; right: number; top: number; bottom: number } {
  const box = new THREE.Box3().setFromObject(root()), canvas = $('#viewport'), points: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z).project(camera!));
  return { left: Math.min(...points.map(p => (p.x + 1) * canvas.clientWidth / 2)), right: Math.max(...points.map(p => (p.x + 1) * canvas.clientWidth / 2)), top: Math.min(...points.map(p => (1 - p.y) * canvas.clientHeight / 2)), bottom: Math.max(...points.map(p => (1 - p.y) * canvas.clientHeight / 2)) };
}
function safeRight(): number { return $('.right-panel').offsetLeft - $('#viewport').offsetLeft - 24; }
function selected(): boolean { return !$('.right-panel').hidden && $('#selected-name').textContent === 'Oak bedroom wardrobe'; }
async function reset(): Promise<void> {
  $('#close-inspector').click(); $('#perspective').click(); $('[data-tool="select"]').click(); $('#focus').click(); await delay(650); samples = [];
}
function clickWardrobeInCanvas(): void {
  const box = new THREE.Box3().setFromObject(root()), canvas = $<HTMLCanvasElement>('#viewport canvas'), bounds = canvas.getBoundingClientRect();
  const point = box.getCenter(new THREE.Vector3()).project(camera!);
  const clientX = bounds.left + (point.x + 1) * bounds.width / 2, clientY = bounds.top + (1 - point.y) * bounds.height / 2;
  const init = { bubbles: true, pointerId: 91, pointerType: 'mouse', isPrimary: true, button: 0, clientX, clientY };
  // Preserve real listener ordering; only the synthetic pointer lacks a native capture token.
  const capture = canvas.setPointerCapture, release = canvas.releasePointerCapture;
  canvas.setPointerCapture = function (id) { if (id !== init.pointerId) capture.call(this, id); };
  canvas.releasePointerCapture = function (id) { if (id !== init.pointerId) release.call(this, id); };
  try { canvas.dispatchEvent(new PointerEvent('pointerdown', init)); canvas.dispatchEvent(new PointerEvent('pointerup', init)); }
  finally { canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; }
}
button.onclick = async () => {
  button.disabled = true; results.length = 0;
  try {
    await delay(100); if ($('#scene-tab').getAttribute('aria-expanded') !== 'true') $('#scene-tab').click();
    await reset(); const initial = projected(), before = camera!.position.clone(), revision = $('#revision').textContent;
    $('#hierarchy [data-object="bedroom-wardrobe"]').click(); await delay(650);
    check(initial.right > safeRight(), `real app fixture begins occluded (${initial.right.toFixed(1)} > ${safeRight()})`);
    check(selected(), 'hierarchy click opens the wardrobe inspector');
    check(projected().right <= safeRight() + 1 && projected().left >= 23, 'hierarchy selection clears the actual inspector edge');
    check(samples.some(position => position.distanceTo(before) > 1e-5 && position.distanceTo(camera!.position) > 1e-5), 'main selection handler produces a gentle animated pan');
    await reset(); clickWardrobeInCanvas(); await delay(650);
    check(selected(), `canvas ray selection opens the wardrobe inspector (selected ${$('#selected-name').textContent})`);
    check(projected().right <= safeRight() + 1, 'canvas selection clears the actual inspector edge');
    await reset(); const apartmentDistance = camera!.position.distanceTo(orbit!.target);
    $('#hierarchy [data-object="bedroom-wardrobe"]').click(); $('#focus-selected').click(); await delay(650);
    check(camera!.position.distanceTo(orbit!.target) < apartmentDistance * 0.75, 'explicit Frame selection wins over the same-tick automatic reveal');
    check($('#revision').textContent === revision && revision === 'Revision 0', 'real app selection and framing preserve revision 0');
    check($('#render-error').hidden && runtimeErrors.length === 0, `main renderer and browser report no error${runtimeErrors.length ? `: ${runtimeErrors.join('; ')}` : ''}`);
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} app integration checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { button.disabled = false; }
};
