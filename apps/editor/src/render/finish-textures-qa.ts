import * as THREE from 'three';
import { demoScene } from '../core/demo';
import { FINISH_PRESETS } from '../core/finish-presets';
import { appearanceForPreset, makeFinishMaterial, type FinishAppearance } from './finish-material';
import { acquireFinishTexture } from './finish-textures';

/** Real browser/GPU check: texture files, shader sampling and both reveal states. */
export async function checkFinishTextureRendering(container: HTMLElement): Promise<string> {
  let assertions = 0;
  const check = (value: unknown, label: string) => { if (!value) throw new Error(label); assertions++; };
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(384, 240, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight('#ffffff', Math.PI * 0.85));
  const light = new THREE.DirectionalLight('#ffffff', 0.5); light.position.set(-1, 2, 5); scene.add(light);
  const camera = new THREE.OrthographicCamera(-0.9, 0.9, 0.5625, -0.5625, 0.1, 10);
  camera.position.set(0.073, 0.047, 2);
  const geometry = new THREE.PlaneGeometry(3, 3);
  const axes = { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) };
  const projections: ReturnType<typeof makeFinishMaterial>[] = [];
  const snapshots = new Map<string, Uint8Array>();
  const samples = FINISH_PRESETS.filter(p => p.texture);
  function pixels(material: THREE.Material) {
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const data = new Uint8Array(384 * 240 * 4);
    gl.readPixels(0, 0, 384, 240, gl.RGBA, gl.UNSIGNED_BYTE, data);
    scene.remove(mesh);
    return data;
  }
  function difference(a: Uint8Array, b: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 6) count++;
    return count;
  }
  const make = (appearance: FinishAppearance) => {
    const projection = makeFinishMaterial(appearance, axes); projections.push(projection); return projection;
  };
  try {
    for (const preset of samples) {
      const handle = acquireFinishTexture(preset.texture!);
      try {
        check(await handle.ready, `${preset.name}: bundled image maps loaded successfully`);
        check(handle.color.colorSpace === THREE.SRGBColorSpace, `${preset.name}: albedo uses sRGB`);
        check(handle.roughness.colorSpace === THREE.NoColorSpace, `${preset.name}: roughness stays linear`);
        check(handle.color.wrapS === THREE.RepeatWrapping && handle.color.wrapT === THREE.RepeatWrapping, `${preset.name}: maps repeat across large floors`);
      } finally { handle.release(); }
      const appearance = appearanceForPreset(preset);
      const { texture: _texture, ...plain } = appearance;
      const textured = make(appearance); const procedural = make(plain);
      await textured.ready;
      const basePixels = pixels(procedural.material);
      const mappedPixels = pixels(textured.material);
      check(difference(basePixels, mappedPixels) > 384 * 240 * 0.15, `${preset.name}: loaded image grain visibly changes the rendered floor`);
      snapshots.set(preset.id, mappedPixels);
      const card = document.createElement('figure');
      const image = document.createElement('img'); image.src = renderer.domElement.toDataURL(); image.alt = `${preset.name}, real surface texture`;
      const caption = document.createElement('figcaption'); caption.textContent = `${preset.name} · ${preset.description}`;
      card.append(image, caption); container.append(card);
    }
    const oak = samples.find(p => p.id === 'oak')!;
    const porcelain = samples.find(p => p.id === 'porcelain')!;
    const reveal = makeFinishMaterial(appearanceForPreset(porcelain), axes, {
      previous: appearanceForPreset(oak), radius: 3,
      reveal: { entityId: 'room-living', surface: 'floor', point: [0, 0, 0], previousScene: demoScene, startedAt: 1000 },
    });
    projections.push(reveal); await reveal.ready;
    check(difference(pixels(reveal.material), snapshots.get('oak')!) < 10, 'Reveal starts with the previous wood texture');
    reveal.update(2000);
    check(difference(pixels(reveal.material), snapshots.get('porcelain')!) < 10, 'Reveal finishes with the new tile texture');
    const errors = renderer.getContext().getError();
    check(errors === renderer.getContext().NO_ERROR, 'No WebGL errors while drawing textures or reveals');
    return `PASS ${assertions} real-texture GPU assertions.`;
  } finally {
    projections.forEach(projection => projection.material.dispose());
    geometry.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
