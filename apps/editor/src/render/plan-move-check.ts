/** Real SVG/DOM gesture regression harness: open /plan-move-qa.html. */
import { createFloorPlan } from './floor-plan';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';
import type { Operation } from '../contracts';

const output = document.querySelector<HTMLPreElement>('#results')!;
const container = document.querySelector<HTMLElement>('#plan')!;
const store = new EditorStore(demoScene, localCatalog);
let assertions = 0, capturedRevision = 0, interactions = 0, command = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
  assertions++;
}
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
const plan = createFloorPlan(container, id => plan.setSelection(id), {
  onInteraction(active: boolean) { interactions += active ? 1 : -1; if (active) capturedRevision = store.revision; },
  onCommit(operation: Operation, label: string) {
    const result = store.execute({ id: `plan-qa-${command++}`, source: 'human', baseRevision: capturedRevision, label, operations: [operation] }, true);
    assert(result.ok, `checked commit succeeds: ${result.errors.join(' ')}`);
  },
});
store.subscribe(() => plan.setScene(store.scene, localCatalog));
plan.setScene(store.scene, localCatalog); plan.setVisible(true);

try {
  await tick();
  const drawing = container.querySelector<SVGSVGElement>('svg.fp-drawing')!;
  // Synthetic events do not activate native capture; track its lifecycle explicitly.
  const captures = new Set<number>();
  drawing.setPointerCapture = id => { captures.add(id); };
  drawing.hasPointerCapture = id => captures.has(id);
  drawing.releasePointerCapture = id => { captures.delete(id); };
  const entity = (id: string) => drawing.querySelector<SVGGElement>(`[data-entity-id="${id}"]`)!;
  const screen = (x: number, z: number) => new DOMPoint(x, z).matrixTransform(drawing.querySelector<SVGGElement>(':scope > g')!.getScreenCTM()!);
  const pointer = (target: Element, type: string, x: number, y: number, button = 0, pointerId = 1) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId, button, buttons: type === 'pointerup' ? 0 : 1 }));
  const begin = (id: string, x: number, z: number, button = 0) => { const start = screen(x, z); pointer(entity(id), 'pointerdown', start.x, start.y, button); return start; };
  const opening = () => store.scene.walls.flatMap(w => w.openings).find(o => o.id === 'window-living')!;
  assert(drawing.querySelectorAll('.fp-furniture').length === demoScene.objects.length, 'all furniture is visible in Plan');
  const original = opening().offset;
  const start = begin('window-living', -2.3, 4);
  const end = screen(-1.8, 4);
  const transform = drawing.querySelector(':scope > g')!.getAttribute('transform');
  pointer(drawing, 'pointermove', end.x, end.y);
  await tick();
  assert(store.revision === 0 && interactions === 1, 'drag previews without changing revision');
  assert(drawing.querySelector(':scope > g')!.getAttribute('transform') === transform, 'dragging an opening does not pan');
  pointer(drawing, 'pointerup', end.x, end.y);
  await tick();
  assert(store.revision === 1 && near(Math.abs(opening().offset - original), 0.5), 'opening release commits its final offset once');
  assert(interactions === 0 && captures.size === 0, 'release ends interaction and releases capture');
  store.undo(); await tick();
  assert(near(opening().offset, original) && !store.canUndo, 'one undo restores the entire move');
  const revision = store.revision;
  begin('window-living', -2.3, 4);
  pointer(drawing, 'pointermove', end.x, end.y);
  drawing.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  pointer(drawing, 'pointerup', end.x, end.y);
  await tick();
  assert(store.revision === revision && near(opening().offset, original) && interactions === 0, 'Escape cancels without committing');
  begin('window-living', -2.3, 4);
  pointer(drawing, 'pointermove', end.x, end.y);
  pointer(drawing, 'pointercancel', end.x, end.y);
  assert(store.revision === revision && interactions === 0 && captures.size === 0, 'pointer cancellation restores the scene');
  begin('window-living', -2.3, 4);
  pointer(drawing, 'pointermove', end.x, end.y);
  plan.setVisible(false); plan.setVisible(true);
  assert(store.revision === revision && interactions === 0 && captures.size === 0, 'switching views cancels the drag');
  await tick();
  const click = begin('window-living', -2.3, 4);
  pointer(drawing, 'pointerup', click.x + 1, click.y + 1);
  assert(store.revision === revision && interactions === 0, 'click selection does not create history');
  const panStart = begin('window-living', -2.3, 4, 1);
  pointer(drawing, 'pointermove', panStart.x + 25, panStart.y + 20, 1);
  pointer(drawing, 'pointerup', panStart.x + 25, panStart.y + 20, 1);
  assert(store.revision === revision && drawing.querySelector(':scope > g')!.getAttribute('transform') !== transform, 'middle dragging an entity pans without edits');
  await tick();
  const object = store.scene.objects.find(o => o.id === 'coffee-table')!;
  const before = [...object.position];
  begin(object.id, before[0]!, before[2]!);
  const objectEnd = screen(before[0]! + 0.25, before[2]!);
  pointer(drawing, 'pointerup', objectEnd.x, objectEnd.y);
  await tick();
  assert(store.revision === revision + 1 && near(store.scene.objects.find(o => o.id === object.id)!.position[0], before[0]! + 0.25), 'furniture release samples final pointer even without a move event');
  store.undo(); await tick();
  const wallBefore = store.scene.walls.find(w => w.id === 'wall-spine')!;
  const wallRevision = store.revision;
  begin(wallBefore.id, wallBefore.start[0], 0);
  const wallEnd = screen(wallBefore.start[0] + 0.25, 0);
  pointer(drawing, 'pointermove', wallEnd.x, wallEnd.y);
  await tick();
  assert(store.revision === wallRevision && container.querySelector('.fp-drag-status')?.textContent?.includes('Release'), 'wall previews before committing');
  pointer(drawing, 'pointerup', wallEnd.x, wallEnd.y);
  await tick();
  assert(store.revision === wallRevision + 1 && near(store.scene.walls.find(w => w.id === wallBefore.id)!.start[0], wallBefore.start[0] + 0.25), 'wall drag moves connected shell in one revision');
  assert(near(store.scene.walls.find(w => w.id === 'wall-bedroom')!.start[0], wallBefore.start[0] + 0.25), 'adjoining wall follows in rendered document');
  assert(drawing.querySelectorAll('.fp-endpoint').length === 2, 'selected wall exposes endpoint handles');
  store.undo(); await tick();
  const invalidRevision = store.revision;
  begin('wall-spine', wallBefore.start[0], 0);
  const invalid = screen(4, 0);
  pointer(drawing, 'pointermove', invalid.x, invalid.y);
  await tick();
  assert(drawing.classList.contains('is-invalid'), 'invalid wall drag shows rejection feedback');
  pointer(drawing, 'pointerup', invalid.x, invalid.y);
  assert(store.revision === invalidRevision && interactions === 0, 'invalid release leaves history unchanged');
  begin('window-living', -2.3, 4);
  pointer(drawing, 'pointermove', end.x, end.y);
  pointer(drawing, 'lostpointercapture', end.x, end.y);
  assert(store.revision === invalidRevision && interactions === 0 && captures.size === 0, 'lost capture cancels without an edit');
  const origin = begin('coffee-table', object.position[0], object.position[2]);
  const away = screen(object.position[0] + 0.5, object.position[2]);
  pointer(drawing, 'pointermove', away.x, away.y);
  pointer(drawing, 'pointerup', origin.x, origin.y);
  assert(store.revision === invalidRevision, 'returning to original off-grid placement does not create a snapped edit');
  begin('window-living', -2.3, 4);
  pointer(drawing, 'pointermove', end.x, end.y);
  plan.setScene(store.scene, localCatalog);
  pointer(drawing, 'pointerup', end.x, end.y);
  assert(store.revision === invalidRevision && interactions === 0, 'new source snapshot cancels a stale gesture');
  plan.setSelection(null); await tick();
  output.textContent = `PASS: ${assertions} Plan interaction assertions`;
} catch (error) {
  output.textContent = `FAIL after ${assertions} assertions: ${error instanceof Error ? error.message : error}`;
  console.error(error);
}
