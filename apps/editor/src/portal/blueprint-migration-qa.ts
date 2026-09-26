/** Isolated browser QA for the production blueprint construction and viewport ownership handoff. */
import * as THREE from 'three';
import { demoScene, localCatalog } from '../core/demo';
import { migrateScene } from '../core/renovation';
import { defaultCeilingDesign } from '../core/ceiling-design';
import { createBlueprintConstruction, type BlueprintConstruction } from './blueprint-construction';
import { traceInk } from './blueprint-ink';
import { BLUEPRINT_PAPER } from './blueprint-presentation';
import { createViewport, type FinishViewport } from '../render/viewport';
import type { StageEvent } from '../ui/architect-stage';

const host = document.querySelector<HTMLElement>('#construction')!;
const editor = document.querySelector<HTMLElement>('#editor')!;
const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const recovery = document.querySelector<HTMLButtonElement>('#recovery')!;
const results: string[] = [], errors: string[] = [];
const recordWindowError = (event: ErrorEvent) => { errors.push(`Uncaught: ${event.message}`); };
const recordRejection = (event: PromiseRejectionEvent) => { errors.push(`Unhandled rejection: ${String(event.reason)}`); };
window.addEventListener('error', recordWindowError);
window.addEventListener('unhandledrejection', recordRejection);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string, ms = 5000): Promise<void> {
  const end = performance.now() + ms;
  while (!predicate()) {
    if (performance.now() > end) throw new Error(`Timed out: ${label}`);
    await delay(35);
  }
}
async function bounded(promise: Promise<unknown>, label: string, ms = 5000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms); })]); }
  finally { clearTimeout(timer); }
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}

function shiftClick(canvas: HTMLCanvasElement, x: number, y: number): void {
  const pointerId = 7, captured = new Set<number>();
  const capture = canvas.setPointerCapture, release = canvas.releasePointerCapture, hasCapture = canvas.hasPointerCapture;
  // dispatchEvent cannot register an active pointer with the browser. Model capture only for
  // this synthetic pointer, including TransformControls' unconditional release on pointerup.
  // Other pointer IDs keep the native methods, and unexpected handler errors remain fatal.
  canvas.setPointerCapture = function (id) { if (id === pointerId) captured.add(id); else capture.call(this, id); };
  canvas.releasePointerCapture = function (id) { if (id === pointerId) captured.delete(id); else release.call(this, id); };
  canvas.hasPointerCapture = function (id) { return id === pointerId ? captured.has(id) : hasCapture.call(this, id); };
  try {
    const pointer = { pointerId, pointerType: 'mouse', button: 0, shiftKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
  } finally {
    canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; canvas.hasPointerCapture = hasCapture;
  }
}

// A runtime drawing of the unchanged demo walls gives registration a known metric answer.
const plan = document.createElement('canvas'); plan.width = 384; plan.height = 320;
const context = plan.getContext('2d')!;
context.fillStyle = 'white'; context.fillRect(0, 0, plan.width, plan.height);
context.strokeStyle = 'black'; context.lineWidth = 5;
const pixelsPerMetre = 28, originX = 52, originZ = 48;
for (const wall of demoScene.walls) {
  context.beginPath();
  context.moveTo(originX + (wall.start[0] + 5) * pixelsPerMetre, originZ + (wall.start[1] + 4) * pixelsPerMetre);
  context.lineTo(originX + (wall.end[0] + 5) * pixelsPerMetre, originZ + (wall.end[1] + 4) * pixelsPerMetre);
  context.stroke();
}
const ink = traceInk(context.getImageData(0, 0, plan.width, plan.height).data, plan.width, plan.height);
const sheet = document.createElement('canvas'); sheet.width = ink.width; sheet.height = ink.height;
const sheetContext = sheet.getContext('2d')!, pixels = sheetContext.createImageData(sheet.width, sheet.height);
for (let i = 0; i < ink.alpha.length; i++) {
  pixels.data[i * 4] = Math.round(Math.max(0, ink.order[i]!) * 255);
  pixels.data[i * 4 + 3] = ink.alpha[i]!;
}
sheetContext.putImageData(pixels, 0, 0);
const scene = structuredClone(demoScene), shell: StageEvent = { type: 'shell', rooms: scene.rooms, walls: scene.walls };
const saved = JSON.stringify({ scene, shell, catalog: localCatalog });

const matchMedia = window.matchMedia.bind(window);
let reduced = false;
const listeners = new Set<(event: MediaQueryListEvent) => void>();
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduced; }, media: query, onchange: null,
  addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) { listeners.add(listener); },
  removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) { listeners.delete(listener); },
} as unknown as MediaQueryList : matchMedia(query);
function setReduced(value: boolean): void {
  reduced = value; listeners.forEach(listener => listener({ matches: value } as MediaQueryListEvent));
}

