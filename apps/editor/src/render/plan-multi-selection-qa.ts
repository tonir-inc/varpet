import { createFloorPlan } from './floor-plan';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';
import type { Operation } from '../contracts';

const output = document.querySelector<HTMLPreElement>('#results')!;
const container = document.querySelector<HTMLElement>('#plan')!;
const store = new EditorStore(demoScene, localCatalog);
let ids: string[] = [], revision = 0, commands = 0, selections = 0;
const lines: string[] = [];
function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); lines.push(`PASS ${message}`); output.textContent = lines.join('\n'); }
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const commit = (operations: Operation[], label: string) => {
  const result = store.execute({ id: `multi-plan-${commands++}`, source: 'human', baseRevision: revision, label, operations }, true);
  assert(result.ok, `checked batch: ${result.errors.join(' ')}`);
};
const plan = createFloorPlan(container, (id, additive) => {
  selections++;
  ids = !id ? [] : additive ? ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] : [id];
  plan.setSelection(ids.at(-1) ?? null, ids);
}, { onInteraction(active) { if (active) revision = store.revision; }, onCommit(op, label) { commit([op], label); }, onCommitMany: commit });
store.subscribe(() => plan.setScene(store.scene, localCatalog));
plan.setScene(store.scene, localCatalog); plan.setVisible(true);
try {
  await tick();
  const drawing = container.querySelector<SVGSVGElement>('svg.fp-drawing')!;
  const captures = new Set<number>();
  drawing.setPointerCapture = id => { captures.add(id); };
  drawing.hasPointerCapture = id => captures.has(id);
  drawing.releasePointerCapture = id => { captures.delete(id); };
  const entity = (id: string) => drawing.querySelector(`[data-entity-id="${id}"]`)!;
  const screen = (x: number, z: number) => new DOMPoint(x, z).matrixTransform(drawing.querySelector<SVGGElement>(':scope > g')!.getScreenCTM()!);
  const pointer = (target: Element, type: string, point: DOMPoint, shiftKey = false) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: point.x, clientY: point.y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, shiftKey }));
  const click = async (id: string, shift = false) => { const point = screen(0, 0); pointer(entity(id), 'pointerdown', point, shift); pointer(drawing, 'pointerup', point, shift); await tick(); };
  await click('coffee-table'); await click('sofa', true);
  assert(ids.length === 2 && selections === 2, 'Shift-click toggles once and retains both furniture pieces');
  assert(drawing.querySelectorAll('.fp-furniture.is-selected').length === 2, 'both selected models are highlighted');
  const original = store.scene.objects.filter(object => ids.includes(object.id));
  const first = original[0]!;
  const start = screen(first.position[0], first.position[2]), end = screen(first.position[0] + 0.25, first.position[2]);
  pointer(entity(first.id), 'pointerdown', start); pointer(drawing, 'pointermove', end); await tick();
  assert(ids.length === 2 && store.revision === 0, 'drag keeps multi-selection and previews without history');
  pointer(drawing, 'pointerup', end); await tick();
  assert(store.revision === 1 && original.every(object => Math.abs(store.scene.objects.find(item => item.id === object.id)!.position[0] - object.position[0] - 0.25) < 1e-7), 'one release moves all selected models');
  store.undo(); await tick();
  assert(original.every(object => store.scene.objects.find(item => item.id === object.id)!.position[0] === object.position[0]), 'one undo restores all models');
  pointer(entity(first.id), 'pointerdown', start); pointer(drawing, 'pointermove', end); await tick();
  plan.cancelInteraction(); pointer(drawing, 'pointerup', end); await tick();
  assert(store.revision === 2 && captures.size === 0, 'cancel restores preview and makes no command');
  await click('wall-spine'); await click('wall-bedroom', true);
  assert(drawing.querySelectorAll('.fp-wall.is-selected').length === 2, 'Shift-click highlights multiple walls');
  assert(drawing.querySelectorAll('.fp-endpoint').length === 0, 'wall group hides individual endpoint handles');
  for (const wall of store.scene.walls) if (!ids.includes(wall.id)) await click(wall.id, true);
  // Make the 5 cm step exceed the intentional 4px click-versus-drag threshold.
  for (let zoom = 0; zoom < 4; zoom++) container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();
  await tick();
  const wallsBefore = store.scene.walls;
  const wallStart = screen(-5, 0), wallEnd = screen(-4.95, 0.05);
  pointer(entity('wall-west'), 'pointerdown', wallStart); pointer(drawing, 'pointermove', wallEnd); await tick();
  assert(store.revision === 2, 'wall selection previews without committing');
  pointer(drawing, 'pointerup', wallEnd); await tick();
  assert(store.revision === 3 && wallsBefore.every(wall => {
    const next = store.scene.walls.find(item => item.id === wall.id)!;
    return Math.abs(next.start[0] - wall.start[0] - 0.05) < 1e-7 && Math.abs(next.end[1] - wall.end[1] - 0.05) < 1e-7;
  }), 'plan wall selection moves in both axes with one command');
  store.undo(); await tick();
  assert(JSON.stringify(store.scene.walls) === JSON.stringify(wallsBefore), 'one undo restores all walls');
  output.textContent = lines.join('\n') + '\nPASS all plan multi-selection checks';
} catch (error) { output.textContent = lines.join('\n') + `\nFAIL ${error instanceof Error ? error.stack : error}`; }
