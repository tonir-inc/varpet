/** Real SVG/DOM checks: open /plan-layers-qa.html. No saved user project is touched. */
import { createFloorPlan } from './floor-plan';
import { demoScene, localCatalog } from '../core/demo';
import { migrateScene } from '../core/renovation';
import type { BuildingComponent } from '../renovation-contracts';

const output = document.querySelector<HTMLPreElement>('#results')!;
const container = document.querySelector<HTMLElement>('#plan')!;
const scene = migrateScene(structuredClone(demoScene));
const component = (id: string, kind: BuildingComponent['kind'], position: BuildingComponent['position']): BuildingComponent =>
  ({ id, name: id, kind, position, dimensions: [.2, .2, .2], rotation: 0, color: '#999999', phase: 'existing' });
scene.project!.components = [component('Ceiling light', 'light', [-2, 2.5, 0]), component('Switch', 'switch', [-4, 1, 0]), component('Sink', 'sink', [2, 1, -2]), component('Riser', 'riser', [4, 0, -2])];
scene.project!.components[1]!.control = { type: 'single', targets: ['Ceiling light'], gangs: 1 };
scene.project!.routes = [
  { id: 'cable', name: 'Lighting circuit', system: 'electrical', from: 'Switch', to: 'Ceiling light', points: [[-4, 1, 0], [-4, 2.5, 0], [-2, 2.5, 0]], diameter: .01, phase: 'existing', circuit: 'L1' },
  { id: 'cold', name: 'Cold feed', system: 'water-cold', from: 'Riser', to: 'Sink', points: [[4, 0, -2], [4, 1, -2], [2, 1, -2]], diameter: .02, phase: 'new' },
  { id: 'hot', name: 'Hot feed', system: 'water-hot', to: 'Sink', points: [[4, 1, -1.7], [2, 1, -1.7], [2, 1, -2]], diameter: .02, phase: 'existing' },
  { id: 'waste', name: 'Old drain', system: 'waste', from: 'Sink', points: [[2, 1, -2], [2, .1, -2]], diameter: .1, phase: 'remove' },
];
const before = JSON.stringify(scene);
let assertions = 0, selected: string | null = null;
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); assertions++; }
const plan = createFloorPlan(container, id => { selected = id; plan.setSelection(id); });
plan.setScene(scene, localCatalog); plan.setVisible(true);
const find = (selector: string) => container.querySelector(selector);
const count = (selector: string) => container.querySelectorAll(selector).length;
function hitOwner(element: Element): string | null {
  const box = element.getBoundingClientRect();
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-entity-id]')?.getAttribute('data-entity-id') ?? null;
}
async function toggle(layer: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`input[data-plan-layer="${layer}"]`);
  assert(input, `${layer} layer control is available`);
  input!.click(); await tick();
}
try {
  await tick();
  assert(count('.fp-furniture') === scene.objects.length, 'existing default preserves model footprints');
  assert(count('.fp-service-route') === 0, 'service overlays start off');
  const planOnly = container.querySelector<HTMLButtonElement>('[data-plan-only]');
  assert(planOnly, 'Plan only preset is available');
  planOnly!.click(); await tick();
  assert(count('.fp-furniture, .fp-component, .fp-service-route, .fp-service-point') === 0, 'Plan only hides models and service overlays');
  assert(count('.fp-wall') === scene.walls.length && count('.fp-room') === scene.rooms.length && count('.fp-opening') > 0, 'Plan only retains rooms walls and openings');
  await toggle('electrical');
  assert(count('.fp-service-route') === 1 && count('.fp-service-point') === 2, 'lighting displays saved cable and electrical symbols with models hidden');
  assert(count('.fp-furniture, .fp-component') === 0, 'lighting does not restore model footprints');
  assert(find('[data-entity-id="cable"] polyline')?.getAttribute('points') === '-4,0 -4,0 -2,0', 'cable follows recorded route geometry');
  assert(count('[data-entity-id="cable"] .fp-route-terminal.is-connected') === 2, 'recorded endpoints have connected markers');
  assert(hitOwner(find('[data-entity-id="cable"] .fp-route-terminal')!) === 'cable', 'connection terminal remains visible and clickable beside the fixture symbol');
  find('[data-entity-id="cable"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
  assert(selected === 'cable', 'route keyboard selection uses existing selection callback');
  assert(find('.fp-detail')?.textContent?.includes('3.50 m') && find('.fp-detail')?.textContent?.includes('Switch → Ceiling light') && find('.fp-detail')?.textContent?.includes('L1'), 'route details show 3D length endpoint names and circuit');
  await toggle('water');
  assert(count('.fp-service-route') === 4, 'electrical and water layers compose independently');
  assert(count('.fp-service-route[data-system="water-hot"]') === 1 && count('.fp-service-route[data-system="water-cold"]') === 1 && count('.fp-service-route[data-system="waste"]') === 1, 'hot cold and waste have separate system identities');
  assert(find('[data-entity-id="waste"]')?.classList.contains('is-removed'), 'removed service route retains removal styling');
  assert(count('[data-entity-id="waste"] .fp-route-terminal') === 2, 'vertical route still has visible terminals');
  assert(find('[data-entity-id="waste"] .fp-route-rise') && hitOwner(find('[data-entity-id="waste"] .fp-route-rise')!) === 'waste', 'vertical pipe has a visible clickable riser badge clear of the fixture');
  assert(count('[data-entity-id="hot"] .fp-route-terminal.is-unconnected') === 1, 'unrecorded endpoint remains explicitly unconnected');
  await toggle('electrical');
  assert(count('.fp-service-route') === 3 && count('.fp-service-point') === 2, 'water stays visible when electrical is hidden');
  assert(selected === null, 'hiding the selected route clears its selection');
  plan.setScene(structuredClone(scene), localCatalog); plan.setVisible(false); plan.setVisible(true); await tick();
  assert(count('.fp-service-route') === 3 && count('.fp-furniture') === 0, 'layer choices survive scene updates and view switches');
  await toggle('models');
  assert(count('.fp-furniture') === scene.objects.length && count('.fp-component') === scene.project!.components.length, 'model control restores all footprints');
  assert(count('.fp-service-route') === 3, 'restoring models keeps water overlay');
  assert(JSON.stringify(scene) === before, 'layer changes and route selection never mutate the document');
  planOnly!.click(); await tick();
  assert(count('.fp-service-route, .fp-service-point, .fp-furniture, .fp-component') === 0, 'Plan only resets an arbitrary layer combination');
  const overlapping = structuredClone(scene);
  overlapping.project!.routes[2]!.points = structuredClone(overlapping.project!.routes[1]!.points);
  overlapping.project!.routes[2]!.from = 'Riser';
  plan.setScene(overlapping, localCatalog); await toggle('water');
  const drawing = container.querySelector<SVGSVGElement>('.fp-drawing')!;
  const midpoint = new DOMPoint(3, -2).matrixTransform(drawing.querySelector<SVGGElement>(':scope > g')!.getScreenCTM()!);
  const owners = new Set(Array.from({length: 21}, (_, index) => document.elementFromPoint(midpoint.x, midpoint.y + index - 10)?.closest('[data-entity-id]')?.getAttribute('data-entity-id')));
  assert(owners.has('cold') && owners.has('hot'), 'coincident hot and cold routes are both visible and pointer-selectable');
  planOnly!.click(); await tick();
  plan.setScene(demoScene, localCatalog); await toggle('electrical');
  assert(count('.fp-service-route') === 0 && find('.fp-layer-status')?.textContent?.includes('No lighting cables recorded'), 'empty v1 projects explain missing routes without inventing connections');
  const logicalOnly = structuredClone(scene); logicalOnly.project!.routes = [];
  plan.setScene(logicalOnly, localCatalog); await tick();
  assert(count('.fp-service-route') === 0 && count('.fp-service-point') === 2, 'logical switch links never become supply cables');
  output.textContent = `PASS: ${assertions} Plan layer interaction assertions`;
  plan.setScene(scene, localCatalog);
} catch (error) {
  output.textContent = `FAIL after ${assertions} assertions: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