type Sheet = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
let world: THREE.Scene | undefined, renderer: THREE.WebGLRenderer | undefined, camera: THREE.Camera | undefined;
let stage: BlueprintConstruction | undefined, viewport: FinishViewport | undefined, renders = 0;
const samples: { trace: number; scan: number; erase: number; rise: number }[] = [];
const render = THREE.Mesh.prototype.onBeforeRender;
function sourceSheet(): Sheet | undefined {
  return world?.getObjectByName('Blueprint ground')?.children.find(child => child instanceof THREE.Mesh
    && child.material instanceof THREE.ShaderMaterial && child.material.uniforms.uErase) as Sheet | undefined;
}
function structure(): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  world?.traverse(object => { if (object.userData.entityId === 'wall-west' && object.userData.selectionSurface === 'wall') found = object.parent ?? undefined; });
  return found;
}
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  render.apply(this, args);
  if (!args[1].getObjectByName('Blueprint ground')) return;
  world = args[1]; renderer = args[0]; camera = args[2]; renders++;
  const uniforms = sourceSheet()?.material.uniforms;
  if (uniforms) samples.push({ trace: uniforms.uTrace!.value as number, scan: uniforms.uScan!.value as number,
    erase: uniforms.uErase!.value as number, rise: structure()?.scale.y ?? 0 });
};
function resources(): string {
  if (!world || !renderer) throw new Error('No real WebGL frame');
  const meshes: unknown[] = [], lights: unknown[] = [];
  world.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push([object.uuid, object.geometry.uuid,
      (Array.isArray(object.material) ? object.material : [object.material]).map(material => material.uuid)]);
    if (object instanceof THREE.Light) lights.push([object.uuid, object.color.toArray(), object.intensity,
      object.position.toArray(), object.castShadow]);
  });
  return JSON.stringify({ meshes, lights, environment: world.environment?.uuid, intensity: world.environmentIntensity,
    toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure });
}
function reset(): BlueprintConstruction {
  stage?.dispose(); viewport?.dispose(); viewport = undefined;
  world = undefined; renderer = undefined; camera = undefined; samples.length = 0;
  editor.classList.remove('adopted');
  stage = createBlueprintConstruction(host, { ink, sheet, paper: BLUEPRINT_PAPER });
  stage.start(); stage.enter();
  return stage;
}
async function settled(): Promise<void> {
  let unchanged = 0, last = renders;
  const end = performance.now() + 6000;
  while (unchanged < 3) {
    await delay(100);
    unchanged = renders === last ? unchanged + 1 : 0; last = renders;
    if (performance.now() > end) throw new Error('Viewport did not become idle');
  }
}

