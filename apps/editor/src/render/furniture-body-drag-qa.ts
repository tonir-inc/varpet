/** Isolated browser regression: pointer events must move furniture bodies, not the camera. */
import * as THREE from 'three';
import { TransformControls, TransformControlsGizmo } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { EditorStore } from '../core/store';
import { selectionTransformOperations } from '../core/multi-selection';
import { migrateScene } from '../core/renovation';
import type { CatalogAsset, SceneDocument } from '../contracts';

const results = document.querySelector<HTMLPreElement>('#results')!;
const lines: string[] = [];
let assertions = 0;
function check(value: unknown, message: string): void {
  if (!value) throw new Error(message);
  lines.push(`PASS ${message}`); assertions++; results.textContent = lines.join('\n');
}
const delay = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const asset: CatalogAsset = { id: 'body-qa-cabinet', name: 'Drag cabinet', category: 'Storage', kind: 'cabinet', dimensions: [1.2, 1.2, 1.2], color: '#bdac90', price: 0, source: { type: 'procedural' } };
const scene: SceneDocument = { format: 'varpet.editor', version: 1, id: 'body-qa', name: 'Furniture drag QA', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#b3a58e', polygon: [[-6, -6], [6, -6], [6, 6], [-6, 6]] }], walls: [],
  objects: [-2, 2].map((x, i) => ({ id: `piece-${i}`, name: `Piece ${i}`, assetId: asset.id, position: [x, 0, 0], rotation: 0, scale: [1, 1, 1] })) };
