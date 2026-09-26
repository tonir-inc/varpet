import * as THREE from 'three';
import { SkyboxResources } from './skybox';
import * as Sunlight from './sunlight';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(`Sky lighting: ${message}`); }
const close = (a: number, b: number) => Math.abs(a - b) < 1e-10;
assert('effectiveSunlight' in Sunlight, 'Manual Sun settings supply the shared sky and direct-light descriptor');
const { effectiveSunlight, DEFAULT_SUN, sunDirection } = Sunlight;
const defaults = effectiveSunlight(DEFAULT_SUN);
assert(defaults.sunIntensity === 3.2 && defaults.sunColor === '#fff1db', 'Current Sun controls retain their default strength and color');
assert(new THREE.Vector3(...defaults.sunDirection).distanceTo(sunDirection(DEFAULT_SUN)) < 1e-10, 'Default descriptor follows the existing solar orientation');
const manualSettings = { enabled: true, azimuth: 90, elevation: 15, intensity: 50 };
const originalSettings = JSON.stringify(manualSettings);
const manual = effectiveSunlight(manualSettings);
assert(close(new THREE.Vector3(...manual.sunDirection).length(), 1), 'Manual angles supply a unit direction');
assert(manual.sunDirection[0] > 0.9 && Math.abs(manual.sunDirection[2]) < 1e-10, 'Manual east sun stays east instead of adopting a preset direction');
assert(close(manual.sunDirection[1], Math.sin(Math.PI / 12)), 'Manual solar elevation controls the sky glow height');
assert(manual.sunColor === '#ffd09b' && manual.sunIntensity === 1.6, 'Manual low sun retains its warm color and percentage strength');
assert(effectiveSunlight({ ...manualSettings, intensity: 200 }).sunIntensity === 6.4, 'Full strength range reaches the shared sky descriptor');
assert(effectiveSunlight({ ...manualSettings, enabled: false }).sunIntensity === 0, 'Sun off removes both direct light and sky glow');
const evening = effectiveSunlight(manualSettings, true);
assert(evening.sunIntensity === 0, 'Evening removes direct light and sky glow in every view');
assert(JSON.stringify(evening.sunDirection) === JSON.stringify(manual.sunDirection), 'Evening retains manual orientation for the next daytime preview');
assert(JSON.stringify(manualSettings) === originalSettings, 'Lighting derivation leaves control settings unchanged');

// Capture the actual sky shader at the renderer boundary, while allowing the
// real CubeCamera and PMREM lifecycle to run. Pixel appearance is checked in UI.
class CaptureRenderer {
  readonly coordinateSystem = THREE.WebGLCoordinateSystem;
  readonly xr = { enabled: false };
  readonly skies = new Map<string, THREE.ShaderMaterial>();
  readonly targets = new Map<THREE.WebGLRenderTarget, number>();
  autoClear = true;
  renders = 0;
  failCapture = false;
  target: THREE.WebGLRenderTarget | null = null;
  face = 0;
  mip = 0;
  getRenderTarget() { return this.target; }
  getActiveCubeFace() { return this.face; }
  getActiveMipmapLevel() { return this.mip; }
  getViewport(value: THREE.Vector4) { return value.set(0, 0, 128, 128); }
  setViewport(_value: THREE.Vector4) {}
  getScissor(value: THREE.Vector4) { return value.set(0, 0, 128, 128); }
  setScissor(_value: THREE.Vector4) {}
  getScissorTest() { return false; }
  setScissorTest(_value: boolean) {}
  setRenderTarget(target: THREE.WebGLRenderTarget | null, face = 0, mip = 0) {
    this.target = target; this.face = face; this.mip = mip;
    if (target && !this.targets.has(target)) {
      this.targets.set(target, 0);
      target.addEventListener('dispose', () => this.targets.set(target, this.targets.get(target)! + 1));
    }
  }
  render(scene: THREE.Object3D) {
    this.renders++;
    if (!(this.target instanceof THREE.WebGLCubeRenderTarget)) return;
    if (this.failCapture) throw new Error('Simulated capture failure');
    scene.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial) this.skies.set(object.material.name, object.material);
    });
  }
}
const renderer = new CaptureRenderer();
const resources = new SkyboxResources(renderer as unknown as THREE.WebGLRenderer);
for (const preset of ['daylight', 'sunset', 'overcast'] as const) {
  resources.get(preset, manual);
  const material = renderer.skies.get(`Skybox ${preset} capture`);
  assert(material, `${preset} generates a sky capture`);
  assert((material.uniforms.sunDirection?.value as THREE.Vector3).distanceTo(new THREE.Vector3(...manual.sunDirection)) < 1e-10, `${preset} retains the manual sun direction`);
  assert((material.uniforms.sunColor?.value as THREE.Color)?.equals(new THREE.Color(manual.sunColor)), `${preset} retains the manual sun color`);
  assert(material.uniforms.sunIntensity?.value === manual.sunIntensity, `${preset} retains the manual sun intensity`);
}
const liveTargets = () => [...renderer.targets].filter(([, count]) => count === 0).map(([target]) => target);
assert(liveTargets().length === 6, 'Three presets retain exactly one background/environment pair each');
const previous = resources.get('daylight', manual), previousTargets = liveTargets().filter(target => target.texture === previous.background || target.texture === previous.environment);
const beforeReuse = renderer.renders;
assert(resources.get('daylight', effectiveSunlight({ ...manualSettings })) === previous && renderer.renders === beforeReuse, 'Equivalent values reuse captures regardless of descriptor identity');
const changed = resources.get('daylight', effectiveSunlight({ ...manualSettings, azimuth: 230 }));
assert(changed !== previous && renderer.renders > beforeReuse, 'Changed manual direction regenerates that sky');
assert(previousTargets.length === 2 && previousTargets.every(target => renderer.targets.get(target) === 1), 'Replacing a sky disposes its old background and environment exactly once');
assert(liveTargets().length === 6, 'Replacing a descriptor does not grow the cache');
resources.get('daylight', evening);
assert(renderer.skies.get('Skybox daylight capture')!.uniforms.sunIntensity!.value === 0, 'Evening sky capture removes its sun glow');
for (let azimuth = 0; azimuth < 360; azimuth += 30) resources.get('daylight', effectiveSunlight({ ...manualSettings, azimuth }));
assert(liveTargets().length === 6, 'Many slider values retain only the most recent pair per preset');

const lastSettings = { ...manualSettings, azimuth: 330 }, last = resources.get('daylight', effectiveSunlight(lastSettings));
const beforeFailure = liveTargets();
renderer.failCapture = true;
let failure = false;
try { resources.get('daylight', defaults); } catch { failure = true; }
assert(failure, 'Capture failure is visible to the caller');
renderer.failCapture = false;
assert(beforeFailure.every(target => renderer.targets.get(target) === 0) && liveTargets().length === 6, 'Failed replacement retains the old usable skies and releases partial targets');
const beforeRecovery = renderer.renders;
assert(resources.get('daylight', effectiveSunlight(lastSettings)) === last && renderer.renders === beforeRecovery, 'The prior descriptor remains cached after replacement failure');
resources.get('daylight');
assert(renderer.skies.get('Skybox daylight capture')!.uniforms.sunIntensity!.value === defaults.sunIntensity, 'No-argument get preserves the original API with current Sun defaults');
const finalTargets = liveTargets();
resources.dispose();
resources.dispose();
assert(finalTargets.every(target => renderer.targets.get(target) === 1) && liveTargets().length === 0, 'Disposal frees all remaining pairs once after repeated replacements');
console.log(`Sky lighting checks passed (${assertions} assertions).`);