async function migration(reducedMotion: boolean): Promise<void> {
  const label = reducedMotion ? 'reduced motion' : 'normal motion';
  status.textContent = `Running ${label}`; setReduced(reducedMotion);
  const current = reset(); await until(() => Boolean(sourceSheet()), 'blueprint sheet rendered');
  check(current.planRect()?.width! > 100, `${label}: source sheet has a projected handoff rectangle`);
  check(!structure(), `${label}: no apartment is invented before the shell arrives`);
  if (!reducedMotion) {
    await until(() => samples.some(sample => sample.trace > -0.1 && sample.scan > 0), 'reading trace and scan');
    check(samples.some(sample => sample.trace > -0.1 && sample.scan > 0), 'normal motion: the original sheet keeps its working trace and reading band');
  }
  current.event(shell);
  await until(() => Boolean(structure()), 'shell rendered');
  const registered = sourceSheet()!;
  const expectedWidth = plan.width / pixelsPerMetre, expectedDepth = plan.height / pixelsPerMetre;
  const expectedX = -5 - originX / pixelsPerMetre + expectedWidth / 2;
  const expectedZ = -4 - originZ / pixelsPerMetre + expectedDepth / 2;
  check(Math.abs(registered.scale.x - expectedWidth) < 0.4 && Math.abs(registered.scale.y - expectedDepth) < 0.4
    && Math.abs(registered.position.x - expectedX) < 0.2 && Math.abs(registered.position.z - expectedZ) < 0.2,
  `${label}: plan ink registers beneath the walls at its known metre scale and offset`);
  if (!reducedMotion) {
    await until(() => samples.some(sample => sample.rise > 0.01 && sample.rise < 0.99), 'intermediate wall rise');
    check(samples.some(sample => sample.rise > 0.01 && sample.rise < 0.99), 'normal motion: walls rise through intermediate rendered heights');
  }
  await until(() => structure()?.scale.y === 1, 'completed wall rise');
  check(structure()?.scale.y === 1, `${label}: walls settle at their exact final height`);
  // Real builds stream their furniture before the final document. Warm those materials before
  // measuring the final sweep so one-time shader compilation does not consume its entire duration.
  for (const asset of localCatalog) current.event({ type: 'piece', piece: asset.id, asset } as StageEvent);
  current.event({ type: 'placements', objects: scene.objects });
  await settled();
  await bounded(current.finish(scene, localCatalog), `${label} completion`, 7000);
  await settled();
  if (!reducedMotion) check(samples.some(sample => sample.erase > 0.1 && sample.erase < 0.9), 'normal motion: original ink erases with an intermediate drafting sweep');
  check(sourceSheet()?.visible === false, `${label}: completion removes the original sheet while preserving blueprint ground`);
  check(!world?.getObjectByName('Apartment presentation stage'), `${label}: construction has no legacy presentation platform`);
  check(world?.getObjectsByProperty('type', 'PointLight').length, `${label}: completed scene retains real furniture lighting`);

  const liveRenderer = renderer!, liveWorld = world!, liveCamera = camera!;
  const canvas = host.querySelector('canvas')!;
  const surface = canvas.closest('.world-viewport');
  const helpers = surface ? [...surface.children] : [];
  const owned = current.takeViewport(); check(owned, `${label}: construction transfers its live viewport`); viewport = owned;
  check(current.takeViewport() === null, `${label}: viewport ownership transfers only once`);
  let selections = 0, interactions = 0, disposalCount = 0;
  const rendererDispose = liveRenderer.dispose.bind(liveRenderer);
  liveRenderer.dispose = () => { disposalCount++; rendererDispose(); };
  // Keep a navigation key held across adoption; the new host must not inherit travel.
  canvas.focus(); canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
  await delay(80);
  const before = resources(), pose = JSON.stringify(viewport.cameraPose());
  editor.classList.add('adopted');
  viewport.attach(editor, {
    onSelect() { selections++; }, onInteraction() { interactions++; },
    onTransform() { errors.push('Unexpected document transform during camera checks'); }, onError(message) { errors.push(message); },
  });
  current.dispose(); await delay(120);
  check(editor.querySelector('canvas') === canvas && !host.querySelector('canvas'), `${label}: editor adopts the same canvas and construction releases it`);
  check(surface && editor.contains(surface) && helpers.every(helper => surface.contains(helper)), `${label}: viewport surface and canvas helpers move together`);
  check(world === liveWorld && renderer === liveRenderer && camera === liveCamera && resources() === before,
    `${label}: adoption preserves renderer, world, camera, geometry, materials, lights and environment`);
  check(JSON.stringify(viewport.cameraPose()) === pose, `${label}: adoption preserves the exact camera pose and releases held navigation`);
  check(disposalCount === 0, `${label}: disposing construction does not dispose editor rendering resources`);
  viewport.setScene(scene, localCatalog); await settled();
  check(resources() === before, `${label}: first editor scene sync preserves the existing projected resources`);
  viewport.setLocked(false);
  const rect = canvas.getBoundingClientRect();
  // Shift-click tests the rebound editor selection callback without beginning an orbit gesture.
  shiftClick(canvas, rect.left + 6, rect.top + 6);
  check(selections === 1, `${label}: adopted pointer events use editor callbacks`);
  canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
  canvas.focus(); canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
  await delay(60); canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
  check(interactions >= 2, `${label}: adopted navigation reports editor interaction start and stop`);
  await settled(); const idle = renders; await delay(220);
  check(renders === idle, `${label}: adopted editor returns to idle rendering`);
  viewport.dispose(); viewport = undefined; await delay(70);
  check(Number(disposalCount) === 1 && !editor.querySelector('canvas') && listeners.size === 0,
    `${label}: final owner disposes the renderer, canvas and motion listeners exactly once`);
}

