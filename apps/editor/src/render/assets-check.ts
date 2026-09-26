/** Model ownership, imported axes and neutral placeholders without WebGL/network. */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { CatalogAsset } from '../contracts';
import { AssetLoader, disposeObject, lightModelUrl, makeAssetPlaceholder, makeFurniture } from './assets';

let checks = 0;
function assert(condition: unknown, message: string): void {
  checks++;
  if (!condition) throw new Error(message);
}
function near(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-7, `${message}: expected ${expected}, got ${actual}`);
}
const asset: CatalogAsset = { id: 'database-chair', name: 'Database chair', category: 'Chairs', kind: 'chair', dimensions: [4, 3, 2], color: '#f0a010', price: 10, source: { type: 'gltf', url: 'https://models.example/chair.glb#varpet-rotate-y=90' } };
for (const kind of ['desk', 'wardrobe', 'dresser'] as const) {
  const dimensions: CatalogAsset['dimensions'] = kind === 'desk' ? [1.2, 0.75, 0.6]
    : kind === 'wardrobe' ? [1.2, 2, 0.6] : [1, 0.9, 0.45];
  const furniture = makeFurniture({ ...asset, kind, dimensions, source: { type: 'procedural' } });
  const bounds = new THREE.Box3().setFromObject(furniture);
  near(bounds.min.y, 0, `${kind} sits on the floor`);
  near(bounds.getCenter(new THREE.Vector3()).x, 0, `${kind} is centred across its width`);
  near(bounds.getCenter(new THREE.Vector3()).z, 0, `${kind} is centred across its depth`);
  bounds.getSize(new THREE.Vector3()).toArray().forEach((value, index) => near(value, dimensions[index]!, `${kind} preserves catalog dimension ${index}`));
  let meshes = 0;
  furniture.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    meshes++;
    assert(child.castShadow && child.receiveShadow, `${kind} participates in scene lighting`);
  });
  assert(meshes > 1, `${kind} has recognizable parts rather than a single bounding box`);
  if (kind === 'desk') {
    const knees = new THREE.Vector3(0, dimensions[1] * 0.5, dimensions[2] * 0.25);
    furniture.traverse(child => {
      if (child instanceof THREE.Mesh) assert(!new THREE.Box3().setFromObject(child).containsPoint(knees), 'Desk leaves open knee space beneath the front of its worktop');
    });
  }
  disposeObject(furniture);
}
for (const placeholder of [makeAssetPlaceholder(asset), makeFurniture(asset)]) {
  const bounds = new THREE.Box3().setFromObject(placeholder);
  near(bounds.min.y, 0, 'Placeholder sits on the floor');
  near(bounds.getSize(new THREE.Vector3()).x, 4, 'Placeholder preserves width');
  near(bounds.getSize(new THREE.Vector3()).z, 2, 'Placeholder preserves depth');
  assert(placeholder.children.length <= 2, 'GLTF loading never fabricates procedural furniture');
  disposeObject(placeholder);
}

