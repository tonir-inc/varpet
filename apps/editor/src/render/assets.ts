import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { CatalogAsset } from '../contracts';
import { furnitureMaterial } from './furniture-materials';

const materials = (asset: CatalogAsset, color: string) => {
  const timber = /\b(wood|oak|walnut|teak|beech|birch|pine)\b/i.test(asset.name)
    || ((asset.kind === 'table' || asset.kind === 'shelf') && !/\b(stone|marble|glass|metal|concrete)\b/i.test(asset.name));
  const tint = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 });
  const painted = asset.kind === 'cabinet' && tint.s < 0.12 && tint.l > 0.72;
  const upholstered = asset.kind === 'sofa' || asset.kind === 'bed' || asset.kind === 'rug' || (asset.kind === 'chair' && !timber);
  return {
    main: upholstered ? furnitureMaterial(color, 'textile')
      : timber && !painted ? furnitureMaterial(color, asset.kind === 'table' ? 'wood-horizontal' : 'wood-vertical')
        : new THREE.MeshStandardMaterial({ color, roughness: asset.kind === 'cabinet' ? 0.54 : 0.74 }),
    pale: ['sofa', 'bed', 'lamp'].includes(asset.kind) ? furnitureMaterial('#eee8df', 'textile')
      : new THREE.MeshStandardMaterial({ color: '#eee8df', roughness: 0.38 }),
    wood: furnitureMaterial('#ae7e53', 'wood-vertical'),
    dark: new THREE.MeshStandardMaterial({ color: '#39382f', roughness: 0.42, metalness: 0.22 }),
    metal: new THREE.MeshStandardMaterial({ color: '#c4a16d', roughness: 0.27, metalness: 0.7 }),
  };
};

/** Every asset uses a floor-centred origin and fits its catalog dimensions. */
export function normalizeAsset(group: THREE.Group, dimensions: CatalogAsset['dimensions']): THREE.Group {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (![...size.toArray(), ...center.toArray(), box.min.y].every(Number.isFinite) || size.x <= 0 || size.y <= 0 || size.z <= 0) throw new Error('Model has empty or invalid bounds.');
  const wrapper = new THREE.Group();
  group.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  wrapper.add(group);
  wrapper.scale.set(dimensions[0] / size.x, dimensions[1] / size.y, dimensions[2] / size.z);
  const result = new THREE.Group();
  result.add(wrapper);
  result.traverse(child => {
    if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  return result;
}

/** A neutral measured volume while a real model is loading or unavailable. */
export function makeAssetPlaceholder(asset: CatalogAsset): THREE.Group {
  const group = new THREE.Group();
  const [width, height, depth] = asset.dimensions;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const volume = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#9299a3', transparent: true, opacity: 0.12, depthWrite: false, roughness: 1,
  }));
  volume.position.y = height / 2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({
    color: '#9299a3', transparent: true, opacity: 0.6,
  }));
  edges.position.y = height / 2;
  group.add(volume, edges);
  return group;
}