async function borrowedConstruction(): Promise<void> {
  status.textContent = 'Running editor reconstruction'; setReduced(true);
  const callbacks = { onSelect() {}, onInteraction() {}, onTransform() {}, onError(message: string) { errors.push(message); } };
  const owned = createViewport(editor, callbacks); viewport = owned;
  owned.setScene(scene, localCatalog); await settled();
  const canvas = editor.querySelector('canvas')!, liveRenderer = renderer;
  const reconstruction = createBlueprintConstruction(host, { ink, sheet, paper: BLUEPRINT_PAPER, viewport: owned });
  stage = reconstruction; reconstruction.start(); reconstruction.enter();
  check(host.querySelector('canvas') === canvas && !editor.querySelector('canvas'), 'editor reconstruction borrows the existing canvas and helpers');
  await reconstruction.hydrate([shell], 'walls');
  await bounded(reconstruction.finish(scene, localCatalog), 'borrowed reconstruction finishes'); await settled();
  const projected = resources();
  check(renderer === liveRenderer, 'editor reconstruction uses its original WebGL renderer');
  check(reconstruction.takeViewport() === owned, 'editor reconstruction returns the same borrowed viewport');
  owned.attach(editor, callbacks); reconstruction.dispose(); await settled();
  check(editor.querySelector('canvas') === canvas && renderer === liveRenderer && resources() === projected,
    'closing reconstruction preserves the completed world in the editor');
  const repeated = createBlueprintConstruction(host, { ink, sheet, paper: BLUEPRINT_PAPER, viewport: owned });
  stage = repeated; repeated.start(); repeated.enter(); await delay(70);
  check(sourceSheet()?.visible && (sourceSheet()!.material.uniforms.uErase!.value as number) < 0,
    'repeated reconstruction resets the previous erase sweep so the new source is visible');
  repeated.takeViewport(); owned.attach(editor, callbacks); repeated.dispose();
  owned.setBackdrop(null); owned.setScene(scene, localCatalog); await settled();
  check(editor.querySelector('canvas') === canvas && renderer === liveRenderer && sourceSheet()?.visible === false,
    'cancelled reconstruction returns its live renderer and clears the temporary source sheet');
  owned.dispose(); viewport = undefined;
  check(!editor.querySelector('canvas') && listeners.size === 0, 'borrowed construction and final owner release all motion subscriptions');
}

async function failedAdoption(): Promise<void> {
  status.textContent = 'Running failed editor startup recovery'; setReduced(true);
  const current = reset(); await current.hydrate([shell], 'walls');
  await bounded(current.finish(scene, localCatalog), 'recovery scene completes'); await settled();
  const canvas = host.querySelector('canvas')!, before = resources(), pose = JSON.stringify(current.pose());
  const owned = current.takeViewport()!; viewport = owned;
  const callbacks = { onSelect() {}, onInteraction() {}, onTransform() {}, onError(message: string) { errors.push(message); } };
  owned.attach(editor, callbacks);
  current.reclaimViewport(); await settled();
  check(host.querySelector('canvas') === canvas && !editor.querySelector('canvas') && resources() === before,
    'failed editor startup reclaims the same live world into the construction host');
  check(JSON.stringify(current.pose()) === pose, 'startup recovery preserves the exact camera');
  check(current.takeViewport() === owned, 'retry transfers the reclaimed viewport successfully');
  owned.attach(editor, callbacks); current.dispose(); await settled();
  check(editor.querySelector('canvas') === canvas && resources() === before, 'disposing recovered construction leaves the retried editor world alive');
  owned.dispose(); viewport = undefined;
  check(listeners.size === 0, 'reclaim and retry release every motion subscription');
}

function renderedCamera(): string {
  if (!camera) throw new Error('No rendered camera');
  return JSON.stringify({ id: camera.uuid, position: camera.position.toArray(), rotation: camera.quaternion.toArray(),
    projection: camera.projectionMatrix.toArray() });
}

