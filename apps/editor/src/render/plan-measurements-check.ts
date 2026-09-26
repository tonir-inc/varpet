/** Real Plan view regression checks. Open /plan-measurements-qa.html. */
import { createFloorPlan } from './floor-plan';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#results')!;
const container = document.querySelector<HTMLElement>('#plan')!;
const source = structuredClone(demoScene);
const original = JSON.stringify(source);
const store = new EditorStore(source, localCatalog);
let dragRevision = 0;
const plan = createFloorPlan(container, id => plan.setSelection(id), {
  onInteraction(active) { if (active) dragRevision = store.revision; },
  onCommit(operation, label) {
    const result = store.execute({ id: `measurement-drag-${store.revision}`, label, source: 'human', baseRevision: dragRevision, operations: [operation] }, true);
    assert(result.ok, 'measurement drag commits through the checked store');
  },
});
store.subscribe(() => plan.setScene(store.scene, localCatalog));
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
let count = 0;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  count++;
}
function metric(label: string): string | undefined {
  return [...container.querySelectorAll('.fp-metric')].find(el => el.querySelector('span')?.textContent === label)?.querySelector('strong')?.textContent ?? undefined;
}
async function select(id: string): Promise<void> {
  container.querySelector(`[data-entity-id="${id}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
}
plan.setScene(source, localCatalog); plan.setVisible(true);
try {
  await tick();
  await select('window-kitchen');
  assert(container.querySelectorAll('.fp-selection-dimension').length === 3, 'selecting a window shows a width and two gap dimension lines');
  assert(metric('Opening width') === '1.80 m', 'opening width is shown');
  assert(metric('Left gap') === '0.32 m' && metric('Right gap') === '0.52 m', 'gaps stop at the kitchen partition faces');
  assert(metric('Above opening') === '0.35 m', 'height above the opening is shown');
  assert(container.querySelector('.fp-measurement-note')?.textContent?.includes('wall faces'), 'gap measurement basis is explained');
  assert(container.querySelector('.fp-selection-measurements')?.getAttribute('pointer-events') === 'none', 'measurements cannot block selection or dragging');
  const drawing = container.querySelector<SVGSVGElement>('.fp-drawing')!;
  const captures = new Set<number>();
  drawing.setPointerCapture = id => { captures.add(id); };
  drawing.hasPointerCapture = id => captures.has(id);
  drawing.releasePointerCapture = id => { captures.delete(id); };
  const screen = (x: number, z: number) => new DOMPoint(x, z).matrixTransform(drawing.querySelector<SVGGElement>(':scope > g')!.getScreenCTM()!);
  const pointer = (target: Element, type: string, point: DOMPoint) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: point.x, clientY: point.y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const begin = () => pointer(container.querySelector('[data-entity-id="window-kitchen"]')!, 'pointerdown', screen(1.9, -4));
  begin(); pointer(drawing, 'pointermove', screen(2, -4)); await tick();
  assert(metric('Left gap') === '0.42 m' && metric('Right gap') === '0.42 m' && store.revision === 0, 'drag preview updates measurements without a saved edit');
  drawing.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  assert(metric('Left gap') === '0.32 m' && store.revision === 0, 'cancel restores measurement values without a revision');
  begin(); pointer(drawing, 'pointerup', screen(2, -4)); await tick();
  assert(metric('Left gap') === '0.42 m' && Number(store.revision) === 1, 'release commits exactly one measured move');
  store.undo(); await tick();
  assert(metric('Left gap') === '0.32 m' && !store.canUndo, 'one undo restores the original measurements');
  await select('window-bath');
  assert(metric('Top gap') === '1.12 m' && metric('Bottom gap') === '2.12 m', 'vertical walls use top/bottom instead of ambiguous left/right');
  await select('door-kitchen');
  assert(metric('Opening width') === '1.10 m' && metric('Top gap') !== undefined, 'doors have the same opening and gap measurements');
  await select('wall-west');
  assert(container.querySelectorAll('.fp-selection-dimension').length === 1, 'a selected wall has one length guide');
  assert(container.querySelector('[data-measurement="wall-length"]')?.getAttribute('data-metres') === '8', 'wall guide measures modeled length');
  await select('coffee-table');
  assert(metric('Width') === '1.12 m' && metric('Depth') === '0.65 m' && metric('Height') === '0.38 m', 'furniture reports scaled dimensions instead of only coordinates');
  assert(container.querySelectorAll('.fp-selection-dimension').length === 2, 'furniture shows width and depth guides');
  assert(JSON.stringify(source) === original, 'selecting and measuring never mutates the source');
  await select('window-kitchen');
  const moved = structuredClone(source);
  moved.walls.flatMap(wall => wall.openings).find(opening => opening.id === 'window-kitchen')!.offset += 0.1;
  plan.setScene(moved, localCatalog); await tick();
  assert(metric('Left gap') === '0.42 m' && metric('Right gap') === '0.42 m', 'updated scene snapshots refresh the side gaps');
  plan.setScene(source, localCatalog); await tick();
  assert(metric('Left gap') === '0.32 m', 'restoring the scene restores measurements');
  plan.setSelection(null); await tick();
  assert(!container.querySelector('.fp-selection-dimension'), 'clearing selection removes measurement guides');
  container.style.width = '390px'; await tick();
  await select('window-kitchen');
  const card = container.querySelector<HTMLElement>('.fp-detail')!;
  assert(card.scrollWidth <= card.clientWidth + 1, 'all opening metrics fit the compact card without overflow');
  container.style.width = 'min(1100px,100vw)'; await tick();
  output.textContent = `PASS: ${count} Plan measurement assertions`;
} catch (error) {
  output.textContent = `FAIL after ${count} assertions: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