const store = new EditorStore(scene, [asset]);
let controls!: TransformControls;
const getHelper = TransformControls.prototype.getHelper;
TransformControls.prototype.getHelper = function () { controls = this; return getHelper.call(this); };
let selected: string | null = null, ids: string[] = [], sequence = 0, attempts = 0, active = false, interactionRevision = 0;
const viewport = createViewport(document.querySelector<HTMLElement>('#viewport')!, {
  onSelect(id, additive) {
    if (active) return;
    selected = id; ids = id ? additive ? [...new Set([...ids, id])] : [id] : [];
    viewport.setSelection(selected, ids);
  },
  onInteraction(value) { active = value; if (value) interactionRevision = store.revision; },
  onTransform(id, patch) {
    attempts++;
    store.execute({ id: `body-${++sequence}`, label: 'Body move', source: 'human', baseRevision: interactionRevision,
      operations: selectionTransformOperations(store.scene, id, patch, ids) }, true);
    viewport.setScene(store.scene, [asset]); viewport.setSelection(selected, ids);
  },
  onError(message) { throw new Error(message); },
});
TransformControls.prototype.getHelper = getHelper;
store.subscribe(() => viewport.setScene(store.scene, [asset]));
const canvas = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
// Synthetic events cannot acquire native pointer capture; record the lifecycle instead.
const captured = new Set<number>();
canvas.setPointerCapture = id => { captured.add(id); };
canvas.hasPointerCapture = id => captured.has(id);
canvas.releasePointerCapture = id => { captured.delete(id); };
function findRoot(id: string): THREE.Object3D {
  let found: THREE.Object3D | undefined;
  controls.getHelper().parent!.traverse(object => { if (object.userData.objectId === id) found = object; });
  if (!found) throw new Error(`Missing render root ${id}`); return found;
}
function screen(point: THREE.Vector3) {
  controls.camera.updateMatrixWorld(true);
  const projected = point.clone().project(controls.camera), rect = canvas.getBoundingClientRect();
  return { clientX: rect.left + (projected.x + 1) * rect.width / 2, clientY: rect.top + (1 - projected.y) * rect.height / 2 };
}
function pointer(type: string, point: THREE.Vector3, extra: PointerEventInit = {}) {
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 81, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, ...screen(point), ...extra }));
}
function body(id: string) { const p = store.scene.objects.find(o => o.id === id)!.position; return new THREE.Vector3(p[0] - .28, 1.19, p[2] + .22); }
function choose(selection: string[]) { ids = selection; selected = ids[0] ?? null; viewport.setSelection(selected, ids); }
try {
  viewport.setScene(store.scene, [asset]); viewport.setView('top'); viewport.setTool('move'); await delay(500);
  let origin = body('piece-0'), target = origin.clone().add(new THREE.Vector3(.5, 0, .75));
  const cameraBefore = controls.camera.position.clone();
  pointer('pointerdown', origin); pointer('pointermove', target); await delay();
  check(selected === 'piece-0' && active, 'grabbing an unselected furniture body selects it and starts movement');
  check(near(findRoot('piece-0').position.x, -1.5) && near(findRoot('piece-0').position.z, .75), 'body preview preserves grab offset and moves on both floor axes');
  check(store.revision === 0 && attempts === 0, 'pointer preview leaves document and undo history unchanged');
  check(controls.camera.position.equals(cameraBefore), 'body dragging does not orbit the camera');
  pointer('pointerup', target);
  check(store.revision === 1 && attempts === 1 && !active && captured.size === 0, 'release commits once and releases interaction and pointer capture');
  check(near(store.scene.objects[0]!.position[0], -1.5) && near(store.scene.objects[0]!.position[2], .75), 'checked command retains exact preview position');
  store.undo(); await delay(350);
  check(near(store.scene.objects[0]!.position[0], -2), 'one undo restores body movement');

  origin = body('piece-0'); const revision = store.revision, initialAttempts = attempts;
  pointer('pointerdown', origin); canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 81, button: 0, buttons: 1, clientX: screen(origin).clientX + 2, clientY: screen(origin).clientY })); pointer('pointerup', origin);
  check(store.revision === revision && attempts === initialAttempts, 'click and sub-threshold motion create no edit');
  pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(.5, 0, .5))); viewport.cancelInteraction();
  check(near(findRoot('piece-0').position.x, -2) && store.revision === revision && captured.size === 0, 'Escape-style cancel restores placement and capture');
  pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(.5, 0, .5))); canvas.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 81 }));
  check(!active && near(findRoot('piece-0').position.x, -2) && store.revision === revision, 'lost capture cancels body manipulation');
  pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(.5, 0, .5))); window.dispatchEvent(new Event('blur'));
  check(!active && near(findRoot('piece-0').position.x, -2) && store.revision === revision, 'window blur cancels body manipulation');
  pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(.5, 0, .5))); viewport.setTool('rotate');
  check(!active && near(findRoot('piece-0').position.x, -2) && store.revision === revision && captured.size === 0, 'switching tools cancels body manipulation');
  viewport.setTool('move');
  pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(.5, 0, .5)), { pointerId: 82 });
  check(near(findRoot('piece-0').position.x, -2), 'another pointer cannot move the captured furniture'); viewport.cancelInteraction();

  choose(['piece-0', 'piece-1']); origin = body('piece-1'); target = origin.clone().add(new THREE.Vector3(.5, 0, .25));
  pointer('pointerdown', origin); pointer('pointermove', target); pointer('pointerup', target);
  check(ids.length === 2 && near(store.scene.objects[0]!.position[0], -1.5) && near(store.scene.objects[1]!.position[0], 2.5), 'grabbing another selected body preserves and moves the entire selection');
  store.undo(); await delay(350); choose(['piece-0']); origin = body('piece-0');
  pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(30, 0, 0))); pointer('pointerup', origin.clone().add(new THREE.Vector3(30, 0, 0)));
  check(near(store.scene.objects[0]!.position[0], -2) && near(findRoot('piece-0').position.x, -2), 'rejected placement restores authoritative and rendered furniture');

  viewport.setSnap(false); origin = body('piece-0'); target = origin.clone().add(new THREE.Vector3(.37, 0, .19));
  pointer('pointerdown', origin); pointer('pointermove', target); pointer('pointerup', target);
  check(near(store.scene.objects[0]!.position[0], -1.63) && near(store.scene.objects[0]!.position[2], .19), 'Snap off retains precise body movement');
  await delay(350);
  const gizmo = controls.getHelper().children.find(child => child instanceof TransformControlsGizmo) as TransformControlsGizmo;
  controls.getHelper().updateMatrixWorld(true);
  const axis = gizmo.picker.translate.children.find(child => child.name === 'X')!;
  const axisPoint = new THREE.Box3().setFromObject(axis).getCenter(new THREE.Vector3());
  const beforeGizmo = store.scene.objects[0]!.position.slice(), beforeGizmoAttempts = attempts;
  pointer('pointerdown', axisPoint);
  check(controls.enabled && controls.dragging && controls.axis === 'X', 'the visible X gizmo keeps priority after a body drag');
  const axisTarget = axisPoint.clone().add(new THREE.Vector3(.5, 0, .75));
  pointer('pointermove', axisTarget); pointer('pointerup', axisTarget);
  check(attempts === beforeGizmoAttempts + 1 && near(store.scene.objects[0]!.position[0], beforeGizmo[0]! + .5) && near(store.scene.objects[0]!.position[2], beforeGizmo[2]!), `gizmo dragging still constrains movement to its chosen axis (attempts ${attempts - beforeGizmoAttempts}; before ${beforeGizmo.join(',')}; after ${store.scene.objects[0]!.position.join(',')}; axis ${controls.axis})`);
  viewport.setView('perspective'); await delay(500);
  origin = body('piece-0'); target = origin.clone().add(new THREE.Vector3(.4, 0, .3)); const before3D = store.scene.objects[0]!.position.slice();
  pointer('pointerdown', origin); pointer('pointermove', target); pointer('pointerup', target);
  check(store.scene.objects[0]!.position[0] > before3D[0]! + .25 && store.scene.objects[0]!.position[2] > before3D[2]! + .15, 'perspective body drag moves furniture across the floor');
  check(near(store.scene.objects[0]!.position[1], 0), 'perspective drag preserves floor elevation');
  const beforeViewChange = store.scene.objects[0]!.position.slice(), beforeViewRevision = store.revision;
  origin = body('piece-0'); pointer('pointerdown', origin); pointer('pointermove', origin.clone().add(new THREE.Vector3(.6, 0, .4))); viewport.setView('top');
  check(!active && captured.size === 0 && store.revision === beforeViewRevision && near(findRoot('piece-0').position.x, beforeViewChange[0]!), 'switching views cancels body manipulation');
  await delay(500);

  const grouped = migrateScene(structuredClone(scene)); grouped.objects.forEach(object => { object.groupId = 'body-group'; });
  store.execute({ id: `body-${++sequence}`, label: 'Prepare grouped QA', source: 'human', baseRevision: store.revision, operations: [{ type: 'replace-scene', scene: grouped }] }, true);
  choose([]); viewport.setSnap(true); await delay(350);
  const groupRevision = store.revision; origin = body('piece-0'); target = origin.clone().add(new THREE.Vector3(.5, 0, .25));
  pointer('pointerdown', origin); pointer('pointermove', target); pointer('pointerup', target);
  check(store.revision === groupRevision + 1 && store.scene.objects.every(object => object.groupId === 'body-group') && near(store.scene.objects[0]!.position[0], -1.5) && near(store.scene.objects[1]!.position[0], 2.5), 'grabbing one grouped piece moves all members in one command and retains membership');
  store.execute({ id: `body-${++sequence}`, label: 'Lock grouped QA member', source: 'human', baseRevision: store.revision, operations: [{ type: 'set-metadata', id: 'piece-1', patch: { locked: true } }] }, true);
  choose([]); await delay(350); const lockedRevision = store.revision, lockedAttempts = attempts;
  origin = body('piece-0'); target = origin.clone().add(new THREE.Vector3(.5, 0, .25));
  pointer('pointerdown', origin); pointer('pointermove', target); pointer('pointerup', target);
  check(store.revision === lockedRevision && attempts === lockedAttempts && near(findRoot('piece-0').position.x, -1.5) && near(findRoot('piece-1').position.x, 2.5), 'a locked group member blocks the entire body move');
  viewport.dispose(); results.textContent = `${lines.join('\n')}\nCOMPLETE ${assertions} furniture body drag checks.`;
} catch (error) {
  results.textContent = `${lines.join('\n')}\nFAIL ${error instanceof Error ? error.stack : String(error)}`;
}