async function cancelledPresentation(): Promise<void> {
  status.textContent = 'Running cancelled presentation restoration'; setReduced(true);
  const controlled = migrateScene(structuredClone(scene));
  controlled.project!.metadata['room-living'] = { ceilingHeight: 2.7, ceilingDesign: defaultCeilingDesign('quiet') };
  controlled.project!.components = [{ id: 'qa-dimmer', name: 'QA dimmer', kind: 'switch', position: [-4.8, 1.1, -3.8],
    dimensions: [.08, .08, .025], rotation: 0, color: '#ffffff', phase: 'existing', control: { type: 'dimmer', targets: ['room-living'], gangs: 1 } }];
  const controlledSaved = JSON.stringify(controlled);
  const callbacks = { onSelect() {}, onInteraction() {}, onTransform() {}, onError(message: string) { errors.push(message); } };
  const owned = createViewport(editor, callbacks); viewport = owned;
  for (const view of ['perspective', 'top', 'inside'] as const) {
    owned.setScene(controlled, localCatalog); owned.setView('perspective');
    owned.setCameraPose({ position: [17, 12, 11], target: [0.3, 1, 0.4], fov: 40 }, 0);
    owned.setSkybox('sunset'); owned.setSun({ enabled: true, azimuth: 147, elevation: 23, intensity: 51, timeOfDay: null });
    owned.setInsideLens('wide'); owned.setWalls('full'); owned.setDoorAngle('door-kitchen', 0.6);
    owned.setSwitchLevel('qa-dimmer', 0.35); owned.toggleSwitch('qa-dimmer');
    const outside = JSON.stringify(owned.cameraPose());
    owned.setSelection('room-living'); owned.setView(view); await settled();
    const before = renderedCamera(), sun = JSON.stringify(owned.getSun()), environment = world?.environment;
    const doorAngle = owned.getDoorAngle('door-kitchen');
    const restore = owned.preservePresentation();
    owned.setView('perspective'); owned.setInsideLens('standard'); owned.setSkybox('overcast');
    owned.setSun({ enabled: false, azimuth: 30, elevation: 10, intensity: 90, timeOfDay: null });
    owned.setWalls('cutaway'); owned.setDoorAngle('door-kitchen', 0);
    owned.setScene({ ...scene, id: 'qa-temporary-construction', rooms: [], walls: [], objects: [] }, []);
    owned.setScene(controlled, localCatalog); restore(); await settled();
    check(renderedCamera() === before, `${view}: cancelled construction restores the rendered camera and projection exactly`);
    check(JSON.stringify(owned.getSun()) === sun && Math.abs(owned.getDoorAngle('door-kitchen') - doorAngle) < 1e-8,
      `${view}: cancelled construction restores manual Sun settings and opening preview`);
    check(world?.environment === environment, `${view}: cancelled construction restores the selected sky illumination`);
    check(owned.getSwitchLevel('qa-dimmer') === 0, `${view}: cancelled construction restores an explicitly switched-off circuit`);
    owned.toggleSwitch('qa-dimmer');
    check(Math.abs(owned.getSwitchLevel('qa-dimmer') - 0.35) < 1e-8, `${view}: restored circuit remembers its previous dimmer level`);
    if (view === 'inside') {
      owned.setView('perspective'); await settled();
      check(JSON.stringify(owned.cameraPose()) === outside, 'cancelled Inside reconstruction retains its prior outside camera for exiting Inside');
      check(Math.abs(owned.getDoorAngle('door-kitchen') - 0.6) < 1e-8, 'exiting restored Inside returns doors to their previous outside preview');
    }
  }
  check(JSON.stringify(controlled) === controlledSaved, 'presentation recovery never changes source scene or saved light defaults');
  owned.dispose(); viewport = undefined;
}

async function runChecks(full: boolean): Promise<void> {
  run.disabled = recovery.disabled = true; results.length = 0; errors.length = 0;
  try {
    if (full) { await migration(false); await migration(true); await borrowedConstruction(); }
    await failedAdoption(); await cancelledPresentation();
    setReduced(false); const cancelled = reset(); cancelled.event(shell);
    const finishing = cancelled.finish(scene, localCatalog);
    cancelled.dispose(); await bounded(finishing, 'cancelled completion settles', 500);
    check(!host.querySelector('canvas'), 'disposing during completion settles the promise and removes its canvas');
    check(JSON.stringify({ scene, shell, catalog: localCatalog }) === saved, 'construction, navigation and adoption preserve input scene, catalog and shell');
    await delay(0); // Let pending unhandledrejection notifications reach the global observer.
    check(errors.length === 0, `no rendering errors, uncaught browser errors or unintended document transformations${errors.length ? `: ${errors.join('; ')}` : ''}`);
    status.textContent = `COMPLETE ${results.length} blueprint migration checks`; output.textContent += `\n${status.textContent}`;
  } catch (error) { status.textContent = `FAIL ${String(error)}`; output.textContent += `\n${status.textContent}`; console.error(error); }
  finally { run.disabled = recovery.disabled = false; }
}
run.onclick = () => void runChecks(true);
recovery.onclick = () => void runChecks(false);
if (new URLSearchParams(location.search).has('autorun')) run.click();
window.addEventListener('pagehide', () => {
  stage?.dispose(); viewport?.dispose(); THREE.Mesh.prototype.onBeforeRender = render; window.matchMedia = matchMedia;
  window.removeEventListener('error', recordWindowError); window.removeEventListener('unhandledrejection', recordRejection);
}, { once: true });
