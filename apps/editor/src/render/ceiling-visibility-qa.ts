/** Isolated checks against the actual viewport, including automatic lighting. */
import * as THREE from 'three';
import type { CeilingStyle, SceneDocument } from '../contracts';
import { buildCeilingDesignOperations, defaultCeilingDesign } from '../core/ceiling-design';
import { emptyProject } from '../core/renovation';
import { EditorStore } from '../core/store';
import { createViewport } from './viewport';
import { StudioRenderer } from './studio-renderer';

const output = document.querySelector<HTMLPreElement>('#result')!, status = document.querySelector<HTMLElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#run')!, container = document.querySelector<HTMLDivElement>('#view')!;
const source: SceneDocument = {
  format: 'varpet.editor', version: 2, id: 'ceiling-view-qa', name: 'Ceiling view QA', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Room', color: '#c6a777', polygon: [[0, 0], [5, 0], [5, 4], [0, 4]] }],
  walls: [
    { id: 'north', start: [0, 0], end: [5, 0], height: 3.2, thickness: .2, color: '#ece8df', openings: [{ id: 'window', kind: 'window', offset: 1.4, width: 2.2, height: 1.7, sill: .9 }] },
    { id: 'east', start: [5, 0], end: [5, 4], height: 3.2, thickness: .2, color: '#ece8df', openings: [] },
    { id: 'south', start: [5, 4], end: [0, 4], height: 3.2, thickness: .2, color: '#ece8df', openings: [] },
    { id: 'west', start: [0, 4], end: [0, 0], height: 3.2, thickness: .2, color: '#ece8df', openings: [] },
  ],
  project: { ...emptyProject(), metadata: { room: { ceilingHeight: 3.2, ceilingDesign: defaultCeilingDesign('quiet') } } },
};
const errors: string[] = [], results: string[] = [];
let world: THREE.Scene | undefined, camera: THREE.Camera | undefined, frames = 0, captureRequested = false;
const meshRender = THREE.Mesh.prototype.onBeforeRender, studioRender = StudioRenderer.prototype.render, consoleError = console.error;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  meshRender.apply(this, args);
  if (args[1].getObjectByName('Sun')) world = args[1];
};
StudioRenderer.prototype.render = function (...args) {
  camera = args[0]; studioRender.apply(this, args); frames++;
  if (!captureRequested) return;
  captureRequested = false;
  const canvas = container.querySelector('canvas');
  if (canvas) {
    document.querySelector<HTMLImageElement>('#frame')!.src = canvas.toDataURL('image/png');
    document.querySelector<HTMLElement>('#capture-label')!.textContent = `${canvas.width} × ${canvas.height} · actual final compositor · ${new Date().toISOString()}`;
  }
};
console.error = (...args) => { errors.push(args.map(String).join(' ')); consoleError.apply(console, args); };
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const store = new EditorStore(source, []);
const viewport = createViewport(container, { onSelect() {}, onInteraction() {}, onTransform() { throw new Error('View changed authored geometry'); }, onError: message => errors.push(message) });
viewport.setScene(store.scene, []); viewport.setSelection('room'); viewport.setTool('select');
store.subscribe(() => viewport.setScene(store.scene, []));
const delay = (ms = 280) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function visible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = []; root.traverse(object => { if (object instanceof THREE.Mesh) found.push(object); }); return found;
}
function ceiling(): THREE.Mesh {
  const found = world && meshes(world).find(mesh => mesh.userData.shellPart === 'ceiling' && mesh.userData.entityId === 'room');
  if (!found) throw new Error('No actual structural ceiling captured');
  return found;
}
function design(): THREE.Object3D {
  const found = world?.getObjectByName('ceiling-design:room');
  if (!found) throw new Error('No actual ceiling fixtures captured');
  return found;
}
function practicals(): THREE.Light[] {
  const found: THREE.Light[] = []; design().traverse(object => { if (object instanceof THREE.Light) found.push(object); }); return found;
}
function reflected(): number {
  const material = ceiling().material as THREE.MeshStandardMaterial;
  return material.emissiveIntensity * (material.emissive.r + material.emissive.g + material.emissive.b);
}
function applyStyle(style: CeilingStyle): void {
  const operations = buildCeilingDesignOperations(store.scene, 'room', defaultCeilingDesign(style));
  if (!operations.length) return;
  const result = store.execute({ id: `qa-${style}-${store.revision}`, label: `Try ${style}`, source: 'human', baseRevision: store.revision,
    operations }, true);
  if (!result.ok) throw new Error(result.errors.join(' '));
}
button.onclick = async () => {
  button.disabled = true; results.length = 0; errors.length = 0; status.textContent = 'Running real viewport checks';
  try {
    await delay(700);
    check(world && camera && frames > 0, 'Captured a rendered world and actual camera');
    for (const style of ['quiet', 'soft-glow', 'architectural'] as const) {
      applyStyle(style); viewport.setLayer('shell', true); viewport.setLayer('ceilings', false);
      viewport.setView('perspective'); viewport.focus(); viewport.setLightingMood('evening'); await delay(750);
      const original = JSON.stringify(store.scene), revision = store.revision;
      const roof = ceiling(), material = roof.material as THREE.MeshStandardMaterial;
      check(visible(roof) && material.side === THREE.FrontSide && !material.transparent && material.opacity === 1, `${style}: structural ceiling is always present and opaque without a layer toggle`);
      roof.updateWorldMatrix(true, false);
      check(new THREE.Raycaster(new THREE.Vector3(2.5, 2, 2), new THREE.Vector3(0, 1, 0)).intersectObject(roof).length > 0, `${style}: ceiling faces the room`);
      check(new THREE.Raycaster(new THREE.Vector3(2.5, 6, 2), new THREE.Vector3(0, -1, 0)).intersectObject(roof).length === 0, `${style}: overhead camera sees through the exterior face`);
      const nightLevel = practicals().reduce((sum, light) => sum + light.intensity, 0), nightBounce = reflected();
      check(nightLevel > 0 && nightBounce > 0, `${style}: evening lights illuminate surfaces and ceiling reflected light`);
      check(meshes(design()).every(mesh => !visible(mesh)) && practicals().every(visible), `${style}: overhead fixture bodies are hidden while room lights remain active`);
      viewport.setLayer('ceilings', true); await delay();
      check(visible(ceiling()) && meshes(design()).every(mesh => !visible(mesh)), `${style}: legacy ceiling layer cannot introduce an overhead lid or floating fixtures`);
      viewport.setView('top'); await delay(750);
      check(camera instanceof THREE.OrthographicCamera && visible(ceiling()) && meshes(design()).every(mesh => !visible(mesh)), `${style}: Top keeps the physical ceiling and an unobstructed floor plan`);
      check(practicals().every(visible) && Math.abs(practicals().reduce((sum, light) => sum + light.intensity, 0) - nightLevel) < 1e-6, `${style}: Top preserves the evening illumination`);
      check(viewport.inspectCeiling('room'), `${style}: enters Inside ceiling inspection`); await delay();
      check(visible(ceiling()) && meshes(design()).every(visible), `${style}: Inside shows ceiling and all fixture bodies`);
      viewport.setLayer('shell', false); viewport.setLayer('ceilings', false); await delay();
      check(visible(ceiling()) && meshes(design()).every(visible), `${style}: Inside keeps its ceiling even when overview shell layers are hidden`);
      viewport.setLightingMood('day'); await delay();
      check(practicals().every(light => light.intensity === 0) && reflected() === 0, `${style}: automatic daylight turns off fixtures and ceiling reflected light together`);
      viewport.setLightingMood('evening'); await delay();
      check(Math.abs(reflected() - nightBounce) < 1e-6 && Math.abs(practicals().reduce((sum, light) => sum + light.intensity, 0) - nightLevel) < 1e-6, `${style}: evening restores authored brightness after camera and clock changes`);
      viewport.setView('perspective'); await delay(750);
      check(!visible(ceiling()) && !visible(design()), `${style}: overview shell visibility remains controllable`);
      viewport.setLayer('shell', true); await delay();
      check(visible(ceiling()) && practicals().every(visible), `${style}: restoring overview shell restores ceiling illumination`);
      check(JSON.stringify(store.scene) === original && store.revision === revision, `${style}: camera, clock, and layer changes leave the document unchanged`);
    }
    check(errors.length === 0, 'No WebGL shader, viewport, or browser errors');
    viewport.inspectCeiling('room'); captureRequested = true; viewport.setLightingMood('evening'); await delay();
    status.textContent = `COMPLETE ${results.length} ceiling visibility checks`;
  } catch (error) { status.textContent = `FAIL ${String(error)}`; output.textContent += `\n${errors.join('\n')}`; }
  finally { button.disabled = false; }
};
document.querySelector<HTMLButtonElement>('#inside')!.onclick = () => { viewport.setSelection('room'); viewport.inspectCeiling('room'); };
document.querySelector<HTMLButtonElement>('#overview')!.onclick = () => { viewport.setView('perspective'); viewport.focus(); };
document.querySelector<HTMLButtonElement>('#top')!.onclick = () => { viewport.setView('top'); };
document.querySelector<HTMLButtonElement>('#day')!.onclick = () => viewport.setLightingMood('day');
document.querySelector<HTMLButtonElement>('#night')!.onclick = () => viewport.setLightingMood('evening');
document.querySelector<HTMLButtonElement>('#capture-frame')!.onclick = () => { captureRequested = true; viewport.setSun(viewport.getSun()); };
window.addEventListener('pagehide', () => {
  viewport.dispose(); THREE.Mesh.prototype.onBeforeRender = meshRender; StudioRenderer.prototype.render = studioRender; console.error = consoleError;
}, { once: true });
