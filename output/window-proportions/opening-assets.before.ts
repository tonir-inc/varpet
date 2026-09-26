import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EntityMetadata, Opening, Wall } from '../contracts';
import manifest from '../../../../catalog/openings/manifest.json';
import { disposeObject } from './assets';

// Vite owns these URLs in development and emits the GLBs in production builds.
const urls = import.meta.glob<string>('../../../../catalog/openings/*.glb', { eager: true, query: '?url', import: 'default' });
export const previewOpeningMechanism = (opening: Opening, metadata: EntityMetadata): NonNullable<EntityMetadata['mechanism']> =>
  metadata.mechanism ?? (opening.kind === 'door' ? 'hinged' : 'casement');

export interface OpeningAssetInstance {
  group: THREE.Group;
  leaves: THREE.Mesh[];
  setAngle(angle: number): void;
}

function productFor(opening: Opening, metadata: EntityMetadata): string | undefined {
  // A precise recorded frame/leaf takes precedence over a stock visual default.
  if (metadata.frameWidth !== undefined || metadata.leafThickness !== undefined || metadata.threshold) return;
  const mechanism = previewOpeningMechanism(opening, metadata);
  if (opening.kind === 'door') {
    if (mechanism === 'double') return 'door-steel-french.glb';
    if (mechanism !== 'hinged') return;
    return metadata.role === 'entrance' ? 'door-entrance-armored.glb' : 'door-flush-white.glb';
  }
  if (mechanism === 'fixed') return 'window-oak-box.glb';
  if (mechanism === 'sliding') return 'window-panoramic-slider.glb';
  if (mechanism === 'tilt' && opening.height < 1) return 'window-bath-hopper.glb';
  if (mechanism === 'tilt' || mechanism === 'casement' || mechanism === 'hinged' || mechanism === 'double') return 'window-pvc-tilt-turn.glb';
}

/** A viewport-owned cache. Instances own their materials, geometry and textures. */
export class OpeningAssetLoader {
  private readonly loader = new GLTFLoader();
  private readonly sources = new Map<string, Promise<THREE.Group>>();
  private disposed = false;

  async load(wall: Wall, opening: Opening, metadata: EntityMetadata): Promise<OpeningAssetInstance | undefined> {
    const file = productFor(opening, metadata);
    if (!file || this.disposed) return;
    const product = manifest.find(item => item.file === file)!;
    const url = urls[`../../../../catalog/openings/${file}`];
    if (!url) return;
    let source = this.sources.get(file);
    if (!source) {
      source = this.loader.loadAsync(url).then(gltf => gltf.scene);
      this.sources.set(file, source);
    }
    const original = await source;
    if (this.disposed) return;
    const model = original.clone(true);
    const textures = new Map<THREE.Texture, THREE.Texture>();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      const cloneMaterial = (source: THREE.Material) => {
        const material = source.clone();
        for (const [key, value] of Object.entries(material)) if (value instanceof THREE.Texture) {
          let copy = textures.get(value);
          if (!copy) { copy = value.clone(); copy.needsUpdate = true; textures.set(value, copy); }
          (material as unknown as Record<string, unknown>)[key] = copy;
        }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const glass = materials.some(material => material.transparent || /glass/i.test(material.name));
      if (glass) for (const material of materials) material.depthWrite = false;
      object.castShadow = !glass; object.receiveShadow = !glass;
    });
    // Keep the authored bottom-centre origin; handles/sills must not recenter a frame.
    const group = new THREE.Group(); group.name = file;
    group.position.x = opening.width / 2;
    const mirrored = metadata.hinge === 'right';
    const swing = metadata.swing ?? 1;
    const authoredSwing = file === 'door-entrance-armored.glb' ? -1 : 1;
    group.scale.set((mirrored ? -1 : 1) * opening.width / product.opening_m.width,
      opening.height / product.opening_m.height, wall.thickness / product.wall_m * swing / authoredSwing);
    group.add(model); model.updateMatrixWorld(true);
    const leaves: THREE.Mesh[] = [];
    const moving: { pivot: THREE.Group; base: THREE.Vector3; side: number }[] = [];
    for (const [prefix, motion] of Object.entries(product.moving)) {
      if (!motion) continue;
      const pivot = new THREE.Group(); pivot.name = `pivot-${prefix}`;
      pivot.position.fromArray(motion.point_m);
      // PVC metadata gives the vertical turning hinge. Tilting instead hinges
      // at the bottom sash rail, 57 mm above the aperture base.
      if (file === 'window-pvc-tilt-turn.glb' && metadata.mechanism === 'tilt') pivot.position.y = .057;
      model.add(pivot); model.updateMatrixWorld(true);
      const parts: THREE.Mesh[] = [];
      model.traverse(object => { if (object instanceof THREE.Mesh && object.name.startsWith(prefix)) parts.push(object); });
      for (const part of parts) { pivot.attach(part); leaves.push(part); }
      moving.push({ pivot, base: pivot.position.clone(), side: prefix.endsWith('-r') ? -1 : 1 });
    }
    const mechanism = previewOpeningMechanism(opening, metadata);
    return {
      group, leaves,
      setAngle(value) {
        const angle = THREE.MathUtils.clamp(value, 0, Math.PI / 2);
        for (const { pivot, base, side } of moving) {
          pivot.position.copy(base); pivot.rotation.set(0, 0, 0);
          if (mechanism === 'sliding') pivot.position.x -= 1.12 * angle / (Math.PI / 2);
          else if (mechanism === 'tilt') pivot.rotation.x = angle / (Math.PI / 2) * THREE.MathUtils.degToRad(file === 'window-bath-hopper.glb' ? 12 : 10);
          else if (mechanism !== 'fixed') pivot.rotation.y = -angle * side * authoredSwing;
        }
        group.updateMatrixWorld(true);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources.values()) void source.then(disposeObject, () => undefined);
    this.sources.clear();
  }
}