export function makeFurniture(asset: CatalogAsset, color = asset.color): THREE.Group {
  if (asset.source.type === 'gltf') return makeAssetPlaceholder(asset);
  const group = new THREE.Group();
  const m = materials(asset, color);
  const [w, h, d] = asset.dimensions;
  const box = (x: number, y: number, z: number, px: number, py: number, pz: number, material = m.main, radius = 0.015) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(x, y, z, 2, Math.min(radius, x / 3, y / 3, z / 3)), material);
    mesh.position.set(px, py, pz); group.add(mesh); return mesh;
  };
  const cylinder = (r1: number, r2: number, height: number, x: number, y: number, z: number, material = m.wood, segments = 16) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, height, segments), material);
    mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  const legs = (top: number, spreadX = 0.4, spreadZ = 0.4, radius = 0.025) => {
    for (const x of [-1, 1]) for (const z of [-1, 1]) cylinder(radius * 0.8, radius, top, x * w * spreadX, top / 2, z * d * spreadZ);
  };
  switch (asset.kind) {
    case 'sofa': {
      legs(h * 0.2, 0.42, 0.34, 0.032);
      box(w * 0.95, h * 0.26, d * 0.86, 0, h * 0.28, 0, m.main, 0.065);
      box(w * 0.93, h * 0.56, d * 0.21, 0, h * 0.69, -d * 0.38, m.main, 0.075);
      for (const side of [-1, 1]) box(w * 0.105, h * 0.54, d * 0.95, side * w * 0.448, h * 0.48, 0, m.main, 0.065);
      for (const side of [-1, 1]) {
        box(w * 0.383, h * 0.15, d * 0.7, side * w * 0.196, h * 0.44, d * 0.08, m.main, 0.07);
        const cushion = box(w * 0.36, h * 0.4, d * 0.16, side * w * 0.194, h * 0.73, -d * 0.24, m.main, 0.06);
        cushion.rotation.x = -0.12;
      }
      const pillow = box(w * 0.17, h * 0.32, d * 0.17, -w * 0.31, h * 0.64, d * 0.03, m.pale, 0.065);
      pillow.rotation.z = 0.15; pillow.rotation.x = -0.25;
      break;
    }
    case 'bed': {
      legs(h * 0.18, 0.42, 0.4, 0.038);
      box(w, h * 0.23, d * 0.94, 0, h * 0.28, d * 0.03, m.wood, 0.025);
      box(w, h * 0.85, d * 0.065, 0, h * 0.575, -d * 0.467, m.main, 0.04);
      box(w * 0.96, h * 0.21, d * 0.89, 0, h * 0.475, d * 0.045, m.pale, 0.075);
      box(w * 0.965, h * 0.075, d * 0.63, 0, h * 0.594, d * 0.155, m.main, 0.04);
      box(w * 0.97, h * 0.045, d * 0.13, 0, h * 0.65, -d * 0.095, m.main, 0.025);
      for (const side of [-1, 1]) box(w * 0.4, h * 0.12, d * 0.17, side * w * 0.235, h * 0.62, -d * 0.285, m.pale, 0.065);
      break;
    }
    case 'table': {
      legs(h * 0.9, 0.39, 0.35, 0.035);
      box(w * 0.86, h * 0.11, d * 0.83, 0, h * 0.84, 0, m.wood, 0.012);
      box(w, h * 0.065, d, 0, h * 0.9675, 0, m.main, 0.025);
      break;
    }
    case 'chair': {
      legs(h * 0.51, 0.35, 0.35, 0.022);
      box(w * 0.94, h * 0.085, d * 0.91, 0, h * 0.52, 0, m.wood, 0.02);
      box(w * 0.87, h * 0.085, d * 0.84, 0, h * 0.583, d * 0.015, m.main, 0.03);
      for (const x of [-1, 1]) box(w * 0.055, h * 0.56, d * 0.055, x * w * 0.4, h * 0.68, -d * 0.38, m.wood);
      const back = box(w * 0.97, h * 0.31, d * 0.13, 0, h * 0.845, -d * 0.37, m.main, 0.04);
      back.rotation.x = -0.1;
      break;
    }
    case 'cabinet': {
      box(w * 0.92, h * 0.08, d * 0.88, 0, h * 0.04, 0, m.dark);
      box(w, h * 0.86, d, 0, h * 0.51, 0, m.main, 0.008);
      box(w * 1.015, h * 0.055, d * 1.025, 0, h * 0.9725, 0, m.pale, 0.015);
      const count = Math.max(2, Math.round(w / 0.55));
      for (let i = 0; i < count; i++) {
        const x = -w / 2 + (i + 0.5) * w / count;
        box(w / count - 0.014, h * 0.77, d * 0.025, x, h * 0.53, d * 0.507, m.main, 0.004);
        box(w / count * 0.35, 0.015, 0.028, x, h * 0.83, d * 0.534, m.metal, 0.005);
      }
      break;
    }
    case 'shelf': {
      for (const side of [-1, 1]) box(w * 0.045, h, d, side * w * 0.4775, h / 2, 0, m.main);
      box(w, h, 0.025, 0, h / 2, -d * 0.475, m.main, 0.005);
      const shelves = Math.max(3, Math.round(h / 0.4));
      const bookMaterials = ['#a86648', '#d5c8ae', '#698075', '#4f6265'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.94 }));
      for (let i = 0; i <= shelves; i++) {
        const levelY = (h - 0.03) * i / shelves + 0.015;
        box(w, 0.03, d, 0, levelY, 0, m.main, 0.004);
        if (i < shelves) for (let b = 0; b < 4; b++) {
          box(w * 0.07, h / shelves * (0.5 + (b % 2) * 0.13), d * 0.62,
            -w * 0.33 + b * w * 0.088, levelY + h / shelves * (0.25 + (b % 2) * 0.065) + 0.018,
            0, bookMaterials[(i + b) % bookMaterials.length]!, 0.003);
        }
      }
      break;
    }
    case 'lamp': {
      cylinder(w * 0.31, w * 0.37, h * 0.028, 0, h * 0.014, 0, m.dark, 32);
      cylinder(w * 0.025, w * 0.025, h * 0.76, 0, h * 0.4, 0, m.metal);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.33, w * 0.5, h * 0.25, 40, 1, true), m.pale);
      shade.material.emissive.set('#ffd299');
      shade.material.emissiveIntensity = 0.24;
      shade.material.side = THREE.DoubleSide; shade.position.y = h * 0.875; group.add(shade);
      const diffuser = cylinder(w * 0.48, w * 0.48, h * 0.012, 0, h * 0.75, 0, m.pale, 32);
      const glow = new THREE.MeshStandardMaterial({ color: '#ffdfad', emissive: '#ffce8b', emissiveIntensity: 1.1, roughness: 0.9 });
      diffuser.material = glow;
      break;
    }
    case 'plant': {
      cylinder(w * 0.3, w * 0.23, h * 0.32, 0, h * 0.16, 0, m.main, 32);
      cylinder(w * 0.28, w * 0.28, 0.015, 0, h * 0.315, 0, m.dark, 32);
      const green = new THREE.MeshStandardMaterial({ color: '#4c7148', roughness: 0.87 });
      const lightGreen = new THREE.MeshStandardMaterial({ color: '#78925d', roughness: 0.89 });
      for (let i = 0; i < 11; i++) {
        const angle = i * 2.399;
        const top = h * (0.6 + (i % 4) * 0.12);
        cylinder(0.008, 0.011, top - h * 0.25, Math.cos(angle) * w * 0.08, (top + h * 0.25) / 2, Math.sin(angle) * d * 0.08, green, 6);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), i % 3 ? green : lightGreen);
        leaf.scale.set(w * 0.17, h * 0.19, d * 0.055);
        leaf.position.set(Math.cos(angle) * w * 0.22, top, Math.sin(angle) * d * 0.22);
        leaf.rotation.set(0.4, -angle, 0.5 + (i % 2) * 0.3); group.add(leaf);
      }
      break;
    }
    case 'rug': {
      box(w, h, d, 0, h / 2, 0, m.main, Math.min(h / 3, 0.015));
      const trim = furnitureMaterial(new THREE.Color(color).lerp(new THREE.Color('#efeadf'), 0.3), 'textile');
      const lineHeight = h + 0.001;
      for (const x of [-1, 1]) box(0.018, 0.002, d * 0.91, x * w * 0.46, lineHeight, 0, trim, 0);
      for (const z of [-1, 1]) box(w * 0.92, 0.002, 0.018, 0, lineHeight, z * d * 0.455, trim, 0);
      for (let i = -7; i <= 7; i++) box(w * 0.9, 0.001, 0.004, 0, lineHeight, i * d / 18, trim, 0);
      break;
    }
  }
  // Unused palette members were never uploaded; dispose them now.
  const used = new Set<THREE.Material>();
  group.traverse(child => { if (child instanceof THREE.Mesh) for (const mat of Array.isArray(child.material) ? child.material : [child.material]) used.add(mat); });
  Object.values(m).forEach(mat => { if (!used.has(mat)) mat.dispose(); });
  return normalizeAsset(group, asset.dimensions);
}

