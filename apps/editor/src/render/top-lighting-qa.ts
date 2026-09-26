/** Isolated real-GPU checks; this page never loads or saves an application apartment. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import type { SceneDocument } from '../contracts';
import { EditorStore } from '../core/store';
import { getFinishPreset, materialForPreset } from '../core/finish-presets';
import { acquireFinishTexture } from './finish-textures';
import { createViewport } from './viewport';

const scene: SceneDocument = {
  format: 'varpet.editor', version: 2, id: 'top-lighting-qa', name: 'Top lighting QA', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Sample room', color: '#bda88c', polygon: [[0, 0], [6, 0], [6, 5], [0, 5]] }],
  walls: [
    { id: 'north', start: [0, 0], end: [6, 0], height: 3, thickness: .2, color: '#f0e8dc', openings: [{ id: 'window', kind: 'window', offset: 1.4, width: 3.2, height: 1.8, sill: .7 }] },
    { id: 'east', start: [6, 0], end: [6, 5], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
    { id: 'south', start: [6, 5], end: [0, 5], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
    { id: 'west', start: [0, 5], end: [0, 0], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
  ],
  project: { mode: 'correct', currency: 'AMD', metadata: {}, routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [], components: [
    { id: 'room-light', name: 'Installed room light', kind: 'light', roomId: 'room', position: [3, 2.65, 2.5], dimensions: [.6, .12, .6], rotation: 0, color: '#e8e0d3', phase: 'existing', light: { brightness: 800, temperature: 2700, enabled: true } },
    { id: 'switch', name: 'Room dimmer', kind: 'switch', roomId: 'room', position: [.12, 1.1, 3], dimensions: [.1, .1, .03], rotation: Math.PI / 2, color: '#eee7df', phase: 'existing', control: { type: 'dimmer', targets: ['room-light'], gangs: 1 } },
  ] },
};
const store = new EditorStore(scene, []);
const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const errors: string[] = [], results: string[] = [];
let world: THREE.Scene | undefined, renderer: THREE.WebGLRenderer | undefined, camera: THREE.Camera | undefined;
let grade = NaN, frames = 0, aoFrames = 0;
let pixels: number[] = [];
const probes = Array.from({ length: 30 }, (_, i) => new THREE.Vector3(.75 + (i % 5) * .32, .001, .63 + Math.floor(i / 5) * .64));
const projected = new THREE.Vector3(), size = new THREE.Vector2(), rgba = new Uint8Array(4);
const meshRender = THREE.Mesh.prototype.onBeforeRender;
const composerRender = EffectComposer.prototype.render;
const shaderRender = ShaderPass.prototype.render;
const aoRender = GTAOPass.prototype.render;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  meshRender.apply(this, args);
  if (args[1].getObjectByName('Sun')) { world = args[1]; renderer = args[0]; camera = args[2]; }
};
ShaderPass.prototype.render = function (...args) {
  if (this.uniforms.strength) grade = this.uniforms.strength.value as number;
  shaderRender.apply(this, args);
};
GTAOPass.prototype.render = function (...args) { aoFrames++; aoRender.apply(this, args); };
EffectComposer.prototype.render = function (...args) {
  composerRender.apply(this, args);
  if (!renderer || this.renderer !== renderer || !camera) return;
  frames++;
  if (!(camera instanceof THREE.OrthographicCamera)) return;
  // Read the displayed, postprocessed framebuffer before the browser clears it.
  // This includes output color conversion and antialiasing, without changing renderer settings.
  const gl = renderer.getContext(); renderer.getDrawingBufferSize(size);
  pixels = probes.flatMap(probe => {
    projected.copy(probe).project(camera!);
    const x = Math.max(0, Math.min(size.x - 1, Math.floor((projected.x + 1) * .5 * size.x)));
    const y = Math.max(0, Math.min(size.y - 1, Math.floor((projected.y + 1) * .5 * size.y)));
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    return [rgba[0]!, rgba[1]!, rgba[2]!];
  });
};
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() { throw new Error('Lighting preview changed the document'); },
  onError: message => errors.push(message),
});
viewport.setScene(store.scene, []);
viewport.setWalls('cutaway');
viewport.setLayer('dimensions', false);
const delay = (ms = 350) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function difference(a: number[], b: number[]): number {
  if (a.length !== probes.length * 3 || b.length !== a.length) return Infinity;
  return Math.max(...a.map((value, index) => Math.abs(value - b[index]!)));
}
function brightness(sample: number[]): number { return sample.reduce((sum, value) => sum + value, 0) / sample.length; }
function floorMaterial(): THREE.Material | undefined {
  let result: THREE.Material | undefined;
  world?.traverse(object => {
    if (object instanceof THREE.Mesh && object.userData.finishEntityId === 'room') result = Array.isArray(object.material) ? object.material[0] : object.material;
  });
  return result;
}
function lightingSnapshot(): string {
  if (!world || !renderer) throw new Error('No real WebGL frame captured');
  const lights: unknown[] = [];
  world.traverse(object => {
    if (!(object instanceof THREE.Light)) return;
    lights.push({ id: object.uuid, color: object.color.toArray(), intensity: object.intensity, visible: object.visible,
      ground: object instanceof THREE.HemisphereLight ? object.groundColor.toArray() : null,
      position: object.getWorldPosition(new THREE.Vector3()).toArray(), castShadow: object.castShadow });
  });
  return JSON.stringify({ environment: world.environment?.uuid, intensity: world.environmentIntensity,
    background: world.background instanceof THREE.Color ? world.background.toArray() : world.background?.uuid,
    fog: world.fog ? { color: world.fog.color.toArray(), near: (world.fog as THREE.Fog).near, far: (world.fog as THREE.Fog).far } : null,
    exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping, shadows: renderer.shadowMap.enabled, grade, lights });
}
function fixtureIntensity(): number {
  const light = world?.getObjectByName('Installed room light')?.userData.light as THREE.PointLight | undefined;
  return light?.intensity ?? NaN;
}

button.onclick = async () => {
  button.disabled = true; results.length = 0; errors.length = 0; status.textContent = 'Running';
  try {
    viewport.setScene(store.scene, []); viewport.setView('perspective'); viewport.setSkybox('studio');
    viewport.setSun({ enabled: true, azimuth: 0, elevation: 35, intensity: 100, timeOfDay: null, autoLights: false });
    viewport.setSwitchLevel('switch', 1); await delay(850);
    check(world && renderer && Number.isFinite(grade), 'Captured actual WebGL lighting and final output');
    const saved = JSON.stringify(store.scene), revision = store.revision, originalFloor = floorMaterial();
    const perspectiveLighting = lightingSnapshot(), settings = JSON.stringify(viewport.getSun());
    viewport.setView('top'); await delay(850);
    check(!renderer.shadowMap.enabled && renderer.toneMapping === THREE.NoToneMapping && world.fog === null, 'Top defaults to unlit colors, without shadows, tone mapping or fog');
    check(grade === 0 && pixels.length === 90, 'Top pixels come from the final ungraded orthographic output');
    const basePixels = pixels.slice();
    check(Math.abs(brightness(basePixels) - (189 + 168 + 140) / 3) < 4, `Unlit floor keeps its base color (${brightness(basePixels).toFixed(1)} average RGB)`);
    const noAO = aoFrames; viewport.setSwitchLevel('switch', .25); await delay();
    check(aoFrames === noAO, 'Unlit Top does not render ambient occlusion');
    check(difference(basePixels, pixels) <= 1, 'Changing the real room dimmer leaves Top floor pixels unchanged');
    viewport.setSwitchLevel('switch', 1); viewport.setTopLighting(true); await delay();
    check(renderer.shadowMap.enabled && Number(renderer.toneMapping) === THREE.ACESFilmicToneMapping, 'Lighting toggle restores normal rendering in Top');
    check(difference(basePixels, pixels) > 5, 'Lighting toggle visibly changes the floor');
    viewport.setTopLighting(false); await delay();
    check(difference(basePixels, pixels) <= 1 && floorMaterial() === originalFloor, 'Disabling lighting restores the exact colors without replacing finish materials');
    viewport.setView('perspective'); await delay(850);
    check(lightingSnapshot() === perspectiveLighting && JSON.stringify(viewport.getSun()) === settings, 'Leaving unlit Top restores every perspective light, sky, fog and renderer setting');
    check(viewport.setView('inside') !== false, 'Inside remains available after using unlit Top'); await delay(850);
    check(renderer.shadowMap.enabled && Number(renderer.toneMapping) === THREE.ACESFilmicToneMapping && floorMaterial() === originalFloor, 'Inside restores lit rendering using the original materials');
    viewport.setView('top'); await delay(850);
    for (const quality of ['balanced', 'high'] as const) {
      viewport.setQuality(quality); await delay(); const reference = pixels.slice();
      for (const sky of ['studio', 'sunset'] as const) {
        viewport.setSkybox(sky);
        for (const hour of [12, 22]) {
          viewport.setSun({ timeOfDay: hour, enabled: true, autoLights: false });
          viewport.setSwitchLevel('switch', hour === 12 ? 0 : 1); await delay();
          check(difference(reference, pixels) <= 1, `${quality}/${sky}/${hour}:00 keeps floor colors independent of sun and room lights`);
        }
      }
    }
    viewport.setTopLighting(true); viewport.setSun({ timeOfDay: 22, enabled: false });
    viewport.setSwitchLevel('switch', 0); await delay(); const dark = brightness(pixels);
    viewport.setSwitchLevel('switch', 1); await delay();
    check(fixtureIntensity() > 0 && brightness(pixels) > dark + 5, 'Optional lit Top still shows real room-light illumination');
    viewport.setTopLighting(false); await delay();
    const oak = acquireFinishTexture('oak');
    try {
      check(await oak.ready, 'Bundled oak color and roughness textures load');
      const changed = structuredClone(store.scene), finish = materialForPreset(getFinishPreset('oak')!);
      changed.project!.materials.push(finish);
      changed.project!.finishes.push({ id: 'qa-floor-finish', entityId: 'room', surface: 'floor', materialId: finish.id });
      const savedChanged = JSON.stringify(changed);
      viewport.setScene(changed, []); await delay(850);
      check(floorMaterial() !== originalFloor && difference(basePixels, pixels) > 5, 'A replacement finish created in Top renders its own appearance');
      const textured = pixels.slice(), red = textured.filter((_, index) => index % 3 === 0);
      check(Math.max(...red) - Math.min(...red) > 4, 'Unlit Top preserves visible texture variation');
      viewport.setSun({ timeOfDay: 12, enabled: true }); viewport.setSwitchLevel('switch', 0); await delay();
      check(difference(textured, pixels) <= 1, 'Replacement textured finish is also independent of light');
      viewport.setTopLighting(true); await delay(); viewport.setTopLighting(false); await delay();
      check(difference(textured, pixels) <= 1 && JSON.stringify(changed) === savedChanged, 'Textured finish survives repeated lighting toggles without changing its document');
    } finally { oak.release(); }
    await delay(850); const idle = frames; await delay(300);
    check(frames === idle, 'Settled Top lighting returns to idle rendering');
    check(JSON.stringify(store.scene) === saved && store.revision === revision && !store.canUndo, 'View and light previews preserve the document and history');
    check(errors.length === 0, 'Viewport reports no rendering errors');
    status.textContent = `COMPLETE ${results.length} Top lighting checks`;
  } catch (error) {
    results.push(`FAIL ${String(error)}`); output.textContent = results.join('\n'); status.textContent = `FAIL after ${results.length - 1} checks`;
  } finally { button.disabled = false; }
};
window.addEventListener('pagehide', () => {
  viewport.dispose(); THREE.Mesh.prototype.onBeforeRender = meshRender;
  EffectComposer.prototype.render = composerRender; ShaderPass.prototype.render = shaderRender; GTAOPass.prototype.render = aoRender;
}, { once: true });
