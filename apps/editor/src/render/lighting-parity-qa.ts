/** Check the actual WebGL lighting and postprocessing across camera changes. */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const store = new EditorStore(structuredClone(demoScene), localCatalog);
const errors: string[] = [], results: string[] = [];
let world: THREE.Scene | undefined, renderer: THREE.WebGLRenderer | undefined;
let grade = NaN, occlusion = NaN, renders = 0;
const meshRender = THREE.Mesh.prototype.onBeforeRender;
const shaderRender = ShaderPass.prototype.render;
const aoRender = GTAOPass.prototype.render;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  meshRender.apply(this, args);
  if (args[1].getObjectByName('Sun')) { world = args[1]; renderer = args[0]; renders++; }
};
ShaderPass.prototype.render = function (...args) {
  if (this.uniforms.strength) grade = this.uniforms.strength.value as number;
  shaderRender.apply(this, args);
};
GTAOPass.prototype.render = function (...args) { occlusion = this.blendIntensity; aoRender.apply(this, args); };
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() { throw new Error('Camera changed the document'); },
  onError: message => errors.push(message),
});
viewport.setScene(store.scene, localCatalog);
viewport.setSelection('room-living');
for (const wall of store.scene.walls) for (const opening of wall.openings) {
  if (opening.kind === 'door') viewport.setDoorAngle(opening.id, Math.PI / 2);
}
const delay = (ms = 180) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function snapshot(): string {
  if (!world || !renderer) throw new Error('No real WebGL frame captured');
  const lights: unknown[] = [];
  world.traverseVisible(object => {
    if (!(object instanceof THREE.Light)) return;
    lights.push({ id: object.uuid, color: object.color.toArray(), intensity: object.intensity,
      ground: object instanceof THREE.HemisphereLight ? object.groundColor.toArray() : null,
      position: object.getWorldPosition(new THREE.Vector3()).toArray(), castShadow: object.castShadow });
  });
  return JSON.stringify({ environment: world.environment?.uuid, intensity: world.environmentIntensity,
    exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping, grade, occlusion, lights });
}
button.onclick = async () => {
  button.disabled = true; results.length = 0; errors.length = 0; status.textContent = 'Running';
  try {
    await delay(700);
    check(world && renderer && Number.isFinite(grade) && Number.isFinite(occlusion), 'Captured actual lighting, exposure, grade and AO passes');
    const saved = JSON.stringify(store.scene), revision = store.revision;
    check(world.getObjectsByProperty('type', 'PointLight').length > 0, 'Demo includes a real furniture lamp');
    for (const quality of ['balanced', 'high'] as const) {
      viewport.setQuality(quality);
      for (const sky of ['studio', 'daylight', 'sunset', 'overcast'] as const) {
        for (const evening of [false, true]) {
          viewport.setView('perspective'); viewport.setSkybox(sky);
          viewport.setSun({ enabled: true, azimuth: 117, elevation: 28, intensity: 63, timeOfDay: null });
          if (evening) viewport.setLightingMood('evening');
          await delay();
          const settings = JSON.stringify(viewport.getSun()), outside = snapshot();
          check(viewport.setView('inside') !== false, `${quality}/${sky}/${evening ? 'evening' : 'day'} enters Inside`);
          await delay();
          check(snapshot() === outside, `${quality}/${sky}/${evening ? 'evening' : 'day'} preserves all lights and postprocessing`);
          check(JSON.stringify(viewport.getSun()) === settings, 'Entering Inside retains manual Sun settings');
          check(!world.getObjectByName('Window daylight preview'), 'Inside creates no synthetic window-light rig');
          viewport.setView('perspective'); await delay();
          check(snapshot() === outside, 'Returning to 3D retains the same lighting');
        }
      }
    }
    viewport.setSun({ enabled: false, timeOfDay: null }); await delay();
    const sunOff = snapshot(); viewport.setView('inside'); await delay();
    check(snapshot() === sunOff && (world.getObjectByName('Sun') as THREE.Light).intensity === 0, 'Sun off stays off Inside without replacement daylight');
    await delay(700); const idle = renders; await delay(250);
    check(renders === idle, 'Settled Inside view returns to idle rendering');
    check(JSON.stringify(store.scene) === saved && store.revision === revision && !store.canUndo, 'View changes preserve document and history');
    check(errors.length === 0, 'Viewport reports no rendering errors');
    status.textContent = `COMPLETE ${results.length} lighting parity checks`;
  } catch (error) { status.textContent = `FAIL ${String(error)}`; }
  finally { button.disabled = false; }
};
window.addEventListener('pagehide', () => {
  viewport.dispose(); THREE.Mesh.prototype.onBeforeRender = meshRender;
  ShaderPass.prototype.render = shaderRender; GTAOPass.prototype.render = aoRender;
}, { once: true });
