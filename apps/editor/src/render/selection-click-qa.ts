/** Real application selection and OrbitControls, with an isolated catalog-free shell. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { databaseCatalog } from '../adapters/database-catalog';
import { demoScene } from '../core/demo';

databaseCatalog.search = async () => ({ products: [], excluded: 0, nextOffset: null });
databaseCatalog.resolve = async () => [];

const runtimeErrors: string[] = [];
window.addEventListener('error', event => runtimeErrors.push(event.message));
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)));
let world: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
let orbit: OrbitControls | undefined;
const originalBeforeRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  originalBeforeRender.apply(this, args);
  const [renderer, scene, renderedCamera] = args;
  if (renderer.domElement.parentElement?.id === 'viewport' && scene instanceof THREE.Scene && scene.background
    && (renderedCamera instanceof THREE.PerspectiveCamera || renderedCamera instanceof THREE.OrthographicCamera)) {
    world = scene; camera = renderedCamera;
  }
};
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function (...args) {
  if (this.domElement?.parentElement?.id === 'viewport') orbit = this;
  return originalUpdate.apply(this, args);
};
await import('../main');
OrbitControls.prototype.update = originalUpdate;

const panel = document.createElement('aside');
panel.style.cssText = 'position:fixed;left:8px;bottom:28px;z-index:1000;max-width:500px;padding:10px;background:#171d25f5;border:1px solid #a68bc6;border-radius:8px;color:white;font:12px system-ui';
panel.innerHTML = '<strong>Viewport selection QA</strong> <button id="run-selection-click" style="padding:6px">Run checks</button><pre id="selection-click-result" style="max-height:180px;overflow:auto;white-space:pre-wrap">Ready. Imports an empty demo shell into this QA page only.</pre>';
document.body.append(panel);
const output = panel.querySelector<HTMLPreElement>('#selection-click-result')!;
const runButton = panel.querySelector<HTMLButtonElement>('#run-selection-click')!;
const lines: string[] = [];
const delay = (ms = 750) => new Promise<void>(resolve => setTimeout(resolve, ms));
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
  lines.push(`PASS ${label}`); output.textContent = lines.join('\n');
}
function entityId(object: THREE.Object3D): string | undefined {
  let ancestor: THREE.Object3D | null = object;
  while (ancestor && !ancestor.userData.objectId && !ancestor.userData.entityId) ancestor = ancestor.parent;
  return ancestor?.userData.objectId ?? ancestor?.userData.entityId;
}
interface Point { x: number; y: number }
function exposedPoint(id: string): Point {
  if (!world || !camera) throw new Error('The application viewport has not rendered');
  const canvas = $<HTMLCanvasElement>('#viewport canvas'), rect = canvas.getBoundingClientRect();
  const pickables: THREE.Object3D[] = [], candidates: THREE.Vector3[] = [];
  world.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  world.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite) || !entityId(object)) return;
    pickables.push(object);
    if (!(object instanceof THREE.Mesh) || entityId(object) !== id) return;
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    // Sample the rendered mesh, then verify its projected point really hits this
    // entity first. This avoids hard-coded pixels and hidden/occluded surfaces.
    for (const x of [0.5, 0.2, 0.8]) for (const y of [0.5, 0.2, 0.8]) for (const z of [0.5, 0.2, 0.8]) {
      candidates.push(new THREE.Vector3(
        THREE.MathUtils.lerp(box.min.x, box.max.x, x), THREE.MathUtils.lerp(box.min.y, box.max.y, y),
        THREE.MathUtils.lerp(box.min.z, box.max.z, z),
      ).applyMatrix4(object.matrixWorld));
    }
  });
  const ray = new THREE.Raycaster();
  for (const candidate of candidates) {
    const projected = candidate.project(camera);
    if (Math.abs(projected.x) >= 0.97 || Math.abs(projected.y) >= 0.97 || Math.abs(projected.z) > 1) continue;
    const point = { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
    if (document.elementFromPoint(point.x, point.y) !== canvas) continue;
    ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit && entityId(hit.object) === id) return point;
  }
  throw new Error(`No exposed canvas point for ${id}`);
}
function gesture(point: Point, options: { shiftKey?: boolean; delta?: Point; button?: number; releaseOutside?: boolean } = {}): void {
  const canvas = $<HTMLCanvasElement>('#viewport canvas');
  const pointerId = 91, button = options.button ?? 0;
  const init = { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true, button, shiftKey: options.shiftKey ?? false };
  const capture = canvas.setPointerCapture, release = canvas.releasePointerCapture;
  // Synthetic pointers have no native capture token; retain the real canvas →
  // document → window bubbling and all OrbitControls/application listeners.
  canvas.setPointerCapture = function (id) { if (id !== pointerId) capture.call(this, id); };
  canvas.releasePointerCapture = function (id) { if (id !== pointerId) release.call(this, id); };
  const send = (type: string, at: Point, target: Element = canvas) => target.dispatchEvent(new PointerEvent(type, {
    ...init, clientX: at.x, clientY: at.y, buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : 1,
  }));
  try {
    send('pointerdown', point);
    const end = { x: point.x + (options.delta?.x ?? 0), y: point.y + (options.delta?.y ?? 0) };
    if (options.delta) send('pointermove', end);
    if (options.releaseOutside) {
      // A UI surface can cover an uncaptured Shift gesture before release.
      // Keep coordinates unchanged so this tests event origin, not drag distance.
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;left:${end.x - 1}px;top:${end.y - 1}px;width:2px;height:2px;z-index:2000`;
      document.body.append(overlay);
      try { send('pointerup', end, overlay); } finally { overlay.remove(); }
    } else send('pointerup', end);
  } finally { canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; }
}
function selectedName(): string { return $('#selected-name').textContent ?? ''; }
function entityRow(id: string): HTMLButtonElement {
  return $<HTMLButtonElement>(`.rv-entity-row[data-action="select"][data-id="${CSS.escape(id)}"]`);
}
function selectedIds(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.rv-entity-row[aria-pressed="true"]')].map(row => row.dataset.id!);
}
async function selectInCanvas(id: string, name: string | undefined, label: string): Promise<void> {
  // Import normalizes and splits walls, so their numbered labels must come from
  // the current scene row for this stable ID, rather than the original fixture.
  const expectedName = name ?? entityRow(id).children.item(1)?.textContent;
  if (!expectedName) throw new Error(`Missing current scene label for ${id}`);
  gesture(exposedPoint(id));
  check(!$('.right-panel').hidden && selectedName() === expectedName && selectedIds().length === 1
    && entityRow(id).getAttribute('aria-pressed') === 'true', `${label} (selected: ${selectedName() || 'nothing'}; ID: ${selectedIds().join(', ') || 'none'})`);
  await delay();
}

runButton.onclick = async () => {
  runButton.disabled = true; lines.length = 0; output.textContent = 'Running…';
  try {
    const shell = { ...structuredClone(demoScene), objects: [], name: 'Selection click QA shell' };
    const data = new DataTransfer();
    data.items.add(new File([JSON.stringify(shell)], 'selection-shell.json', { type: 'application/json' }));
    const file = $<HTMLInputElement>('#file-input'); file.files = data.files; file.dispatchEvent(new Event('change', { bubbles: true }));
    for (let attempt = 0; attempt < 80 && $('#project-name').textContent !== shell.name; attempt++) await delay(50);
    check($('#project-name').textContent === shell.name, 'deterministic empty shell imported without catalog assets');
    $('#perspective').click(); $('[data-tool="select"]').click(); $('#close-inspector').click();
    const outerWalls = $<HTMLInputElement>('#show-outer-walls'); outerWalls.checked = true; outerWalls.dispatchEvent(new Event('change', { bubbles: true }));
    $('#focus').click(); await delay();
    check(!!orbit && !!world && !!camera, 'real application renderer and OrbitControls captured');
    const revision = $('#revision').textContent;
    await selectInCanvas('wall-north', undefined, 'plain wall click opens Properties');
    await selectInCanvas('window-living', 'window · window-living', 'plain window click replaces wall selection');
    await selectInCanvas('room-living', 'Living & dining', 'plain floor click replaces window selection');
    await selectInCanvas('window-living', 'window · window-living', 'a later plain click updates selection again');
    await selectInCanvas('wall-north', undefined, 'wall can be selected again after window and floor');
    gesture(exposedPoint('wall-east'), { shiftKey: true });
    check($('#selection-status').textContent === '2 walls selected' && selectedIds().length === 2
      && ['wall-north', 'wall-east'].every(id => entityRow(id).getAttribute('aria-pressed') === 'true'), 'Shift-click adds the intended second wall');
    await delay();
    const beforeDrag = selectedName(), beforeCamera = camera!.position.clone();
    gesture(exposedPoint('wall-north'), { delta: { x: 45, y: 18 } });
    check(selectedName() === beforeDrag && $('#selection-status').textContent === '2 walls selected', 'orbit drag preserves selection');
    check(camera!.position.distanceTo(beforeCamera) > 0.001, 'orbit drag still moves the real camera');
    await delay();
    const beforePan = orbit!.target.clone();
    gesture(exposedPoint('wall-north'), { button: 2, delta: { x: 30, y: 12 } });
    check(selectedName() === beforeDrag && $('#selection-status').textContent === '2 walls selected', 'right-button pan preserves selection');
    check(orbit!.target.distanceTo(beforePan) > 0.001, 'right-button pan still moves the real camera target');
    await delay();
    await selectInCanvas('room-living', 'Living & dining', 'plain click works after orbit drag');
    gesture(exposedPoint('wall-north'), { shiftKey: true, releaseOutside: true });
    check(selectedIds().length === 1 && entityRow('room-living').getAttribute('aria-pressed') === 'true'
      && selectedName() === 'Living & dining', 'uncaptured pointer release over external UI preserves selection');
    await selectInCanvas('wall-north', undefined, 'plain click works after an external pointer release');
    check($('#revision').textContent === revision, 'selection and navigation leave the scene revision unchanged');
    check($('#render-error').hidden && runtimeErrors.length === 0, `no renderer or runtime errors${runtimeErrors.length ? `: ${runtimeErrors.join('; ')}` : ''}`);
    output.textContent = `${lines.join('\n')}\nCOMPLETE ${lines.length} selection checks.`;
  } catch (error) {
    output.textContent = `${lines.join('\n')}\nFAIL ${error instanceof Error ? error.stack : String(error)}`;
  } finally { runButton.disabled = false; }
};
