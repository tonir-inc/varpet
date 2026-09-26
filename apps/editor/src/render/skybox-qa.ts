/** Real WebGL integration checks on an isolated demo, never the user's project. */
import * as THREE from 'three';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const store = new EditorStore(structuredClone(demoScene), localCatalog);
const errors: string[] = [];
let world: THREE.Scene | undefined, renderer: THREE.WebGLRenderer | undefined;
let frames = 0;
const previousRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  previousRender.apply(this, args);
  if (args[1].getObjectByName('Apartment presentation stage')) {
    world = args[1]; renderer = args[0]; frames++;
  }
};
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() { throw new Error('Skybox changed the apartment'); },
  onError: message => errors.push(message),
});
viewport.setScene(store.scene, localCatalog);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const results: string[] = [];
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
type Preset = 'studio' | 'daylight' | 'sunset' | 'overcast';
const skyViewport = viewport as typeof viewport & { setSkybox?: (preset: Preset) => void };
const select = document.querySelector<HTMLSelectElement>('#sky')!;
select.onchange = () => skyViewport.setSkybox?.(select.value as Preset);
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true; select.disabled = true; results.length = 0; errors.length = 0;
  status.textContent = 'Running';
  try {
    await delay(700);
    check(world && renderer, 'Real WebGL viewport renders');
    check(typeof skyViewport.setSkybox === 'function', 'Viewport exposes skybox selection');
    const saved = JSON.stringify(store.scene), revision = store.revision;
    viewport.setView('perspective'); skyViewport.setSkybox('studio'); await delay(700);
    const studioBackground = world.background, studioEnvironment = world.environment;
    const textures = new Map<Preset, THREE.Texture>();
    for (const preset of ['daylight', 'sunset', 'overcast'] as const) {
      skyViewport.setSkybox(preset); await delay(250);
      check(world.background instanceof THREE.CubeTexture, `${preset} draws a cubemap`);
      textures.set(preset, world.background);
      check(world.environment !== studioEnvironment && world.environment instanceof THREE.Texture, `${preset} supplies reflection lighting`);
      check(world.fog === null && !world.getObjectByName('Softly lit gallery curtains')!.visible && !world.getObjectByName('Charcoal studio floor')!.visible, `${preset} removes obstructing studio scenery`);
      check(world.getObjectByName('Apartment presentation stage')!.visible, `${preset} retains the apartment pedestal`);
    }
    const memory = { ...renderer.info.memory };
    for (let i = 0; i < 3; i++) for (const preset of ['daylight', 'sunset', 'overcast'] as const) {
      skyViewport.setSkybox(preset); await delay(50);
      check(world.background === textures.get(preset), `${preset} reuses its cached cubemap (round ${i + 1})`);
    }
    check(renderer.info.memory.textures === memory.textures && renderer.info.memory.geometries === memory.geometries, 'Repeated switching keeps GPU allocations bounded');
    viewport.setLayer('dimensions', true); await delay(100);
    check(world.background === textures.get('overcast'), 'Layer refresh preserves the selected sky');
    viewport.setView('top'); await delay(600);
    check(world.background === studioBackground && world.environment === studioEnvironment, 'Top keeps the neutral editing background and studio lighting');
    viewport.setView('perspective'); await delay(600);
    check(world.background === textures.get('overcast'), 'Returning to 3D restores the selected sky');
    viewport.setSelection('room-living'); viewport.setView('inside'); await delay(300);
    check(world.background === textures.get('overcast'), 'Inside sees the selected sky through windows');
    viewport.setLightingMood('evening'); await delay(100);
    check(world.background instanceof THREE.Color && world.environment === studioEnvironment, 'Evening lighting preview remains dark with its original environment');
    viewport.setLightingMood('day'); await delay(100);
    check(world.background === textures.get('overcast'), 'Day lighting restores the selected sky');
    viewport.setView('perspective'); skyViewport.setSkybox('studio'); await delay(700);
    check(world.background === studioBackground && world.environment === studioEnvironment && world.fog !== null, 'Studio restores original background, reflections and fog');
    check(world.getObjectByName('Softly lit gallery curtains')!.visible && world.getObjectByName('Charcoal studio floor')!.visible, 'Studio scenery restores after camera update');
    viewport.setQuality('high'); skyViewport.setSkybox('sunset'); await delay(400);
    check(world.background === textures.get('sunset'), 'High quality retains the sky');
    viewport.setQuality('balanced'); await delay(400);
    const idle = frames; await delay(220);
    check(frames === idle, 'Settled skies return to idle rendering');
    check(JSON.stringify(store.scene) === saved && store.revision === revision && !store.canUndo, 'Sky changes leave project data, revision and history unchanged');
    check(errors.length === 0, 'No viewport errors reported');
    select.value = 'sunset'; status.textContent = `COMPLETE ${results.length} skybox checks.`;
  } catch (error) {
    status.textContent = `FAIL ${error instanceof Error ? error.message : error}`;
    output.textContent = results.join('\n') + '\n' + status.textContent;
  } finally { button.disabled = false; select.disabled = false; }
};
window.addEventListener('pagehide', () => { viewport.dispose(); THREE.Mesh.prototype.onBeforeRender = previousRender; }, { once: true });
