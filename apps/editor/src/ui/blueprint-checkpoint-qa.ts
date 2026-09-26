/** Isolated browser checks against real stage rendering, including a deliberately deferred GLB. */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createArchitectStage, type ArchitectStage, type StageEvent, type StagePhase } from './architect-stage';
import { demoScene } from '../core/demo';

const host = document.querySelector<HTMLElement>('#stage')!;
const output = document.querySelector<HTMLElement>('#result')!;
const phase = document.querySelector<HTMLElement>('#phase')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const ink = document.createElement('canvas'); ink.width = 300; ink.height = 300;
const context = ink.getContext('2d')!; context.strokeStyle = 'white'; context.strokeRect(20, 20, 260, 260);
const matchMedia = window.matchMedia;
let reduced = false;
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  matches: reduced, media: query, addEventListener() {}, removeEventListener() {},
} as unknown as MediaQueryList : matchMedia.call(window, query);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const bounded = <T>(promise: Promise<T>, ms = 5000) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Checkpoint did not settle within ${ms} ms`)), ms);
  void promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
const phases: StagePhase[] = [], results: string[] = [];
let stage: ArchitectStage | undefined, world: THREE.Scene | undefined, camera: THREE.Camera | undefined;
const render = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  render.apply(this, args);
  if (args[1] instanceof THREE.Scene && args[1].getObjectByName('source-blueprint')) { world = args[1]; camera = args[2]; }
};
const load = GLTFLoader.prototype.loadAsync;
let releaseModel: (() => void) | undefined;
GLTFLoader.prototype.loadAsync = function (url, progress) {
  if (url !== 'checkpoint-qa-delayed.glb') return load.call(this, url, progress);
  return new Promise<GLTF>(resolve => {
    releaseModel = () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      mesh.name = 'checkpoint-qa-piece'; group.add(mesh);
      resolve({ scene: group, scenes: [group], animations: [], cameras: [], asset: { version: '2.0' } } as unknown as GLTF);
    };
  });
};
const shell: StageEvent = { type: 'shell', rooms: demoScene.rooms, walls: demoScene.walls };
const piece: StageEvent = { type: 'piece', piece: 'qa-chair', asset: {
  id: 'qa-chair', name: 'QA chair', dimensions: [1, 1, 1], source: { type: 'glb', url: 'checkpoint-qa-delayed.glb' },
} };
const placements: StageEvent = { type: 'placements', objects: [{ id: 'qa-chair-1', assetId: 'qa-chair', position: [2, 0, 2] }] };
function reset(): ArchitectStage {
  stage?.dispose(); phases.length = 0; world = undefined; releaseModel = undefined;
  stage = createArchitectStage(host, { holdOnFinish: true, blueprint: { ink, paper: '#164c5a' },
    onPhase: value => { phases.push(value); phase.textContent = value; } });
  stage.start(ink.toDataURL(), []); stage.enter(); phases.length = 0;
  return stage;
}
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function openingAngles(): number[] {
  const angles: number[] = [];
  world?.traverse(object => { if (object.name.startsWith('pivot-')) angles.push(Math.abs(object.rotation.y)); });
  return angles;
}
function openDoor(): void {
  [...host.querySelectorAll<HTMLButtonElement>('.as-opening-actions button')].find(button => button.textContent?.includes('Door kitchen'))!.click();
}

run.onclick = async () => {
  run.disabled = true; results.length = 0;
  try {
    reduced = false;
    for (const target of ['reading', 'walls', 'building', 'placing', 'checking', 'done'] as StagePhase[]) {
      const current = reset(), events: StageEvent[] = target === 'reading' ? [] : [shell];
      if (['building', 'placing', 'checking', 'done'].includes(target)) events.push(piece);
      if (['placing', 'checking', 'done'].includes(target)) events.push(placements);
      if (['checking', 'done'].includes(target)) events.push({ type: 'project', project: {} });
      const saved = JSON.stringify(events), started = performance.now();
      let settled = false;
      const hydration = current.hydrate(events, target).then(() => { settled = true; });
      if (releaseModel) {
        await delay(60);
        check(!settled && phases.length === 0, `${target} waits for its model without showing earlier phases`);
        releaseModel();
      }
      await bounded(hydration); await nextFrame();
      check(phases.length === 1 && phases[0] === target, `${target} emits its selected phase exactly once`);
      check(performance.now() - started < 5000, `${target} skips construction animation and phase holds`);
      check(JSON.stringify(events) === saved, `${target} preserves recorded input data`);
      check((host.querySelector('.as-stage') as HTMLElement).style.visibility !== 'hidden', `${target} restores the rendered stage`);
      if (target !== 'reading') {
        check(world?.getObjectByName('wall-body:wall-west')?.scale.y === 1, `${target} has fully raised walls`);
        let stockWindow = false;
        world?.traverse(object => { stockWindow ||= object.userData.openingProduct === 'window-pvc-tilt-turn.glb'; });
        check(stockWindow, `${target} waits for the stock opening model`);
      }
      if (target === 'walls') {
        openDoor(); await delay(80);
        check(openingAngles().some(angle => angle > 0.01 && angle < Math.PI / 2), 'opening interactions animate normally after hydration');
        await delay(260);
        check(openingAngles().some(angle => Math.abs(angle - Math.PI / 2) < 1e-6), 'opening animation reaches its exact final pose after hydration');
        const before = camera!.position.clone();
        host.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
        await nextFrame();
        check(camera!.position.distanceTo(before) > 0.01, 'orbit navigation works after hydration');
      }
      if (['placing', 'checking', 'done'].includes(target)) {
        const model = world?.getObjectByName('checkpoint-qa-piece');
        const center = model && new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
        check(center && Math.abs(center.x - 2) < 1e-6 && Math.abs(center.z - 2) < 1e-6, `${target} has completed furniture placement`);
      }
      if (target === 'done') {
        await bounded(current.finish(), 300); await delay(80);
        check(phases.length === 1, 'finish after done hydration does not replay completion or emit another phase');
      }
    }
    reduced = true;
    await bounded(reset().hydrate([shell], 'walls')); await nextFrame();
    openDoor();
    check(host.querySelector('.as-stage')!.classList.contains('is-reduced') && openingAngles().some(angle => Math.abs(angle - Math.PI / 2) < 1e-6), 'reduced-motion preference is preserved for interaction after hydration');
    reduced = false;
    const current = reset();
    let cancelled = false;
    const hydration = current.hydrate([piece], 'building').then(() => { cancelled = true; });
    current.dispose(); await bounded(hydration, 300);
    check(cancelled && !host.querySelector('canvas') && phases.length === 0, 'disposal settles hydration without waiting for its unfinished model or emitting a phase');
    releaseModel?.(); await delay(50);
    check(!host.querySelector('canvas'), 'late model completion cannot recreate a disposed stage');
    output.textContent += `\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) { output.textContent += `\nFAIL ${String(error)}`; console.error(error); }
  finally { run.disabled = false; }
};
if (new URLSearchParams(location.search).has('autorun')) run.click();
window.addEventListener('pagehide', () => {
  stage?.dispose(); THREE.Mesh.prototype.onBeforeRender = render; GLTFLoader.prototype.loadAsync = load; window.matchMedia = matchMedia;
});
