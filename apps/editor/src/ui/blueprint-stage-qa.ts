/** Isolated browser QA: observe rendered geometry and dispatch real canvas pointer events. */
import * as THREE from 'three';
import { createArchitectStage, type ArchitectStage, type StageEvent } from './architect-stage';
import { demoScene } from '../core/demo';
import planUrl from '../../../../packages/designer/eval/vision-fixtures/avani-plan.png?url';

const output = document.querySelector<HTMLPreElement>('#result')!;
const host = document.querySelector<HTMLElement>('#stage')!;
const phase = document.querySelector<HTMLElement>('#phase')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
const media = window.matchMedia.bind(window);
let reduced = false;
const motionListeners = new Set<(event: MediaQueryListEvent) => void>();
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduced; }, media: query, onchange: null,
  addEventListener(_event: string, listener: (event: MediaQueryListEvent) => void) { motionListeners.add(listener); },
  removeEventListener(_event: string, listener: (event: MediaQueryListEvent) => void) { motionListeners.delete(listener); },
} as unknown as MediaQueryList : media(query);
const setReduced = (value: boolean) => { reduced = value; motionListeners.forEach(listener => listener({ matches: value } as MediaQueryListEvent)); };

let world: THREE.Scene | undefined, camera: THREE.Camera | undefined, lastFrame = -1, frames = 0;
const samples: { erase: number; height: number; sheetY: number }[] = [];
const originalRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (renderer, scene, view, geometry, material, group) {
  originalRender.call(this, renderer, scene, view, geometry, material, group);
  if (!(scene instanceof THREE.Scene) || !scene.getObjectByName('source-blueprint')) return;
  world = scene; camera = view;
  if (renderer.info.render.frame === lastFrame) return;
  lastFrame = renderer.info.render.frame; frames++;
  const sheet = scene.getObjectByName('source-blueprint') as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  samples.push({ erase: sheet.material.uniforms.uErase!.value as number, height: scene.getObjectByName('wall-body:wall-west')?.scale.y ?? 0, sheetY: sheet.position.y });
};
const shell: StageEvent = { type: 'shell', rooms: demoScene.rooms, walls: demoScene.walls, metadata: { 'door-entry': { role: 'entrance' } } };
const saved = JSON.stringify(shell);
let stage: ArchitectStage;
function reset(): void {
  stage?.dispose(); world = undefined; camera = undefined; lastFrame = -1; samples.length = 0;
  stage = createArchitectStage(host, { holdOnFinish: true, onPhase: value => { phase.textContent = value; } });
  stage.start(planUrl, []);
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const results: string[] = [];
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function opening(id: string): THREE.Object3D | undefined {
  let result: THREE.Object3D | undefined;
  world?.traverse(object => { if (object.userData.entityId === id) result = object; });
  return result;
}
function moving(id: string): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  opening(id)?.traverse(object => { if (object.name.startsWith('pivot-')) result.push(object); });
  return result;
}
function button(id: string): HTMLButtonElement {
  const text = id.replace(/-/g, ' ');
  return [...host.querySelectorAll<HTMLButtonElement>('.as-opening-actions button')].find(item => item.textContent?.toLowerCase().endsWith(text))!;
}
function tapVisibleOpening(): string | undefined {
  const canvas = host.querySelector('canvas')!, rect = canvas.getBoundingClientRect();
  for (const wall of demoScene.walls) for (const source of wall.openings) {
    const object = opening(source.id); if (!object) continue;
    const candidates: THREE.Mesh[] = [];
    object.traverse(child => { if (child instanceof THREE.Mesh) candidates.push(child); });
    for (const mesh of candidates) {
      const point = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).project(camera!);
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera!);
      const hits = ray.intersectObject(world!.getObjectByName('architect-shell')!, true);
      const hit = hits.find(item => item.object instanceof THREE.Mesh && !(item.object as THREE.Mesh & { isLine2?: boolean; isLineSegments2?: boolean }).isLine2 && !(item.object as THREE.Mesh & { isLineSegments2?: boolean }).isLineSegments2);
      let target: string | undefined;
      for (let node: THREE.Object3D | null = hit?.object ?? null; node; node = node.parent) target ??= node.userData.entityId as string | undefined;
      if (target !== source.id) continue;
      const init = { pointerId: 1, button: 0, clientX: rect.left + (point.x + 1) * rect.width / 2, clientY: rect.top + (1 - point.y) * rect.height / 2, bubbles: true };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init)); canvas.dispatchEvent(new PointerEvent('pointerup', init));
      return source.id;
    }
  }
}

