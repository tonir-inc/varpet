/** Browser integration check: independent selected objects remain independent after a shared gesture. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { createWallMove } from './wall-move';
import { EditorStore } from '../core/store';
import { demoScene, localCatalog } from '../core/demo';
import { migrateScene } from '../core/renovation';
import type { Operation, Vec2 } from '../contracts';

const output = document.querySelector<HTMLPreElement>('#results')!;
const lines: string[] = [];
let assertions = 0, commits = 0, commandId = 0;
let interactionStarts = 0, additivePicks = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
  assertions++; lines.push(`PASS ${message}`); output.textContent = lines.join('\n');
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
let controls: TransformControls;
const attach = TransformControls.prototype.attach;
TransformControls.prototype.attach = function(object) { controls = this; return attach.call(this, object); };
const store = new EditorStore(demoScene, localCatalog);
const ids = store.scene.objects.slice(0, 2).map(object => object.id);
const viewport = createViewport(document.querySelector<HTMLElement>('#viewport')!, {
  onSelect(_id, additive) { if (additive) additivePicks++; }, onInteraction(active) { if (active) interactionStarts++; }, onError(message) { throw new Error(message); },
  onTransform(id, patch) {
    const original = store.scene.objects.find(object => object.id === id)!;
    const operations: Operation[] = ids.map(memberId => {
      const member = store.scene.objects.find(object => object.id === memberId)!;
      return { type: 'update', id: memberId, patch: { position: member.position.map((value, axis) => value + patch.position![axis]! - original.position[axis]!) as [number, number, number] } };
    });
    commits++;
    store.execute({ id: `multi-browser-${++commandId}`, label: 'Move selected furniture', source: 'human', baseRevision: store.revision, operations }, true);
    viewport.setScene(store.scene, localCatalog);
  },
});
store.subscribe(() => viewport.setScene(store.scene, localCatalog));
const begin = () => controls!.dispatchEvent({ type: 'mouseDown', mode: controls!.mode });
const change = (dx: number, dz: number) => {
  controls!.object!.position.x += dx; controls!.object!.position.z += dz;
  controls!.dispatchEvent({ type: 'objectChange' });
};
const roots = () => ids.map(id => controls!.object!.parent!.children.find(child => child.userData.objectId === id)!);
try {
  viewport.setScene(store.scene, localCatalog); viewport.setSelection(ids[0]!); viewport.setTool('move'); await tick();
  viewport.setSelection(ids[0]!, ids);
  assert(!!controls!.object, 'independent selected models have a shared move handle');
  const viewportCanvas = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
  const capture = viewportCanvas.releasePointerCapture;
  viewportCanvas.releasePointerCapture = () => {};
  const clickPoint = controls!.object!.position.clone().project(controls!.camera), bounds = viewportCanvas.getBoundingClientRect();
  const clickOptions = { bubbles: true, pointerId: 42, button: 0, clientX: bounds.left + (clickPoint.x + 1) * bounds.width / 2, clientY: bounds.top + (1 - clickPoint.y) * bounds.height / 2, shiftKey: true };
  const beforeClicks = interactionStarts;
  viewportCanvas.dispatchEvent(new PointerEvent('pointerdown', clickOptions)); viewportCanvas.dispatchEvent(new PointerEvent('pointerup', clickOptions));
  assert(additivePicks === 1 && interactionStarts === beforeClicks, 'Shift-click on the active model selects without starting a transform');
  viewport.setAdditiveSelection(true);
  assert(!controls!.object, 'Multi-select mode suppresses the move handle while choosing items');
  viewportCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...clickOptions, shiftKey: false })); viewportCanvas.dispatchEvent(new PointerEvent('pointerup', { ...clickOptions, shiftKey: false }));
  assert(additivePicks === 2 && interactionStarts === beforeClicks, 'Multi-select mode adds items without a keyboard modifier');
  viewport.setAdditiveSelection(false); viewportCanvas.releasePointerCapture = capture;
  const original = ids.map(id => store.scene.objects.find(object => object.id === id)!);
  begin(); change(0.5, 0.25);
  assert(roots().every((root, i) => near(root.position.x, original[i]!.position[0] + 0.5) && near(root.position.z, original[i]!.position[2] + 0.25)), 'all independent selected models follow the live drag');
  assert(store.revision === 0, 'live preview does not mutate the document');
  viewport.cancelInteraction();
  assert(roots().every((root, i) => near(root.position.x, original[i]!.position[0]) && near(root.position.z, original[i]!.position[2])), 'cancel restores all selected models');
  assert(commits === 0 && store.revision === 0, 'cancel creates no command or history');
  begin(); change(0.5, 0.25); controls!.dispatchEvent({ type: 'mouseUp', mode: controls!.mode });
  assert(commits === 1 && store.revision === 1, 'one release creates one selected-model move command');
  assert(ids.every((id, i) => near(store.scene.objects.find(object => object.id === id)!.position[0], original[i]!.position[0] + 0.5)), 'one checked command moves both models');
  assert(ids.every(id => !store.scene.objects.find(object => object.id === id)!.groupId), 'moving together does not create a persistent furniture group');
  store.undo(); await tick();
  assert(roots().every((root, i) => near(root.position.x, original[i]!.position[0])), 'one undo restores every selected model');
  begin(); change(150, 0); controls!.dispatchEvent({ type: 'mouseUp', mode: controls!.mode });
  assert(roots().every((root, i) => near(root.position.x, original[i]!.position[0])), 'rejected move restores every selected model');
  viewport.setTool('rotate'); begin();
  controls!.object!.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), original[0]!.rotation + Math.PI / 2);
  controls!.dispatchEvent({ type: 'objectChange' });
  const dx = original[1]!.position[0] - original[0]!.position[0], dz = original[1]!.position[2] - original[0]!.position[2];
  assert(near(roots()[1]!.position.x, original[0]!.position[0] + dz) && near(roots()[1]!.position.z, original[0]!.position[2] - dx), 'selected models rotate together around the active model');
  viewport.cancelInteraction(); viewport.setTool('scale');
  assert(!controls!.object, 'multiple-model scaling stays disabled');
  const locked = migrateScene(structuredClone(store.scene)); locked.project!.metadata[ids[1]!] = { locked: true };
  viewport.setScene(locked, localCatalog); viewport.setTool('move');
  assert(!controls!.object, 'a locked selected model disables the entire move');
  viewport.dispose(); TransformControls.prototype.attach = attach;

  const world = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const source = structuredClone(demoScene);
  const wall = { id: 'a', start: [-2, 0] as Vec2, end: [2, 0] as Vec2, height: 2.7, thickness: 0.16, color: '#ffffff', openings: [] };
  source.walls = [wall, { ...wall, id: 'b', start: [2, 0], end: [2, 2] }];
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 400;
  canvas.style.cssText = 'width:400px;height:400px'; document.body.append(canvas);
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {}; canvas.hasPointerCapture = () => false;
  let finished: { start: Vec2; end: Vec2 } | null = null, starts = 0;
  const controller = createWallMove({ world, canvas, getCamera: () => camera, getScene: () => source, getCatalog: () => localCatalog, getWall: () => wall,
    ...{ getWalls: () => source.walls }, enabled: () => true, snap: () => true, wallMode: () => 'full', topView: () => true,
    onStart() { starts++; }, onFinish(_id, patch) { finished = patch; }, onPreview() {}, requestRender() {},
  });
  controller.refresh();
  const pointer = (point: THREE.Vector3, shiftKey = false) => {
    const screen = point.clone().project(camera), rect = canvas.getBoundingClientRect();
    return new PointerEvent('pointerdown', { clientX: rect.left + (screen.x + 1) * 200, clientY: rect.top + (1 - screen.y) * 200, pointerId: 1, button: 0, shiftKey });
  };
  const origin = new THREE.Vector3(0, 0.2, 0);
  assert(!controller.pointerDown(pointer(origin, true), wall.id, origin) && starts === 0, 'Shift-clicking selected walls cannot start a drag');
  assert(controller.pointerDown(pointer(origin), wall.id, origin), 'selected wall starts a shared move');
  controller.finish(false, pointer(origin.clone().add(new THREE.Vector3(0.5, 0, 0.75))));
  const result = finished as { start: Vec2; end: Vec2 } | null;
  assert(result && near(result.start[0], wall.start[0] + 0.5) && near(result.start[1], wall.start[1] + 0.75), 'multiple walls move freely in both floor axes');
  controller.dispose(); canvas.remove();
  lines.push(`PASS ${assertions} multiple selection browser assertions`); output.textContent = lines.join('\n');
} catch (error) {
  output.textContent = lines.join('\n') + `\nFAIL ${error instanceof Error ? error.stack : String(error)}`;
  TransformControls.prototype.attach = attach;
}
