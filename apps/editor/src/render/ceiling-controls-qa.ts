/** Integration checks for generated room lighting, real UI controls and the actual renderer. */
import * as THREE from 'three';
import { createInitialScene } from '../core/initial-scene';
import { decorateGeneratedCeilings } from '../core/generated-ceilings';
import { componentPosition } from '../core/geometry';
import { EditorStore } from '../core/store';
import { createCeilingUI } from '../ui/ceiling-design';
import { createViewport } from './viewport';
import { StudioRenderer } from './studio-renderer';
import '../ui/style.css';

const output = document.querySelector<HTMLPreElement>('#result')!, status = document.querySelector<HTMLElement>('#status')!;
const container = document.querySelector<HTMLDivElement>('#view')!, panel = document.querySelector<HTMLDivElement>('#panel')!;
const results: string[] = [], errors: string[] = [];
let world: THREE.Scene | undefined, actualCamera: THREE.Camera | undefined, frames = 0, capture = false;
const meshRender = THREE.Mesh.prototype.onBeforeRender, studioRender = StudioRenderer.prototype.render;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  meshRender.apply(this, args); if (args[1].getObjectByName('Sun')) world = args[1];
};
StudioRenderer.prototype.render = function (...args) {
  actualCamera = args[0]; studioRender.apply(this, args); frames++;
  if (capture) { capture = false; document.querySelector<HTMLImageElement>('#frame')!.src = container.querySelector('canvas')!.toDataURL('image/png'); }
};
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const source = createInitialScene();
const store = new EditorStore(decorateGeneratedCeilings(source), []);
const room = store.scene.rooms.find(candidate => store.scene.project?.components.some(component => component.control?.targets.includes(candidate.id)))!;
const viewport = createViewport(container, { onSelect: id => { viewport.setSelection(id); ui.render(); }, onLightingChange: () => { ui.syncLighting(); status.textContent = `Switch preview: ${viewport.getSwitchLevel(switchButton().dataset.ceilingSwitch!) > 0 ? 'on' : 'off'} · document revision ${store.revision}`; }, onTransform() {}, onInteraction() {}, onError: message => errors.push(message) });
viewport.setScene(store.scene, []); viewport.setTool('select'); viewport.inspectCeiling(room.id); viewport.setLightingMood('evening');
const ui = createCeilingUI(panel, {
  getScene: () => store.scene,
  execute: (operations, label) => { const result = store.execute({ id: crypto.randomUUID(), source: 'human', label, baseRevision: store.revision, operations }, true); if (!result.ok) errors.push(result.errors.join(' ')); return result.ok; },
  select: id => viewport.setSelection(id), inspect: (id, evening) => { viewport.inspectCeiling(id); viewport.setLightingMood(evening ? 'evening' : 'day'); },
  notice: (message, error) => { status.textContent = message; if (error) errors.push(message); },
  toggleSwitch: id => viewport.toggleSwitch(id), getSwitchLevel: id => viewport.getSwitchLevel(id),
});
ui.setSelection(room.id);
store.subscribe(() => { viewport.setScene(store.scene, []); ui.render(); });
const delay = (ms = 250) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
function lightSum(id: string): number { let sum = 0; world?.getObjectByName(`ceiling-design:${id}`)?.traverse(object => { if (object instanceof THREE.Light) sum += object.intensity; }); return sum; }
function bounce(id: string): number { let sum = 0; world?.traverse(object => { if (object instanceof THREE.Mesh && object.userData.shellPart === 'ceiling' && object.userData.entityId === id) { const material = object.material as THREE.MeshStandardMaterial; sum += material.emissiveIntensity * (material.emissive.r + material.emissive.g + material.emissive.b); } }); return sum; }
function switchButton(): HTMLButtonElement { return panel.querySelector<HTMLButtonElement>('[data-ceiling-switch]')!; }
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; results.length = 0; errors.length = 0; status.textContent = 'Checking generation, styles and switching';
  try {
    await delay(700);
    check(world && frames > 0, 'Captured actual WebGL scene');
    check(!source.project?.components.length, 'Generation preserved original scene');
    check(store.scene.project!.components.some(component => component.control?.targets.includes(room.id) && component.host), 'Generated room has a hosted wall switch');
    check(store.scene.project!.assumptions.some(assumption => assumption.property === 'ceilingDesign' && assumption.sourceKind === 'design'), 'Starter lighting is recorded as a design choice');
    for (const style of ['quiet', 'soft-glow', 'architectural']) {
      panel.querySelector<HTMLInputElement>(`[name="ceiling-style"][value="${style}"]`)!.click();
      panel.querySelector<HTMLButtonElement>('[type="submit"]')!.click(); viewport.inspectCeiling(room.id); viewport.setLightingMood('evening'); await delay(450);
      check(store.scene.project!.metadata[room.id]?.ceilingDesign?.style === style, `${style}: actual panel applies the design`);
      const before = JSON.stringify(store.scene), revision = store.revision, switchId = switchButton().dataset.ceilingSwitch!;
      check(lightSum(room.id) > 0 && bounce(room.id) > 0, `${style}: evening illuminates room and ceiling`);
      switchButton().click(); await delay();
      check(viewport.getSwitchLevel(switchId) === 0 && lightSum(room.id) === 0 && bounce(room.id) === 0, `${style}: switch turns room lights and reflected glow off`);
      check(switchButton().textContent === 'Turn on', `${style}: switch button shows its current state`);
      switchButton().click(); await delay();
      check(lightSum(room.id) > 0 && bounce(room.id) > 0, `${style}: switch restores light and ceiling glow`);
      viewport.setSwitchLevel(switchId, .35); await delay();
      check(Math.abs(viewport.getSwitchLevel(switchId) - .35) < 1e-6, `${style}: shared dimmer preview controls ceiling`);
      viewport.setLightingMood('day'); await delay();
      check(lightSum(room.id) > 0, `${style}: explicit manual level survives automatic daylight`);
      check(store.revision === revision && JSON.stringify(store.scene) === before, `${style}: preview preserves saved document and history`);
      viewport.setSwitchLevel(switchId, 1); viewport.setLightingMood('evening');
    }
    const beforeRestore = JSON.stringify(store.scene);
    panel.querySelector<HTMLButtonElement>('[data-ceiling-remove]')!.click(); await delay();
    check(store.scene.project!.metadata[room.id]?.ceilingDesign === null, 'Restore original ceiling works while switch remains linked');
    store.undo(); await delay(); check(JSON.stringify(store.scene) === beforeRestore, 'Undo restores ceiling and its switch connection');
    const frame = frames; await delay(600); check(frames === frame, 'Renderer returns to idle after switch and history changes');
    check(errors.length === 0, 'No viewport or browser errors');
    status.textContent = `COMPLETE ${results.length} ceiling lighting checks`;
  } catch (error) { output.textContent += `\nFAIL ${String(error)}\n${errors.join('\n')}`; status.textContent = 'FAILED'; }
  finally { button.disabled = false; }
};
document.querySelector<HTMLButtonElement>('#capture')!.onclick = () => { capture = true; viewport.setLightingMood('evening'); };
document.querySelector<HTMLButtonElement>('#face-switch')!.onclick = () => {
  const control = store.scene.project!.components.find(component => component.control?.targets.includes(room.id) && component.host)!;
  const host = control.host!, wall = store.scene.walls.find(candidate => candidate.id === host.wallId)!;
  const point = new THREE.Vector3(...componentPosition(store.scene, control)).add(new THREE.Vector3(0, control.dimensions[1] / 2, 0));
  const along = new THREE.Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]).normalize();
  const inward = new THREE.Vector3(-along.z, 0, along.x).multiplyScalar(host.side);
  // Test-only camera fixture: face the real hosted switch without changing the apartment.
  actualCamera!.position.copy(point).addScaledVector(inward, .8); actualCamera!.position.y = 1.65 + (store.scene.project!.metadata[room.id]?.elevation ?? 0);
  actualCamera!.lookAt(point); actualCamera!.updateMatrixWorld(); viewport.setLightingMood('evening');
  status.textContent = `Tap the wall switch · ${viewport.getSwitchLevel(control.id) > 0 ? 'on' : 'off'} · document revision ${store.revision}`;
};
window.addEventListener('pagehide', () => { ui.dispose(); viewport.dispose(); });
