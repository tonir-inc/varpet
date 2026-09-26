import * as THREE from 'three';
import { isSkyboxPreset, SKYBOX_PRESETS, SkyboxResources } from './skybox';
import { StudioStage } from './studio-stage';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(`Skybox: ${message}`); }

// Exercise actual CubeCamera/PMREM lifecycle with a renderer boundary double;
// the browser acceptance check separately exercises WebGL and shader output.
class RecordingRenderer {
  readonly coordinateSystem = THREE.WebGLCoordinateSystem;
  readonly xr = { enabled: true };
  readonly viewport = new THREE.Vector4(11, 17, 500, 400);
  readonly scissor = new THREE.Vector4(13, 19, 300, 200);
  readonly targets = new Map<THREE.WebGLRenderTarget, number>();
  readonly geometries = new Map<THREE.BufferGeometry, number>();
  readonly materials = new Map<THREE.Material, number>();
  readonly skies: THREE.ShaderMaterial[] = [];
  readonly cubeFaces: number[] = [];
  target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(32, 32);
  face = 2;
  mip = 1;
  scissorTest = true;
  autoClear = false;
  toneMapping = THREE.ACESFilmicToneMapping;
  toneMappingExposure = 0.78;
  outputColorSpace = THREE.SRGBColorSpace;
  failCapture = false;
  renders = 0;
  getRenderTarget() { return this.target; }
  getActiveCubeFace() { return this.face; }
  getActiveMipmapLevel() { return this.mip; }
  getViewport(value: THREE.Vector4) { return value.copy(this.viewport); }
  setViewport(value: THREE.Vector4) { this.viewport.copy(value); }
  getScissor(value: THREE.Vector4) { return value.copy(this.scissor); }
  setScissor(value: THREE.Vector4) { this.scissor.copy(value); }
  getScissorTest() { return this.scissorTest; }
  setScissorTest(value: boolean) { this.scissorTest = value; }
  setRenderTarget(target: THREE.WebGLRenderTarget | null, face = 0, mip = 0) {
    this.target = target; this.face = face; this.mip = mip;
    if (target && !this.targets.has(target)) {
      this.targets.set(target, 0);
      target.addEventListener('dispose', () => this.targets.set(target, this.targets.get(target)! + 1));
    }
  }
  render(object: THREE.Object3D) {
    this.renders++;
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!this.geometries.has(child.geometry)) {
        this.geometries.set(child.geometry, 0);
        child.geometry.addEventListener('dispose', () => this.geometries.set(child.geometry, this.geometries.get(child.geometry)! + 1));
      }
      const material = child.material as THREE.Material;
      if (!this.materials.has(material)) {
        this.materials.set(material, 0);
        material.addEventListener('dispose', () => this.materials.set(material, this.materials.get(material)! + 1));
      }
      if (this.target instanceof THREE.WebGLCubeRenderTarget) {
        this.cubeFaces.push(this.face);
        if (!this.skies.includes(material as THREE.ShaderMaterial)) this.skies.push(material as THREE.ShaderMaterial);
        assert(this.autoClear && !this.scissorTest, 'cube capture clears complete faces independently of caller state');
        assert(!material.toneMapped, 'capture keeps linear radiance for one display tone mapping');
      }
    });
    if (this.failCapture) throw new Error('Simulated capture failure');
  }
}

assert(SKYBOX_PRESETS.map(value => value.id).join(',') === 'studio,daylight,sunset,overcast', 'stable preset IDs include original studio');
assert(SKYBOX_PRESETS.map(value => value.label).join(',') === 'Studio,Clear sky,Sunset,Overcast', 'preset labels are readable');
for (const value of SKYBOX_PRESETS) assert(isSkyboxPreset(value.id), `recognizes ${value.id}`);
for (const value of [null, undefined, '', 'unknown', 0, {}, ['daylight']]) assert(!isSkyboxPreset(value), 'rejects invalid persisted preset');