export function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      if (!(object instanceof THREE.Sprite)) geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        mats.add(mat);
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  root.removeFromParent();
}

interface ModelSource {
  promise: Promise<THREE.Group>;
  group?: THREE.Group;
  users: number;
}

/** Owned, bounded source cache; returned instances own their render resources. */
export class AssetLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, ModelSource>();
  private disposed = false;
  constructor(private readonly maxCachedSources = 12) {}

  private trimCache(): void {
    for (const [url, source] of this.cache) {
      if (this.cache.size <= this.maxCachedSources) break;
      // A caller still cloning a source keeps it alive until its finally block.
      if (source.users || !source.group) continue;
      this.cache.delete(url);
      disposeObject(source.group);
    }
  }

  async load(asset: CatalogAsset): Promise<THREE.Group> {
    if (this.disposed) throw new Error('Asset loader disposed.');
    if (asset.source.type !== 'gltf') return makeFurniture(asset);
    // Catalog import orientation travels as local metadata, never an HTTP parameter.
    const [url, fragment = ''] = asset.source.url.split('#');
    const rotation = Number(new URLSearchParams(fragment).get('varpet-rotate-y') ?? 0);
    if (!url || !Number.isFinite(rotation)) throw new Error('Invalid model URL or orientation.');
    let source = this.cache.get(url);
    if (!source) {
      const promise = this.loader.loadAsync(url).then(gltf => {
        if (this.disposed) { disposeObject(gltf.scene); throw new Error('Asset loader disposed.'); }
        entry.group = gltf.scene;
        return gltf.scene;
      }, error => {
        if (this.cache.get(url) === entry) this.cache.delete(url);
        throw error;
      });
      const entry: ModelSource = { promise, users: 0 };
      source = entry;
    }
    // Refresh LRU order for both cached and in-flight requests.
    this.cache.delete(url);
    this.cache.set(url, source);
    source.users++;
    try {
      const original = await source.promise;
      if (this.disposed) throw new Error('Asset loader disposed.');
      const instance = cloneSkeleton(original) as THREE.Group;
      const textureCopies = new Map<THREE.Texture, THREE.Texture>();
      instance.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry = object.geometry.clone();
        const copyMaterial = (material: THREE.Material) => {
          const result = material.clone();
          for (const [key, value] of Object.entries(result)) if (value instanceof THREE.Texture) {
            let copy = textureCopies.get(value);
            if (!copy) { copy = value.clone(); copy.needsUpdate = true; textureCopies.set(value, copy); }
            (result as unknown as Record<string, unknown>)[key] = copy;
          }
          return result;
        };
        object.material = Array.isArray(object.material) ? object.material.map(copyMaterial) : copyMaterial(object.material);
      });
      const oriented = new THREE.Group();
      oriented.add(instance);
      oriented.rotation.y = rotation * THREE.MathUtils.DEG2RAD;
      try { return normalizeAsset(oriented, asset.dimensions); }
      catch (error) { disposeObject(oriented); throw error; }
    } finally {
      source.users--;
      this.trimCache();
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.forEach(source => { void source.promise.then(disposeObject, () => undefined); });
    this.cache.clear();
  }
}
