import * as THREE from 'three';
import { FINISH_PRESETS, type FinishPreset } from '../core/finish-presets';
import { appearanceForPreset, makeFinishMaterial, type FinishMaterialProjection } from './finish-material';

const previews = new Map<string, string>();
const previewWidth = 320;
const previewHeight = 200;
let pending: Promise<void> | undefined;
// Metres across each sample: whole planks, a few laid repeats, or fine aggregate.
const previewWidths: Record<FinishPreset['pattern'], number> = { solid: 1.8, tile: 1.8, wood: 2.4, terrazzo: 0.8, herringbone: 1.5, chevron: 1.7, parquet: 1.6 };

/**
 * Snapshot the same procedural materials used in the room. One temporary WebGL
 * context renders the fixed catalog, then only its small image snapshots remain.
 */
async function renderPreviews(): Promise<void> {
  let renderer: THREE.WebGLRenderer | undefined;
  let geometry: THREE.PlaneGeometry | undefined;
  const materials: THREE.MeshStandardMaterial[] = [];
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(previewWidth, previewHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    // Neutral illumination keeps the swatches close to their stored colors.
    scene.add(new THREE.AmbientLight('#ffffff', Math.PI * 0.85));
    const key = new THREE.DirectionalLight('#ffffff', 0.5);
    key.position.set(-1, 2, 5);
    scene.add(key);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    // Offset the sample so tile joints don't coincide with every outer edge.
    camera.position.set(0.073, 0.047, 2);
    geometry = new THREE.PlaneGeometry(1, 1);
    const axes = { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) };
    const projections = new Map<string, FinishMaterialProjection>();

    for (const preset of FINISH_PRESETS) {
      if (preset.pattern === 'solid') continue;
      const projection = makeFinishMaterial(appearanceForPreset(preset), axes);
      materials.push(projection.material);
      projections.set(preset.id, projection);
    }
    // Snapshot only after image maps settle, so a cold cache never freezes an
    // untextured thumbnail. Failed maps retain the procedural material.
    await Promise.all([...projections.values()].map(projection => projection.ready));

    for (const preset of FINISH_PRESETS) {
      if (preset.pattern === 'solid') continue;
      const { material } = projections.get(preset.id)!;
      const mesh = new THREE.Mesh(geometry, material);
      try {
        // Metre-based framing reveals plank lengths and the smaller aggregate,
        // while the matching camera/image aspect ratio preserves square tiles.
        const width = previewWidths[preset.pattern];
        const height = width * previewHeight / previewWidth;
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
        mesh.position.set(camera.position.x, camera.position.y, 0);
        mesh.scale.set(width * 1.01, height * 1.01, 1);
        scene.add(mesh);
        renderer.render(scene, camera);
        if (renderer.getContext().isContextLost()) break;
        previews.set(preset.id, renderer.domElement.toDataURL('image/png'));
      } finally {
        scene.remove(mesh);
      }
    }
  } catch {
    // Missing WebGL or an unavailable snapshot leaves the ordinary color swatch.
  } finally {
    materials.forEach(material => material.dispose());
    geometry?.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}

/** Solid paint stays a color swatch; unknown presets never grow the image cache. */
export function getFinishPreview(preset: FinishPreset): string | undefined {
  if (preset.pattern === 'solid' || !FINISH_PRESETS.some(item => item.id === preset.id)) return undefined;
  return previews.get(preset.id);
}

/** Shared by both pickers; opening Properties repeatedly never reloads maps. */
export function prepareFinishPreviews(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  return pending ??= renderPreviews();
}