const renderer = new RecordingRenderer();
const originalTarget = renderer.target;
const originalViewport = renderer.viewport.clone(), originalScissor = renderer.scissor.clone();
const resources = new SkyboxResources(renderer as unknown as THREE.WebGLRenderer);
assert(renderer.renders === 0, 'constructor allocates no GPU sky captures');
const daylight = resources.get('daylight');
assert(daylight.background instanceof THREE.CubeTexture && daylight.environment instanceof THREE.Texture, 'provides background cube and filtered lighting');
const daylightTarget = [...renderer.targets.keys()].find(target => target.texture === daylight.background);
assert(daylightTarget?.width === 256 && daylight.background.type === THREE.HalfFloatType, 'capture bounds sky resolution and retains linear radiance');
assert(daylight.background.colorSpace === THREE.LinearSRGBColorSpace, 'background stores linear color for correct final display conversion');
assert(daylight.environment.mapping === THREE.CubeUVReflectionMapping, 'lighting is prefiltered for physical material roughness');
assert(renderer.cubeFaces.join(',') === '0,1,2,3,4,5', 'captures all six faces once');
const firstRenders = renderer.renders;
assert(resources.get('daylight') === daylight && renderer.renders === firstRenders, 'repeat selection reuses GPU textures without rendering');
const sunset = resources.get('sunset'), overcast = resources.get('overcast');
assert(sunset.background !== daylight.background && overcast.environment !== sunset.environment, 'presets have independent cached lighting and backgrounds');
assert(renderer.skies.length === 3 && renderer.cubeFaces.length === 18, 'cache has exactly one capture per outdoor preset');
assert(renderer.target === originalTarget && renderer.face === 2 && renderer.mip === 1, 'restores render target, cube face and mip level');
assert(renderer.viewport.equals(originalViewport) && renderer.scissor.equals(originalScissor) && renderer.scissorTest, 'preserves caller viewport and scissor state');
assert(renderer.xr.enabled && !renderer.autoClear && renderer.toneMapping === THREE.ACESFilmicToneMapping && renderer.toneMappingExposure === 0.78 && renderer.outputColorSpace === THREE.SRGBColorSpace, 'preserves renderer display and XR state');
assert([...renderer.geometries.values()].every(count => count > 0) && [...renderer.materials.values()].every(count => count > 0), 'releases capture geometry and temporary PMREM materials immediately');
const liveTargets = [...renderer.targets].filter(([target, count]) => target !== originalTarget && count === 0);
assert(liveTargets.length === 6, 'only background and environment targets survive per cached preset');
resources.dispose(); resources.dispose();
assert(liveTargets.every(([target]) => renderer.targets.get(target) === 1), 'dispose frees each cached render target exactly once');
assert(renderer.targets.get(originalTarget!) === 0, 'never disposes caller target');
let disposedRejected = false;
try { resources.get('daylight'); } catch { disposedRejected = true; }
assert(disposedRejected, 'disposed resources cannot create or return stale textures');

const failingRenderer = new RecordingRenderer();
const failureTarget = failingRenderer.target;
failingRenderer.failCapture = true;
const failingResources = new SkyboxResources(failingRenderer as unknown as THREE.WebGLRenderer);
let failureObserved = false;
try { failingResources.get('sunset'); } catch { failureObserved = true; }
assert(failureObserved, 'capture failure is visible to the caller');
assert(failingRenderer.target === failureTarget && failingRenderer.face === 2 && failingRenderer.mip === 1 && failingRenderer.xr.enabled && !failingRenderer.autoClear && failingRenderer.scissorTest, 'failed capture restores renderer state');
assert([...failingRenderer.targets].every(([target, count]) => target === failureTarget || count > 0), 'failed capture releases partial GPU targets');
assert([...failingRenderer.geometries.values(), ...failingRenderer.materials.values()].every(count => count > 0), 'failed capture releases dome resources');
failingRenderer.failCapture = false;
assert(failingResources.get('sunset').background instanceof THREE.CubeTexture, 'failed preset remains retryable');
failingResources.dispose();

const stage = new StudioStage();
stage.update(new THREE.Box3(new THREE.Vector3(20, 0, 30), new THREE.Vector3(29, 3, 39)));
const stageBounds = stage.bounds.clone();
const camera = new THREE.PerspectiveCamera();
camera.position.set(30, 14, 44);
const scenery = ['Charcoal studio floor', 'Softly lit gallery curtains', 'Subtle brass floor inlay', 'Soft pedestal contact shadow'].map(name => stage.group.getObjectByName(name)!);
assert(scenery.every(Boolean), 'studio scenery is identifiable for visibility controls');
stage.setSceneryVisible(false);
for (const top of [false, true, false]) {
  stage.updateView(camera, top);
  assert(scenery.every(object => !object.visible), 'sky selection keeps scenery hidden during camera changes');
  assert(stage.group.visible && stage.bounds.equals(stageBounds) && stage.group.children.some(object => !scenery.includes(object) && object.visible), 'sky retains the pedestal and its framing bounds');
}
stage.updateView(camera, true);
stage.setSceneryVisible(true);
assert(scenery[0]!.visible && scenery[3]!.visible && !scenery[1]!.visible && !scenery[2]!.visible, 'returning to studio respects top-view scenery rules');
stage.updateView(camera, false);
assert(scenery.every(object => object.visible), 'returning to 3D restores studio scenery');
stage.dispose();

console.log(`Skybox checks passed (${assertions} assertions).`);
