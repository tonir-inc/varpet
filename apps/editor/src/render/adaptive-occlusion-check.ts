/** Render-target checks use real Three passes; no WebGL context is needed for allocation sizing. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SelectionOutline } from './selection-outline';
import { StudioRenderer } from './studio-renderer';

let assertions = 0;
function check(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(`Adaptive occlusion: ${message}`);
}

// Only renderer queries used by pass construction are faked. Targets, materials,
// quality configuration, resizing and disposal are the real production objects.
const renderer = {
  capabilities: { maxSamples: 4 },
  getPixelRatio: () => 2,
  getSize: (size: THREE.Vector2) => size.set(640, 360),
} as unknown as THREE.WebGLRenderer;
let composer: EffectComposer | undefined;
const originalAdd = EffectComposer.prototype.addPass;
EffectComposer.prototype.addPass = function(pass) {
  composer = this;
  originalAdd.call(this, pass);
};
let studio: StudioRenderer;
try { studio = new StudioRenderer(renderer, new THREE.Scene(), new THREE.PerspectiveCamera()); }
finally { EffectComposer.prototype.addPass = originalAdd; }
check(composer, 'production renderer creates its composer');
const pipeline = composer;
// @types/three r186 omits this existing GTAOPass render target.
type GTAOWithNormalTarget = GTAOPass & { normalRenderTarget: THREE.WebGLRenderTarget };
const ao = pipeline.passes.find((pass): pass is GTAOWithNormalTarget => pass instanceof GTAOPass);
const outline = pipeline.passes.find((pass): pass is SelectionOutline => pass instanceof SelectionOutline);
check(ao && outline, 'production pipeline includes AO and the selection outline');
const size = (target: THREE.WebGLRenderTarget, width: number, height: number) => target.width === width && target.height === height;
check(size(ao.gtaoRenderTarget, 1280, 720), 'settled rendering initially retains device-resolution AO');
check(size(pipeline.renderTarget1, 1280, 720), 'beauty initially retains device resolution');
const setInteracting = (studio as StudioRenderer & { setInteracting?: (active: boolean) => void }).setInteracting;
check(typeof setInteracting === 'function', 'StudioRenderer must expose setInteracting to adapt AO during gestures');

try {
  setInteracting.call(studio, true);
  check(size(ao.gtaoRenderTarget, 640, 360) && size(ao.pdRenderTarget, 640, 360), 'interaction reduces AO and denoising to one quarter of the pixels');
  check(size(ao.normalRenderTarget, 1280, 720), 'full-resolution normal/depth guides preserve fine geometry at AO upscale edges');
  check(size(pipeline.renderTarget1, 1280, 720) && size(pipeline.renderTarget2, 1280, 720), 'interaction does not reduce beauty or output resolution');
  check(size(outline.renderTargetMaskBuffer, 1280, 720) && size(outline.renderTargetEdgeBuffer1, 640, 360), 'interaction does not resize selection buffers');
  let reallocations = 0;
  const resized = () => { reallocations++; };
  for (const target of [ao.gtaoRenderTarget, ao.pdRenderTarget, ao.normalRenderTarget]) target.addEventListener('dispose', resized);
  setInteracting.call(studio, true);
  check(reallocations === 0, 'repeated moving frames do not reallocate render targets');
  studio.setSize(801, 451, 1.5);
  check(size(ao.gtaoRenderTarget, 601, 338), 'odd retina dimensions stay integral and cover the full viewport');
  check(size(ao.normalRenderTarget, 1201, 676), 'resizing during motion keeps the full-resolution edge guides');
  studio.setQuality('high');
  check(size(ao.gtaoRenderTarget, 601, 338), 'changing quality during a gesture keeps AO reduced');
  check(ao.gtaoMaterial.defines.SAMPLES === 32 && ao.pdSamples === 32, 'high-quality sample settings survive the adaptive resolution change');
  setInteracting.call(studio, false);
  check(size(ao.gtaoRenderTarget, 1201, 676) && size(ao.pdRenderTarget, 1201, 676), 'settling restores the latest device-resolution dimensions');
  check(ao.pdMaterial.uniforms.radius!.value === 8, 'settling restores the selected denoising quality');
  studio.setQuality('balanced');
  check(Number(ao.gtaoMaterial.defines.SAMPLES) === 16 && Number(ao.pdSamples) === 16, 'balanced quality can be restored after settling');
  studio.setSize(1, 1, 1); setInteracting.call(studio, true);
  check(size(ao.gtaoRenderTarget, 1, 1), 'minimized viewports never allocate a zero-sized AO buffer');
  let disposed = 0;
  for (const target of [ao.gtaoRenderTarget, ao.pdRenderTarget, ao.normalRenderTarget]) target.addEventListener('dispose', () => { disposed++; });
  studio.dispose(); studio.dispose(); setInteracting.call(studio, false);
  check(disposed === 3, 'disposal frees each AO target once and later interaction updates are harmless');
  console.log(`Adaptive occlusion checks passed (${assertions} assertions).`);
} finally { studio.dispose(); }
