/** Real-browser measurements on a disposable scene, never the user's project. */
import * as THREE from 'three';
import { createViewport } from './viewport';
import { StudioRenderer } from './studio-renderer';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { effectiveSunlight, type SunSettings, type SunLighting } from './sunlight';
import { SkyboxResources } from './skybox';
import { buildCeilingDesignOperations, defaultCeilingDesign } from '../core/ceiling-design';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const store = new EditorStore(structuredClone(demoScene), localCatalog);
const errors: string[] = [];
// Three.js reports shader-link failures to the console without throwing.
// Treat these as failures as well as viewport callback errors.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); originalConsoleError(...args); };
let transform: TransformControls;
let rejectTransforms = false;
const originalMode = TransformControls.prototype.setMode;
TransformControls.prototype.setMode = function (...args) { transform = this; return originalMode.apply(this, args); };
let world: THREE.Scene | undefined, renderer: THREE.WebGLRenderer | undefined;
let activeCamera: THREE.Camera | undefined;
let studio: StudioRenderer | undefined;
let benchmarkMode: 'baseline' | 'optimized' | null = null;
const originalInteracting = StudioRenderer.prototype.setInteracting;
StudioRenderer.prototype.setInteracting = function (active) {
  // Apply before the viewport's request reaches AO: baseline must never resize
  // down and back up on every moving frame.
  originalInteracting.call(this, benchmarkMode === 'baseline' ? false : active);
};
const capturedSkies: Array<{ preset: string; background: THREE.CubeTexture; lighting?: SunLighting }> = [];
const seenBackgrounds = new WeakSet<THREE.CubeTexture>();
const originalSky = SkyboxResources.prototype.get;
SkyboxResources.prototype.get = function (preset, lighting) {
  const result = originalSky.call(this, preset, lighting);
  if (!seenBackgrounds.has(result.background)) {
    seenBackgrounds.add(result.background);
    capturedSkies.push({ preset, background: result.background, lighting: lighting ? structuredClone(lighting) : undefined });
  }
  return result;
};
let totalFrames = 0, recording = false;
const shadowDraws = new Map<THREE.Camera, number>();
const originalShadow = THREE.Mesh.prototype.onBeforeShadow;
THREE.Mesh.prototype.onBeforeShadow = function (...args) {
  originalShadow.apply(this, args);
  shadowDraws.set(args[3], (shadowDraws.get(args[3]) ?? 0) + 1);
};
let occlusion: GTAOPass | undefined;
const originalPass = EffectComposer.prototype.addPass;
EffectComposer.prototype.addPass = function (pass) {
  if (pass instanceof GTAOPass) occlusion = pass;
  originalPass.call(this, pass);
};
interface Sample { submitMs: number; intervalMs: number; calls: number; triangles: number; aoPixels: number }
let samples: Sample[] = [], previousTime = 0;
const originalMesh = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  originalMesh.apply(this, args);
  if (args[1].getObjectByName('Apartment presentation stage')) { world = args[1]; renderer = args[0]; }
};
const originalRender = StudioRenderer.prototype.render;
StudioRenderer.prototype.render = function (camera) {
  studio = this;
  activeCamera = camera;
  if (benchmarkMode === 'baseline') {
    // Reproduce only the previously uncached sun/ceiling workload on this scene.
    // Window daylight was already cached, so refreshing it would inflate baseline.
    world?.traverse(object => {
      const previouslyUncached = object.name === 'Sun' || object.name.startsWith('Ceiling downlight');
      if (previouslyUncached && (object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight) && object.castShadow) object.shadow.needsUpdate = true;
    });
    this.setInteracting(false);
  }
  const start = performance.now();
  const autoReset = renderer?.info.autoReset;
  try {
    if (renderer) { renderer.info.autoReset = false; renderer.info.reset(); }
    originalRender.call(this, camera);
    totalFrames++;
    if (recording && renderer) {
      samples.push({ submitMs: performance.now() - start, intervalMs: previousTime ? start - previousTime : 0,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        aoPixels: occlusion ? occlusion.gtaoRenderTarget.width * occlusion.gtaoRenderTarget.height : 0 });
      previousTime = start;
    }
  } finally { if (renderer && autoReset !== undefined) renderer.info.autoReset = autoReset; }
};
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() { if (!rejectTransforms) throw new Error('Benchmark edited the project'); }, onError: message => errors.push(message),
});
EffectComposer.prototype.addPass = originalPass;
TransformControls.prototype.setMode = originalMode;
// Track only this QA viewport's presentation so every benchmark restores it.
let currentQuality: Parameters<typeof viewport.setQuality>[0] = 'balanced';
let currentSky: Parameters<typeof viewport.setSkybox>[0] = 'studio';
let currentView: Parameters<typeof viewport.setView>[0] = 'perspective';
let currentWalls: Parameters<typeof viewport.setWalls>[0] = 'cutaway';
let currentMood: Parameters<typeof viewport.setLightingMood>[0] = 'day';
let storedSun = viewport.getSun();
const setQuality = viewport.setQuality.bind(viewport), setSkybox = viewport.setSkybox.bind(viewport);
const setView = viewport.setView.bind(viewport), setWalls = viewport.setWalls.bind(viewport);
const setLightingMood = viewport.setLightingMood.bind(viewport);
const setSun = viewport.setSun.bind(viewport);
viewport.setQuality = mode => { currentQuality = mode; setQuality(mode); };
viewport.setSkybox = preset => { const accepted = setSkybox(preset); if (accepted) currentSky = preset; return accepted; };
viewport.setView = view => { const accepted = setView(view); if (accepted) currentView = view; return accepted; };
viewport.setWalls = walls => { currentWalls = walls; setWalls(walls); };
viewport.setLightingMood = mood => { currentMood = mood; setLightingMood(mood); };
viewport.setSun = patch => { setSun(patch); currentMood = 'day'; storedSun = viewport.getSun(); };
viewport.setScene(store.scene, localCatalog);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0).toFixed(2));
}
async function measure(view: 'perspective' | 'inside') {
  viewport.setView(view); viewport.focus(view === 'inside' ? 'room-living' : undefined);
  await delay(900);
  if (!activeCamera || !renderer) throw new Error('No rendered camera');
  const camera = activeCamera, startPosition = camera.position.clone(), startQuaternion = camera.quaternion.clone();
  const axis = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  const runPoses = async (count: number) => {
    for (let index = 0; index < count; index++) {
      const angle = Math.sin(index / (count - 1) * Math.PI * 2) * 0.25;
      if (view === 'inside') camera.quaternion.copy(startQuaternion).multiply(turn.setFromAxisAngle(axis, angle));
      else { camera.position.copy(startPosition).applyAxisAngle(axis, angle); camera.lookAt(0, 0.55, 0); }
      viewport.setSnap(true); // public invalidation, does not change the document
      await nextFrame();
    }
  };
  const results = [];
  try {
    // Both modes use the same warmed scene, original pose and 120-frame path.
    for (const mode of ['baseline', 'optimized'] as const) {
      benchmarkMode = mode; recording = false;
      await runPoses(24);
      samples = []; previousTime = 0; recording = true;
      let aoTargetReallocations = 0;
      const resized = () => { aoTargetReallocations++; };
      const targets = [occlusion!.gtaoRenderTarget, occlusion!.pdRenderTarget];
      targets.forEach(target => target.addEventListener('dispose', resized));
      try { await runPoses(120); }
      finally { targets.forEach(target => target.removeEventListener('dispose', resized)); }
      recording = false;
      if (mode === 'baseline' && aoTargetReallocations) throw new Error('Baseline changed AO allocation during its measured frames');
      results.push({ mode, frames: samples.length, aoTargetReallocations,
        aoPixels: { p50: percentile(samples.map(s => s.aoPixels), .5), p95: percentile(samples.map(s => s.aoPixels), .95) },
        cpuSubmitMs: { p50: percentile(samples.map(s => s.submitMs), .5), p95: percentile(samples.map(s => s.submitMs), .95) },
        frameIntervalMs: { p50: percentile(samples.slice(1).map(s => s.intervalMs), .5), p95: percentile(samples.slice(1).map(s => s.intervalMs), .95) },
        drawCalls: { p50: percentile(samples.map(s => s.calls), .5), p95: percentile(samples.map(s => s.calls), .95) },
        triangles: { p50: percentile(samples.map(s => s.triangles), .5), p95: percentile(samples.map(s => s.triangles), .95) } });
    }
  } finally {
    recording = false; benchmarkMode = null; studio?.setInteracting(false);
    camera.position.copy(startPosition); camera.quaternion.copy(startQuaternion); viewport.setSnap(true);
  }
  await delay(400); return { view, results };
}
document.querySelector<HTMLButtonElement>('#benchmark')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; status.textContent = 'Benchmark running';
  const controls = document.querySelector<HTMLButtonElement>('#checks')!; controls.disabled = true;
  const previous = { quality: currentQuality, sky: currentSky, view: currentView, walls: currentWalls, mood: currentMood, sun: { ...storedSun } };
  let measured = false;
  try {
    const saved = JSON.stringify(store.scene), revision = store.revision;
    viewport.setQuality('balanced'); viewport.setSkybox('studio'); viewport.setSelection(null); viewport.setWalls('full');
    await delay(900);
    const overview = await measure('perspective'), inside = await measure('inside');
    if (saved !== JSON.stringify(store.scene) || revision !== store.revision) throw new Error('Document changed');
    if (errors.length) throw new Error(errors.join('\n'));
    const size = renderer!.getSize(new THREE.Vector2());
    output.textContent = JSON.stringify({ viewport: size.toArray(), dpr: renderer!.getPixelRatio(), quality: 'balanced', sky: 'studio', sun: viewport.getSun(), objects: store.scene.objects.length,
      note: 'Same current scene, Sun settings and camera paths in both modes. Baseline refreshes previously uncached sun/ceiling shadows and forces full AO, retaining existing window-light caches; optimized uses production caching/adaptive AO. 24 warmup and 120 measured frames per mode/view. CPU submission and observed frame intervals are not GPU timings.', overview, inside }, null, 2);
    measured = true; status.textContent = 'Restoring presentation after benchmark';
  } catch (error) { status.textContent = `FAIL ${String(error)}`; }
  finally {
    recording = false; benchmarkMode = null; studio?.setInteracting(false);
    viewport.setQuality(previous.quality); viewport.setSkybox(previous.sky); viewport.setSun(previous.sun);
    viewport.setLightingMood(previous.mood); viewport.setView(previous.view); viewport.setWalls(previous.walls); viewport.setSnap(true);
    await delay(700);
    const size = renderer?.getDrawingBufferSize(new THREE.Vector2());
    const effectivePrevious = { ...previous.sun, enabled: previous.sun.enabled && previous.mood !== 'evening' };
    const restored = size && occlusion?.gtaoRenderTarget.width === size.x
      && occlusion.gtaoMaterial.defines.SAMPLES === (previous.quality === 'high' ? 32 : 16)
      && JSON.stringify(viewport.getSun()) === JSON.stringify(effectivePrevious)
      && JSON.stringify(storedSun) === JSON.stringify(previous.sun) && benchmarkMode === null;
    if (!restored) status.textContent = 'FAIL benchmark did not restore full AO, quality or manual Sun settings';
    else if (measured) status.textContent = 'COMPLETE benchmark; presentation and normal rendering restored';
    button.disabled = false; controls.disabled = false;
  }
};
document.querySelector<HTMLButtonElement>('#checks')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  const benchmark = document.querySelector<HTMLButtonElement>('#benchmark')!; benchmark.disabled = true;
  status.textContent = 'Checks running';
  const checks: string[] = [];
  const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(`PASS ${message}`); output.textContent = checks.join('\n'); };
  try {
    viewport.setScene(store.scene, localCatalog); viewport.setView('perspective'); viewport.setWalls('full'); viewport.focus(); await delay(800);
    const saved = JSON.stringify(store.scene), revision = store.revision;
    const sun = world!.getObjectByName('Sun') as THREE.DirectionalLight;
    check(sun && !sun.shadow.autoUpdate, 'Sun shadows are cached');
    const rendered = (light: THREE.DirectionalLight | THREE.SpotLight) => shadowDraws.get(light.shadow.camera) ?? 0;
    let before = rendered(sun);
    viewport.focus('room-living'); await delay(60);
    const size = renderer!.getDrawingBufferSize(new THREE.Vector2());
    check(occlusion!.gtaoRenderTarget.width === Math.ceil(size.x / 2), 'Camera motion renders half-resolution AO');
    await delay(700);
    check(rendered(sun) === before, 'Animated camera framing reuses sun shadows');
    check(occlusion!.gtaoRenderTarget.width === size.x, 'Settling restores full-resolution AO');
    const idle = totalFrames; await delay(250); check(totalFrames === idle, 'Settled renderer has no idle loop');
    viewport.setSelection('coffee-table');
    for (const tool of ['rotate', 'scale'] as const) {
      viewport.setTool(tool); await delay(300);
      const object = transform!.object!, originalQuaternion = object.quaternion.clone(), originalScale = object.scale.clone();
      transform!.dispatchEvent({ type: 'mouseDown', mode: tool });
      if (tool === 'rotate') object.rotateY(.35); else object.scale.multiplyScalar(1.1);
      transform!.dispatchEvent({ type: 'objectChange' }); await delay(300);
      before = rendered(sun); viewport.cancelInteraction(); await delay(300);
      check(rendered(sun) > before && object.quaternion.angleTo(originalQuaternion) < 1e-8 && object.scale.equals(originalScale), `Canceling a rendered ${tool} preview restores its shadows`);
    }
    viewport.setTool('rotate'); await delay(200);
    const rotation = transform!.object!.quaternion.clone();
    transform!.dispatchEvent({ type: 'mouseDown', mode: 'rotate' }); transform!.object!.rotateY(.35);
    transform!.dispatchEvent({ type: 'objectChange' }); await delay(300);
    before = rendered(sun); rejectTransforms = true;
    transform!.dispatchEvent({ type: 'mouseUp', mode: 'rotate' }); rejectTransforms = false; await delay(300);
    check(rendered(sun) > before && transform!.object!.quaternion.angleTo(rotation) < 1e-8, 'Rejected transform restores the authoritative shadow');
    viewport.setSelection(null); viewport.setTool('select'); await delay(250);
    before = rendered(sun); viewport.setDoorAngle('door-bedroom', 1); await delay(650);
    check(rendered(sun) > before && viewport.getDoorAngle('door-bedroom') === 1, 'Door motion refreshes shadows and reaches its target');
    before = rendered(sun); viewport.setSnap(true); await delay(60);
    check(rendered(sun) === before, 'Door completion returns to cached shadows');
    before = rendered(sun); viewport.setLayer('furniture', false); await delay(120);
    check(rendered(sun) > before, 'Hiding casters refreshes sun shadows');
    viewport.setLayer('furniture', true); await delay(150);
    const changed = structuredClone(store.scene); changed.objects[0]!.position[0] += .1;
    before = rendered(sun); viewport.setScene(changed, localCatalog); await delay(650);
    check(rendered(sun) > before, 'Furniture transform refreshes shadows through the final animation frame');
    before = rendered(sun); viewport.setScene(store.scene, localCatalog); await delay(650);
    check(rendered(sun) > before, 'Restoring the original furniture pose refreshes shadows');
    before = rendered(sun); viewport.setWalls('cutaway'); await delay(550);
    check(rendered(sun) > before, 'Cutaway transitions refresh caster silhouettes');
    viewport.setWalls('full'); await delay(450);
    const manualSun: SunSettings = { enabled: true, azimuth: 123, elevation: 12, intensity: 137 };
    viewport.setSun(manualSun); await delay(250);
    const matchesSun = (settings: SunSettings, evening = false) => {
      const expected = effectiveSunlight(settings, evening);
      return sun.position.clone().sub(sun.target.position).normalize().distanceTo(new THREE.Vector3(...expected.sunDirection)) < 1e-8
        && sun.color.equals(new THREE.Color(expected.sunColor)) && Math.abs(sun.intensity - expected.sunIntensity) < 1e-10;
    };
    check(matchesSun(manualSun), 'Manual Sun angle, warmth and brightness drive the shared lighting descriptor');
    viewport.setSkybox('daylight'); await delay(250);
    const capturesBeforeBurst = capturedSkies.length;
    for (const azimuth of [130, 145, 167]) viewport.setSun({ azimuth });
    const burstSun = { ...manualSun, azimuth: 167 };
    check(matchesSun(burstSun), 'A Sun slider burst changes direct sunlight synchronously');
    check(capturedSkies.length === capturesBeforeBurst, 'A synchronous slider burst does not recapture the sky before the debounce');
    await delay(300);
    const lastSky = capturedSkies.at(-1);
    check(capturedSkies.length === capturesBeforeBurst + 1 && lastSky?.preset === 'daylight'
      && JSON.stringify(lastSky.lighting) === JSON.stringify(effectiveSunlight(burstSun)), 'The settled slider burst captures exactly one sky with the final shared Sun descriptor');
    viewport.setSun(manualSun); await delay(250); viewport.setSkybox('studio'); await delay(200);
    for (const preset of ['daylight', 'sunset', 'overcast'] as const) {
      before = rendered(sun); viewport.setSkybox(preset); await delay(200);
      check(matchesSun(manualSun) && JSON.stringify(viewport.getSun()) === JSON.stringify(manualSun), `${preset} preserves the manual Sun settings and shared direction`);
      check(rendered(sun) > before, `${preset} refreshes cached shadows`);
    }
    const translated = structuredClone(store.scene);
    for (const room of translated.rooms) for (const point of room.polygon) point[0] += 10;
    for (const wall of translated.walls) { wall.start[0] += 10; wall.end[0] += 10; }
    for (const object of translated.objects) object.position[0] += 10;
    viewport.setSkybox('sunset'); viewport.setScene(translated, localCatalog); await delay(650);
    check(matchesSun(manualSun) && JSON.stringify(viewport.getSun()) === JSON.stringify(manualSun), 'Rebuilding an off-origin shell preserves manual Sun settings');
    viewport.setScene(store.scene, localCatalog); viewport.setView('top'); await delay(600);
    check(matchesSun(manualSun) && !occlusion!.enabled, 'Top preserves manual Sun settings and skips AO');
    viewport.setView('inside'); viewport.focus('room-living'); await delay(700);
    check(matchesSun(manualSun), 'Inside retains the same manual sunlight');
    viewport.setLightingMood('evening'); await delay(200);
    check(matchesSun(manualSun, true) && JSON.stringify(viewport.getSun()) === JSON.stringify({ ...manualSun, enabled: false }), 'Evening reports disabled sunlight while preserving the manual angle and brightness');
    viewport.setSkybox('overcast'); await delay(200);
    check(matchesSun(manualSun, true), 'Changing the sky during evening keeps direct sunlight suppressed');
    viewport.setLightingMood('day'); await delay(200);
    check(matchesSun(manualSun) && JSON.stringify(viewport.getSun()) === JSON.stringify(manualSun), 'Day restores the enabled manual Sun after evening and sky changes');
    viewport.setSun({ enabled: false }); await delay(200); viewport.setSkybox('sunset'); await delay(200);
    check(matchesSun({ ...manualSun, enabled: false }) && !viewport.getSun().enabled, 'Changing sky does not enable a manually disabled Sun');
    viewport.setSun(manualSun); await delay(200);
    check(JSON.stringify(store.scene) === saved && store.revision === revision, 'Rendering and navigation preserve the project and history');
    const result = store.execute({ id: 'qa-ceiling', label: 'QA ceiling', source: 'human', baseRevision: store.revision,
      operations: buildCeilingDesignOperations(store.scene, 'room-living', defaultCeilingDesign('quiet')) }, true);
    check(result.ok, 'Disposable project accepts a ceiling design');
    viewport.setScene(store.scene, localCatalog); viewport.inspectCeiling('room-living'); await delay(600);
    const ceilingLights: THREE.SpotLight[] = [];
    world!.traverse(object => { if (object instanceof THREE.SpotLight && object.name.startsWith('Ceiling downlight')) ceilingLights.push(object); });
    const ceilingCasters = ceilingLights.filter(light => light.castShadow);
    check(ceilingCasters.length > 0 && ceilingCasters.length <= 3 && ceilingCasters.every(light => !light.shadow.autoUpdate && light.shadow.map), 'Ceiling shadow budget renders cached maps within the GPU sampler limit');
    check(ceilingLights.length > ceilingCasters.length && ceilingLights.every(light => light.intensity > 0), 'Ceiling fixtures beyond the shadow budget retain their illumination');
    const ceilingBefore = ceilingCasters.map(rendered);
    activeCamera!.rotateY(.08); viewport.setSnap(true); await delay(300);
    check(ceilingCasters.every((light, i) => rendered(light) === ceilingBefore[i]), 'Inside look reuses ceiling shadow maps');
    before = rendered(sun); viewport.setDoorAngle('door-bedroom', 0); await delay(700);
    check(rendered(sun) > before && ceilingCasters.some((light, i) => rendered(light) > ceilingBefore[i]!), 'Moving a door refreshes sun and ceiling caches together');
    const undo = store.undo(); check(undo.ok, 'Ceiling edit remains undoable'); viewport.setScene(store.scene, localCatalog);
    viewport.setView('perspective'); viewport.setSkybox('sunset'); viewport.setWalls('cutaway'); viewport.focus(); await delay(900);
    check(errors.length === 0, `Renderer reported no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    status.textContent = `COMPLETE ${checks.length} rendering checks`;
  } catch (error) { status.textContent = `FAIL ${String(error)}`; }
  finally { button.disabled = false; benchmark.disabled = false; }
};
window.addEventListener('pagehide', () => {
  viewport.dispose(); console.error = originalConsoleError; THREE.Mesh.prototype.onBeforeRender = originalMesh; THREE.Mesh.prototype.onBeforeShadow = originalShadow; StudioRenderer.prototype.render = originalRender;
  StudioRenderer.prototype.setInteracting = originalInteracting; SkyboxResources.prototype.get = originalSky;
}, { once: true });
