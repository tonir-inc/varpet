/** Real WebGL checks for bilateral AO enlargement and restoration after motion. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { StudioRenderer } from './studio-renderer';

const output = document.querySelector<HTMLPreElement>('#result')!;
document.querySelector<HTMLButtonElement>('#run')!.onclick = () => {
  const messages: string[] = [];
  const check = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
    messages.push(`PASS ${message}`); output.textContent = messages.join('\n');
  };
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(256, 160); renderer.setPixelRatio(1);
  document.querySelector('#view')!.replaceChildren(renderer.domElement);
  let shaderFailures = 0;
  renderer.debug.onShaderError = () => { shaderFailures++; };
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#c6c6c6');
  const material = new THREE.MeshStandardMaterial({ color: '#b3aea5', roughness: 0.8 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 5), material); floor.position.y = -.05; scene.add(floor);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); box.position.y = .5; scene.add(box);
  scene.add(new THREE.HemisphereLight('#ffffff', '#888888', 2));
  const camera = new THREE.PerspectiveCamera(45, 256 / 160, .1, 20); camera.position.set(3, 2, 4); camera.lookAt(0, .3, 0);
  type GTAOWithNormalTarget = GTAOPass & { normalRenderTarget: THREE.WebGLRenderTarget };
  let ao: GTAOWithNormalTarget | undefined;
  const originalAdd = EffectComposer.prototype.addPass;
  EffectComposer.prototype.addPass = function(pass) {
    if (pass instanceof GTAOPass) ao = pass as GTAOWithNormalTarget;
    originalAdd.call(this, pass);
  };
  let studio: StudioRenderer;
  try { studio = new StudioRenderer(renderer, scene, camera); }
  finally { EffectComposer.prototype.addPass = originalAdd; }
  const resources: Array<{ dispose(): void }> = [studio, renderer, material, floor.geometry, box.geometry];
  try {
    if (!ao) throw new Error('Production AO pass was not constructed');
    const pass = ao;
    const setInteracting = (studio as StudioRenderer & { setInteracting?: (active: boolean) => void }).setInteracting;
    check(typeof setInteracting === 'function', 'production renderer exposes interaction quality');
    setInteracting!.call(studio, true); studio.render(camera);
    check(pass.gtaoRenderTarget.width === 128 && pass.normalRenderTarget.width === 256, 'moving frame has reduced AO and full-resolution geometry guides');
    setInteracting!.call(studio, false); studio.render(camera);
    check(pass.gtaoRenderTarget.width === 256 && shaderFailures === 0, 'settled frame restores full AO and both shader paths compile');
    const initialMemory = { ...renderer.info.memory };
    for (let i = 0; i < 8; i++) { setInteracting!.call(studio, i % 2 === 0); studio.render(camera); }
    check(renderer.info.memory.textures === initialMemory.textures && renderer.info.memory.geometries === initialMemory.geometries, 'repeated interaction changes keep GPU allocation counts bounded');

    // Synthetic guides isolate the upscale filter from GTAO's stochastic samples.
    // A small foreground surface must not inherit the background's dark AO.
    setInteracting!.call(studio, true);
    const makeTexture = (width: number, height: number, pixel: (x: number, y: number) => number[]) => {
      const data = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
      const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
      texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true; resources.push(texture); return texture;
    };
    const depthValue = (viewZ: number) => ((camera.near + viewZ) * camera.far) / ((camera.far - camera.near) * viewZ);
    const depth = makeTexture(8, 4, x => [x < 3 ? depthValue(-1) : x === 7 ? 1 : depthValue(-4), 0, 0, 1]);
    const normal = makeTexture(8, 4, () => [.5, .5, 1, 1]);
    const coarseAO = makeTexture(4, 2, x => [x === 0 ? 1 : .05, x === 0 ? 1 : .05, x === 0 ? 1 : .05, 1]);
    const uniforms = pass.blendMaterial.uniforms;
    uniforms.tDiffuse!.value = coarseAO; uniforms.tStudioDepth!.value = depth;
    uniforms.tStudioNormal!.value = normal; uniforms.studioAOSize!.value.set(4, 2);
    uniforms.intensity!.value = 1;
    const target = new THREE.WebGLRenderTarget(8, 4); resources.push(target);
    const quad = new FullScreenQuad(pass.blendMaterial); resources.push(quad);
    const pixels = new Uint8Array(8 * 4 * 4);
    const draw = () => {
      renderer.setRenderTarget(target); renderer.setClearColor('#ffffff', 1); renderer.clear();
      const autoClear = renderer.autoClear; renderer.autoClear = false;
      quad.render(renderer); renderer.autoClear = autoClear;
      renderer.readRenderTargetPixels(target, 0, 0, 8, 4, pixels);
    };
    draw();
    const redAt = (x: number) => pixels[(8 + x) * 4]!;
    check(redAt(2) > 245, 'bilateral upscale rejects dark samples across a foreground depth edge');
    check(redAt(4) < 30, 'bilateral upscale preserves occlusion on the matching background surface');
    check(redAt(7) > 245, 'clear-depth background remains free of dark silhouettes');
    const sameDepth = makeTexture(8, 4, () => [depthValue(-2), 0, 0, 1]);
    const splitNormal = makeTexture(8, 4, x => x < 3 ? [.5, .5, 1, 1] : [1, .5, .5, 1]);
    uniforms.tStudioDepth!.value = sameDepth; uniforms.tStudioNormal!.value = splitNormal;
    draw();
    check(redAt(2) > 245, 'bilateral upscale also rejects samples across a sharp surface-normal edge');
    check(shaderFailures === 0 && renderer.getContext().getError() === renderer.getContext().NO_ERROR, 'all pixel checks complete without shader or WebGL errors');
    output.textContent += `\nCOMPLETE ${messages.length} adaptive occlusion checks.`;
  } catch (error) { output.textContent += `\nFAIL ${error instanceof Error ? error.message : String(error)}`; }
  finally { for (const resource of resources) resource.dispose(); }
};