const originalLoad = GLTFLoader.prototype.loadAsync;
const requests: string[] = [];
const originals: THREE.Group[] = [];
let disposals = 0;
let rejectNext = false;
GLTFLoader.prototype.loadAsync = async function(url: string): Promise<GLTF> {
  requests.push(url);
  if (rejectNext) { rejectNext = false; throw new Error('Network failure'); }
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  geometry.addEventListener('dispose', () => { disposals++; });
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.position.set(1, 1.5, 2);
  mesh.name = 'source-mesh';
  scene.add(mesh);
  originals.push(scene);
  return { scene } as GLTF;
};
try {
  const loader = new AssetLoader(1);
  const first = await loader.load(asset);
  assert(requests[0] === 'https://models.example/chair.glb', 'Orientation metadata is stripped before downloading');
  const mesh = first.getObjectByName('source-mesh')!;
  const meshBounds = new THREE.Box3().setFromObject(first);
  const size = meshBounds.getSize(new THREE.Vector3());
  near(size.x, 4, 'Rotated import has database width');
  near(size.y, 3, 'Rotated import has database height');
  near(size.z, 2, 'Rotated import has database depth');
  near(meshBounds.min.y, 0, 'Imported model sits on the floor');
  const orientation = mesh.getWorldQuaternion(new THREE.Quaternion());
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
  near(direction.x, 1, 'Width/depth swap rotates the source before normalization');
  const second = await loader.load(asset);
  assert(requests.length === 1, 'Repeated instances reuse a model source');
  const firstMesh = mesh as THREE.Mesh;
  const secondMesh = second.getObjectByName('source-mesh') as THREE.Mesh;
  assert(firstMesh.geometry !== secondMesh.geometry && firstMesh.material !== secondMesh.material, 'Instances own their render resources');
  const third = await loader.load({ ...asset, source: { type: 'gltf', url: 'https://models.example/table.glb' } });
  assert(disposals === 1, 'An unused source is disposed when the cache limit is reached');
  assert((originals[0]!.children[0] as THREE.Mesh).rotation.y === 0, 'Orientation never mutates cached source geometry');
  await loader.load(asset).then(disposeObject);
  assert(requests.length === 3, 'An evicted source is downloaded again');
  rejectNext = true;
  const failed = { ...asset, source: { type: 'gltf' as const, url: 'https://models.example/retry.glb' } };
  await loader.load(failed).then(() => { throw new Error('Expected failure'); }, () => {});
  await loader.load(failed).then(disposeObject);
  assert(requests.filter(url => url.endsWith('retry.glb')).length === 2, 'A failed request does not poison the source cache');
  [first, second, third].forEach(disposeObject);
  loader.dispose();
  await loader.load(asset).then(() => { throw new Error('Disposed loader accepted a new load'); }, () => {});
  assert(requests.length === 5, 'Disposal prevents subsequent network requests');

  let finish!: (value: GLTF) => void;
  GLTFLoader.prototype.loadAsync = () => new Promise<GLTF>(resolve => { finish = resolve; });
  const interruptedLoader = new AssetLoader();
  const interrupted = interruptedLoader.load(asset);
  interruptedLoader.dispose();
  const lateScene = new THREE.Group();
  const lateGeometry = new THREE.BoxGeometry(1, 1, 1);
  let lateDisposals = 0;
  lateGeometry.addEventListener('dispose', () => { lateDisposals++; });
  lateScene.add(new THREE.Mesh(lateGeometry, new THREE.MeshStandardMaterial()));
  finish({ scene: lateScene } as GLTF);
  await interrupted.then(() => { throw new Error('Disposed loader returned a stale model'); }, () => {});
  assert(lateDisposals === 1, 'A source arriving after disposal releases its resources exactly once');

  const abo = 'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/D/B0718WYQ8D.glb';
  assert(lightModelUrl(abo) === '/api/catalog/models/B0718WYQ8D.glb', 'An ABO original maps to its relayed light copy');
  assert(lightModelUrl('https://models.example/chair.glb') === undefined && lightModelUrl(`${abo}?x=1`) === undefined,
    'Other model URLs load as given');
  const lightRequests: string[] = [];
  let lightMissing = true;
  GLTFLoader.prototype.loadAsync = async function(url: string): Promise<GLTF> {
    lightRequests.push(url);
    if (lightMissing && url.startsWith('/api/')) throw new Error('404');
    return { scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())) } as GLTF;
  };
  const aboAsset = { ...asset, source: { type: 'gltf' as const, url: `${abo}#varpet-rotate-y=90` } };
  const fallbackLoader = new AssetLoader();
  await fallbackLoader.load(aboAsset).then(disposeObject);
  assert(lightRequests.join() === `/api/catalog/models/B0718WYQ8D.glb,${abo}`, 'A missing light copy falls back to the original');
  await fallbackLoader.load(aboAsset).then(disposeObject);
  assert(lightRequests.length === 2, 'The fallback source is cached under the product URL');
  lightMissing = false;
  const lightLoader = new AssetLoader();
  await lightLoader.load(aboAsset).then(disposeObject);
  assert(lightRequests.length === 3 && lightRequests[2] === '/api/catalog/models/B0718WYQ8D.glb', 'An available light copy replaces the original download');
  fallbackLoader.dispose(); lightLoader.dispose();
} finally {
  GLTFLoader.prototype.loadAsync = originalLoad;
}
console.log(`assets: ${checks} checks passed`);