run.onclick = async () => {
  run.disabled = true; restart.disabled = true; results.length = 0;
  try {
    setReduced(false); reset();
    await delay(1600);
    check(samples.some(sample => sample.sheetY > 0.01 && sample.sheetY < 1.4), 'uploaded plan lands through intermediate rendered positions');
    check(world?.getObjectByName('architect-shell')?.children.length === 0, 'no apartment is invented before the shell event');
    stage.event(shell);
    await delay(2500);
    check((world?.getObjectByName('wall-body:wall-west')?.scale.y ?? 1) < 0.01, 'traced footprint remains readable before walls rise');
    await delay(5700);
    check(samples.some(sample => sample.height > 0.01 && sample.height < 0.99), 'walls extrude through intermediate rendered heights');
    check(samples.some(sample => sample.erase > 0.1 && sample.erase < 0.9), 'original blueprint erases progressively while the shell appears');
    check(world?.getObjectByName('source-blueprint')?.visible === false, 'source sheet is fully removed after construction');
    check(opening('door-kitchen')?.userData.openingProduct === 'door-flush-white.glb', 'real catalog door is installed');
    check(opening('window-west')?.userData.openingProduct === 'window-pvc-tilt-turn.glb', 'real catalog window is installed');
    const target = tapVisibleOpening();
    check(target && button(target).getAttribute('aria-pressed') === 'true', 'canvas tap toggles the visible door or window');
    await delay(100);
    check(moving(target!).some(pivot => Math.abs(pivot.rotation.y) > 0.01 && Math.abs(pivot.rotation.y) < Math.PI / 2), 'opening tap has an intermediate articulated pose');
    button(target!).click(); await delay(45); button(target!).click(); await delay(380);
    check(moving(target!).some(pivot => Math.abs(Math.abs(pivot.rotation.y) - Math.PI / 2) < 1e-6), 'rapid close/open retargets to the exact latest pose');
    button(target!).click(); await delay(380);
    check(moving(target!).every(pivot => Math.abs(pivot.rotation.y) < 1e-6), 'second tap closes all moving leaves exactly');
    await stage.finish(); await delay(250);
    const beforeIdle = frames; await delay(450);
    check(frames === beforeIdle, 'completed stage returns to idle rendering');
    check(host.querySelector('.as-stage') && phase.textContent === 'done', 'holdOnFinish keeps the apartment available for review');
    check(JSON.stringify(shell) === saved, 'all animation and opening previews preserve input geometry');

    reset(); stage.event(shell); await delay(1900);
    setReduced(true); await delay(100);
    check(world?.getObjectByName('source-blueprint')?.visible === false && world?.getObjectByName('wall-body:wall-west')?.scale.y === 1, 'live reduced motion settles construction to exact final state');
    stage.event(shell); await delay(80);
    check(world?.getObjectByName('architect-shell')?.children.filter(object => object.children.some(child => child.name === 'wall-body:wall-west')).length === 1, 'replacement shell cancels old work without duplicate geometry');
    await stage.finish(); await delay(250);
    const reducedFrames = frames; await delay(350);
    check(frames === reducedFrames, 'reduced-motion completion also stays idle');
    stage.dispose(); await delay(100);
    check(!host.querySelector('canvas') && motionListeners.size === 0, 'dispose releases canvas and motion subscriptions');
    output.textContent += `\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) {
    output.textContent += `\nFAIL ${String(error)}\nRendered samples: ${samples.length}; wall heights: ${[...new Set(samples.map(sample => sample.height.toFixed(2)))].join(', ')}; frame count: ${frames}`;
    console.error(error);
  }
  finally { run.disabled = false; restart.disabled = false; }
};
restart.onclick = () => { setReduced(false); reset(); setTimeout(() => stage.event(shell), 1800); };
reset();
if (new URLSearchParams(location.search).has('autorun')) run.click();
window.addEventListener('pagehide', () => { stage.dispose(); THREE.Mesh.prototype.onBeforeRender = originalRender; window.matchMedia = media; });
