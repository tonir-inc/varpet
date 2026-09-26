/** Isolated GPU + DOM regression. Never loads, imports, or saves an application apartment. */
import * as THREE from 'three';
import type { SceneDocument, ViewMode } from '../contracts';
import { createViewport } from './viewport';
import { createSunControls } from '../ui/sun-controls';
import { DEFAULT_SUN, type SunSettings } from './sunlight';

const scene: SceneDocument = {
  format: 'varpet.editor', version: 2, id: 'time-qa', name: 'Day and night room', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Day and night room', color: '#bda88c', polygon: [[0,0],[6,0],[6,5],[0,5]] }],
  walls: [
    { id: 'north', start: [0,0], end: [6,0], height: 3, thickness: .2, color: '#f0e8dc', openings: [{ id: 'window', kind: 'window', offset: 1.4, width: 3.2, height: 1.8, sill: .7 }] },
    { id: 'east', start: [6,0], end: [6,5], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
    { id: 'south', start: [6,5], end: [0,5], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
    { id: 'west', start: [0,5], end: [0,0], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
  ],
  project: { mode: 'correct', currency: 'AMD', metadata: {}, routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [], components: [
    { id: 'room-light', name: 'Installed ceiling light', kind: 'light', roomId: 'room', position: [3,2.65,2.5], dimensions: [.6,.12,.6], rotation: 0, color: '#e8e0d3', phase: 'existing', light: { brightness: 800, temperature: 2700, enabled: true } },
    { id: 'switch', name: 'Room dimmer', kind: 'switch', roomId: 'room', position: [.12,1.1,3], dimensions: [.1,.1,.03], rotation: Math.PI/2, color: '#eee7df', phase: 'existing', control: { type: 'dimmer', targets: ['room-light'], gangs: 1 } },
  ] },
};
const saved = JSON.stringify(scene), errors: string[] = [];
const original = THREE.Mesh.prototype.onBeforeRender;
let renderer: THREE.WebGLRenderer | undefined, world: THREE.Scene | undefined, frames = 0, lastFrame = -1;
const captureRender: typeof THREE.Mesh.prototype.onBeforeRender = function (this: THREE.Mesh, ...args) {
  original.apply(this, args);
  if (args[1] instanceof THREE.Scene && args[1].background) {
    renderer = args[0]; world = args[1];
    if (renderer.info.render.frame !== lastFrame) { frames++; lastFrame = renderer.info.render.frame; }
  }
};
THREE.Mesh.prototype.onBeforeRender = captureRender;
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() { throw new Error('Lighting edited the apartment'); },
  onError: error => errors.push(error), onSunChange: settings => controls?.refresh(settings),
});
const controls = createSunControls(document.querySelector('#sun')!, document.querySelector('#qa-host')!, {
  getSun: () => viewport.getSun(), setSun: patch => viewport.setSun(patch),
});
viewport.setScene(scene, []); viewport.setWalls('cutaway'); viewport.setSun({ timeOfDay: 12, azimuth: 0 });
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const status = document.querySelector('#status')!, results = document.querySelector('#results')!, lines: string[] = [];
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message); lines.push(`PASS ${message}`); results.textContent = lines.join('\n');
}
const floorCamera = new THREE.OrthographicCamera(-3,3,2.5,-2.5,.1,30);
floorCamera.position.set(3,12,2.5); floorCamera.up.set(0,0,-1); floorCamera.lookAt(3,0,2.5); floorCamera.updateMatrixWorld(true);
// Look at empty sky well outside the apartment, so this samples the actual renderer background in every camera mode.
const skyCamera = new THREE.PerspectiveCamera(40,1,.01,1);
skyCamera.position.set(100,100,100); skyCamera.lookAt(100,101,100); skyCamera.updateMatrixWorld(true);
const target = new THREE.WebGLRenderTarget(120,100);
function brightness(camera: THREE.Camera): number {
  if (!renderer || !world) throw new Error('No real renderer frame was captured');
  const previous = renderer.getRenderTarget(); renderer.setRenderTarget(target); renderer.render(world, camera);
  const pixels = new Uint8Array(120*100*4); renderer.readRenderTargetPixels(target,0,0,120,100,pixels); renderer.setRenderTarget(previous);
  let total = 0;
  // Central floor/sky region excludes walls and makes the comparison resilient to edge antialiasing.
  for (let y=20; y<80; y++) for (let x=20; x<100; x++) {
    const offset = (y*120+x)*4; total += (pixels[offset]!+pixels[offset+1]!+pixels[offset+2]!)/3;
  }
  return total/(60*80);
}
function fixtureLight(): THREE.PointLight | undefined {
  const component = world?.getObjectByName('Installed ceiling light');
  return component?.userData.light as THREE.PointLight | undefined;
}
function directSun(): number { return (world?.getObjectByName('Sun') as THREE.DirectionalLight | undefined)?.intensity ?? NaN; }
function input(id: string, value: number): void {
  const control = document.querySelector<HTMLInputElement>(id)!; control.value = String(value); control.dispatchEvent(new Event('input', { bubbles: true }));
}
async function time(hour: number): Promise<void> { input('#sun-time', hour); await delay(350); }
function resetFixtures(): void {
  viewport.setScene({ ...scene, project: { ...scene.project!, components: [] } }, []);
  viewport.setScene(scene, []);
}
function setSun(patch: Partial<SunSettings>): void { viewport.setSun(patch); controls.refresh(); }
document.querySelector<HTMLButtonElement>('#day')!.onclick = () => setSun({ timeOfDay: 12, enabled: true });
document.querySelector<HTMLButtonElement>('#night')!.onclick = () => setSun({ timeOfDay: 22, enabled: true });
for (const view of ['top','perspective','inside'] as ViewMode[]) document.querySelector<HTMLButtonElement>(`#${view}`)!.onclick = () => viewport.setView(view);

