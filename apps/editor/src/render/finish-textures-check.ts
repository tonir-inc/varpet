import * as THREE from 'three';
import { makeFinishMaterial, type FinishAppearance } from './finish-material';
import { subscribeFinishTextures } from './finish-textures';
import type { SceneDocument } from '../contracts';

let assertions = 0;
function assert(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(`Finish textures: ${message}`);
}
const axes = { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) };
const oak: FinishAppearance & { texture: 'oak' } = {
  color: '#b9956b', accent: '#887050', pattern: 2, size: [1.2, 0.18], roughness: 0.72, texture: 'oak',
};
const inspect = (material: THREE.MeshStandardMaterial) => {
  const shader = { uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>',
  };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  return { shader, value: <T>(name: string) => shader.uniforms[name]?.value as T };
};

// Node callers must still get a settled projection and usable procedural fallback.
const server = makeFinishMaterial(oak, axes);
assert('ready' in server && server.ready instanceof Promise, 'every projection exposes texture readiness');
await server.ready;
const serverShader = inspect(server.material);
assert(serverShader.value<number>('uFinishTextureEnabled') === 0, 'missing browser image APIs keep the procedural finish');
assert(serverShader.value<THREE.Texture>('uFinishColorMap')?.isTexture, 'disabled samplers still bind a valid fallback');
server.material.dispose();

// Image events are controlled here because Node has no DOM or image decoder.
class ControlledImage {
  static pending: ControlledImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  width = 1024;
  height = 1024;
  private source = '';
  set src(value: string) { this.source = value; ControlledImage.pending.push(this); }
  get src(): string { return this.source; }
}
Object.defineProperty(globalThis, 'Image', { configurable: true, value: ControlledImage });
const previous = { ...oak, texture: 'walnut' as const };
const transition = {
  previous, radius: 3,
  reveal: { entityId: 'room', surface: 'floor' as const, point: [0, 0, 0] as [number, number, number],
    previousScene: {} as SceneDocument, startedAt: 0 },
};
const first = makeFinishMaterial(oak, axes, transition);
const second = makeFinishMaterial(oak, axes);
const firstShader = inspect(first.material);
const secondShader = inspect(second.material);
let notifications = 0;
const unsubscribe = subscribeFinishTextures(() => {
  notifications++;
  assert(firstShader.value<number>('uFinishTextureEnabled') === 1
    && firstShader.value<number>('uFinishPreviousTextureEnabled') === 1,
  'render invalidation happens after every loaded material has bound its samplers');
});
assert(ControlledImage.pending.length === 4, 'shared finishes decode each color and roughness image once');
assert(firstShader.value<number>('uFinishTextureEnabled') === 0, 'current sampler stays disabled before both maps load');
assert(firstShader.value<number>('uFinishPreviousTextureEnabled') === 0, 'previous sampler also stays disabled before load');
for (const image of ControlledImage.pending.splice(0)) image.onload?.();
await Promise.all([first.ready, second.ready]);
assert(notifications === 1, 'concurrent finishes coalesce their render invalidation');
unsubscribe();
assert(firstShader.value<number>('uFinishTextureEnabled') === 1, 'current finish activates after map loading');
assert(firstShader.value<number>('uFinishPreviousTextureEnabled') === 1, 'reveal previous finish activates independently');
const color = firstShader.value<THREE.Texture>('uFinishColorMap');
const roughness = firstShader.value<THREE.Texture>('uFinishRoughnessMap');
const oldColor = firstShader.value<THREE.Texture>('uFinishPreviousColorMap');
assert(color === secondShader.value<THREE.Texture>('uFinishColorMap'), 'materials share live GPU textures');
assert(color !== oldColor, 'reveal retains the old material texture');
assert(color.colorSpace === THREE.SRGBColorSpace && roughness.colorSpace === THREE.NoColorSpace, 'color and roughness use their correct color spaces');
assert(color.wrapS === THREE.RepeatWrapping && color.wrapT === THREE.RepeatWrapping, 'texture is seamless on both surface axes');
const repeat = firstShader.value<THREE.Vector2>('uFinishTextureRepeat');
assert(repeat.x === 1.83 && repeat.y === 1.83, 'wood grain keeps its documented physical repeat');
assert(first.update(250) && !first.update(1000), 'texture readiness does not change reveal timing');
assert(firstShader.shader.fragmentShader.includes('diffuseColor.rgb *= finishTint'), 'comparison tint remains applied after texture shading');
let currentDisposals = 0, roughnessDisposals = 0, previousDisposals = 0;
color.addEventListener('dispose', () => { currentDisposals++; });
roughness.addEventListener('dispose', () => { roughnessDisposals++; });
oldColor.addEventListener('dispose', () => { previousDisposals++; });
first.material.dispose();
assert(currentDisposals === 0 && previousDisposals === 1, 'disposing a reveal frees only textures without another owner');
second.material.dispose(); second.material.dispose();
assert(Number(currentDisposals) === 1 && roughnessDisposals === 1, 'last release disposes both GPU maps exactly once');
const cached = makeFinishMaterial(oak, axes);
await cached.ready;
assert(Number(ControlledImage.pending.length) === 0, 'recreated projections reuse bounded decoded images');
assert(inspect(cached.material).value<THREE.Texture>('uFinishColorMap') !== color, 'disposed GPU textures are never reused');
cached.material.dispose();

const abandoned = makeFinishMaterial({ ...oak, texture: 'travertine' }, axes);
const abandonedShader = inspect(abandoned.material);
abandoned.material.dispose();
for (const image of ControlledImage.pending.splice(0)) image.onload?.();
await abandoned.ready;
assert(abandonedShader.value<number>('uFinishTextureEnabled') === 0, 'late loads never reactivate a disposed projection');
const failed = makeFinishMaterial({ ...oak, texture: 'marble' }, axes);
const failedShader = inspect(failed.material);
for (const image of ControlledImage.pending.splice(0)) image.onerror?.();
await failed.ready;
assert(failedShader.value<number>('uFinishTextureEnabled') === 0, 'failed downloads settle with procedural fallback');
failed.material.dispose();
assert(notifications === 1, 'disposing a subscriber stops later ready notifications');
console.log(`Finish texture checks passed (${assertions} assertions).`);