document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; lines.length = 0; errors.length = 0;
  status.textContent = 'Running day/night checks'; document.querySelector<HTMLDetailsElement>('#checks')!.open = true;
  try {
    resetFixtures(); viewport.setView('top'); viewport.setWalls('cutaway'); setSun({ ...DEFAULT_SUN, azimuth: 0 }); await delay(600);
    if (document.querySelector<HTMLElement>('#sun-controls')!.hidden) document.querySelector<HTMLButtonElement>('#sun')!.click();
    await time(12);
    check(viewport.getSun().timeOfDay === 12 && document.querySelector('#sun-time-value')!.textContent!.includes('12:00'), 'The time slider changes the real viewport and displays the selected clock time');
    check(directSun() > 0 && fixtureLight()?.intensity === 0 && viewport.getSwitchLevel('switch') === 0, 'Noon has direct sunlight and automatic installed lights are off');
    const noonFloor = brightness(floorCamera), noonSky = brightness(skyCamera);
    document.querySelector<HTMLButtonElement>('[data-sun-time-preset="22"]')!.click(); await delay(350);
    check(viewport.getSun().timeOfDay === 22 && document.querySelector<HTMLInputElement>('#sun-time')!.valueAsNumber === 22 && document.querySelector('#sun-time-value')!.textContent!.includes('night'), 'Night preset updates the slider, clock label and phase together');
    check(directSun() === 0 && (fixtureLight()?.intensity ?? 0) > 0 && viewport.getSwitchLevel('switch') === 1, 'Night turns off the actual directional sun and turns on the installed light');
    const nightSky = brightness(skyCamera), litFloor = brightness(floorCamera);
    check(nightSky < noonSky * .6, `Top background gets dark at night (${noonSky.toFixed(1)} → ${nightSky.toFixed(1)})`);
    await time(12); document.querySelector<HTMLInputElement>('#sun-auto-lights')!.click(); await delay(250);
    check(viewport.getSun().autoLights === false && (fixtureLight()?.intensity ?? 0) > 0, 'Turning automatic lights off restores the saved fixture setting');
    document.querySelector<HTMLInputElement>('#sun-auto-lights')!.click(); await delay(250);
    check(viewport.getSun().autoLights === true && fixtureLight()?.intensity === 0, 'Re-enabling automatic lights turns the daytime fixture off');
    await time(22); viewport.setSwitchLevel('switch', 0); await delay(250); const darkFloor = brightness(floorCamera);
    check(litFloor > darkFloor + 5, `The installed light visibly illuminates the night floor (${darkFloor.toFixed(1)} → ${litFloor.toFixed(1)})`);
    check(noonFloor > darkFloor + 8, `Night without room lights is darker than daytime (${noonFloor.toFixed(1)} → ${darkFloor.toFixed(1)})`);
    await time(0); await time(12); await time(22);
    check(fixtureLight()?.intensity === 0 && viewport.getSwitchLevel('switch') === 0, 'An explicit switch-off survives midnight, noon and night changes');
    viewport.setSwitchLevel('switch', .35); await time(12); await time(22);
    check(Math.abs(viewport.getSwitchLevel('switch') - .35) < 1e-8 && Math.abs((fixtureLight()?.intensity ?? 0) - 5.6) < 1e-8, 'An explicit dimmer level survives day/night changes');
    for (const view of ['perspective','inside'] as const) {
      viewport.setView(view); await delay(650); await time(12); const day = brightness(skyCamera); await time(22); const night = brightness(skyCamera);
      check(night < day * .6 && directSun() === 0, `${view === 'inside' ? 'Inside' : '3D'} uses a dark night sky and no direct sun (${day.toFixed(1)} → ${night.toFixed(1)})`);
    }
    input('#sun-azimuth', 90);
    check(viewport.getSun().timeOfDay === 22 && viewport.getSun().azimuth === 90, 'The compass direction slider preserves the chosen night time');
    input('#sun-elevation', 30); await delay(350);
    check(viewport.getSun().timeOfDay === null && viewport.getSun().elevation === 30 && document.querySelector('#sun-time-value')!.textContent === 'Manual', 'Manual elevation exits clock mode and labels it clearly');
    resetFixtures(); viewport.setView('perspective'); viewport.setWalls('cutaway'); setSun({ timeOfDay: 22, azimuth: 0 }); await delay(800);
    check(JSON.stringify(scene) === saved, 'Time, compass, camera and switch previews leave the apartment JSON unchanged');
    check(errors.length === 0, `No viewport rendering errors (${errors.length})`);
    const settledFrames = frames; await delay(250); check(frames === settledFrames, 'Time-of-day changes return to idle after settling');
    status.textContent = `PASS ${lines.length} GPU and control checks`;
  } catch (error) {
    lines.push(`FAIL ${error instanceof Error ? error.message : String(error)}`); results.textContent = lines.join('\n'); status.textContent = `FAILED after ${lines.length - 1} checks`;
  } finally { button.disabled = false; }
};
window.addEventListener('pagehide', () => {
  controls.dispose(); viewport.dispose(); target.dispose();
  if (THREE.Mesh.prototype.onBeforeRender === captureRender) THREE.Mesh.prototype.onBeforeRender = original;
}, { once: true });
