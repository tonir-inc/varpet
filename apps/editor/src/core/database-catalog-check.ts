import { EditorStore } from './store';
import { demoScene, localCatalog } from './demo';
import { catalogCategories, catalogProduct, sceneCatalogIds, resolveSceneProducts } from '../adapters/database-catalog';
import { createInitialScene } from './initial-scene';
import { analyzeProject } from './renovation';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const store = new EditorStore({ ...demoScene, objects: [] }, []);
assert(typeof store.registerCatalogAssets === 'function', 'Database results must be registered with the authoritative store before placing them');
const asset = structuredClone(localCatalog[0]!);
store.registerCatalogAssets([asset]);
const result = store.execute({ id: 'db-add', label: 'Add database item', source: 'human', baseRevision: 0,
  operations: [{ type: 'add', object: { id: 'db-object', name: asset.name, assetId: asset.id, position: [-2, 0, 0], rotation: 0, scale: [1, 1, 1] } }] }, true);
assert(result.ok, result.errors.join(' '));
store.registerCatalogAssets([localCatalog[1]!]);
assert(store.revision === 1 && store.undo().ok && store.redo().ok, 'Browsing other results preserves scene revision and undo/redo');
let changedRejected = false;
try { store.registerCatalogAssets([{ ...asset, dimensions: [9, 9, 9] }]); } catch { changedRejected = true; }
assert(changedRejected && store.scene.objects.length === 1, 'Catalog updates cannot silently change placed or historical dimensions');
let invalidRejected = false;
try { store.registerCatalogAssets([{ ...asset, id: 'invalid', dimensions: [-1, 1, 1] }]); } catch { invalidRejected = true; }
assert(invalidRejected, 'Invalid database assets reject atomically');
asset.dimensions[0] = 10;
assert(store.undo().ok && store.redo().ok, 'Caller mutation cannot alter the stored catalog');
for (let page = 0; page < 60; page++) store.registerCatalogAssets(Array.from({length:20}, (_, i) => ({ ...localCatalog[1]!, id:`page-${page}-${i}` })));
assert(store.undo().ok && store.redo().ok, 'Browsing more than 1,000 products retains placed and historical references without exhausting the catalog');
console.log('Database catalog store checks passed');

const row = { id: 'abo:B01N2PLWIL', name: 'Database chair', kind: 'chair', size_m: [0.8, 0.9, 1], fit_size_m: [0.85, 0.95, 1.1],
  price: 80000, currency: 'AMD', price_source: 'mock', source: 'abo', license: 'CC BY 4.0', size_status: 'conflict',
  glb_url: 'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/L/B01N2PLWIL.glb' };
const product = catalogProduct(row);
for (const kind of ['desk', 'wardrobe', 'dresser'] as const) {
  const mapped = catalogProduct({ ...row, id: `abo:${kind}`, kind });
  assert(mapped?.asset.kind === kind, `Database ${kind} preserves its native kind`);
  const furnitureStore = new EditorStore({ ...demoScene, objects: [] }, []);
  furnitureStore.registerCatalogAssets([mapped.asset]);
  const placed = furnitureStore.execute({ id: `add-${kind}`, label: `Add ${kind}`, source: 'human', baseRevision: 0,
    operations: [{ type: 'add', object: { id: kind, name: kind, assetId: mapped.asset.id, position: [-2, 0, 0], rotation: 0, scale: [1, 1, 1] } }] }, true);
  assert(placed.ok, `${kind} registers and places: ${placed.errors.join(' ')}`);
  assert(furnitureStore.undo().ok && furnitureStore.redo().ok, `${kind} placement supports undo/redo`);
}
assert(product?.asset.source.type === 'gltf', 'Database entries use their actual GLB model');
assert(JSON.stringify(product.asset.dimensions) === '[0.85,1.1,0.95]', 'Conservative fit dimensions map X/Z/Y to editor X/Y/Z');
assert(product.priceSource === 'mock' && product.attribution.includes('CC BY 4.0'), 'Mock pricing and attribution survive mapping');
const sideways = catalogProduct({ ...row, wd_swapped: true });
assert(JSON.stringify(sideways?.asset.dimensions) === '[0.95,1.1,0.85]' && sideways?.asset.source.type === 'gltf' && sideways.asset.source.url.endsWith('#varpet-rotate-y=90'), 'Sideways meshes rotate together with their fit bounds');
for (const patch of [{ glb_url: undefined }, { glb_url: 'https://evil.example/model.glb' }, { currency: 'USD' }, { fit_size_m: [NaN, 1, 1] }, { kind: 'light' }, { price: -1 }]) {
  assert(catalogProduct({ ...row, ...patch }) === null, `Unusable catalog record excluded: ${JSON.stringify(patch)}`);
}
console.log('Database catalog mapping checks passed');
const initial = createInitialScene();
assert(initial.objects.length === 0 && initial.rooms.length === demoScene.rooms.length && initial.project?.currency === 'AMD', 'Startup preserves the shell without demo furniture and uses catalog currency');
assert(JSON.stringify(sceneCatalogIds({ objects: [{assetId:'one'}], project: { baseline: {objects:[{assetId:'two'}]}, options:[{snapshot:{objects:[{assetId:'three'},{assetId:'one'}]}}] } })) === '["one","two","three"]', 'Saved scene hydration covers deduplicated current, baseline and option references');
console.log('Database startup and saved-reference checks passed');
const priced = createInitialScene();
priced.objects = [{ id:'priced', name:product.asset.name, assetId:product.asset.id, position:[-2,0,0], rotation:0, scale:[1,1,1] }];
priced.project!.currency = 'USD';
assert(analyzeProject(priced, [product.asset]).quantities.find(q => q.id === 'priced')?.cost === 0, 'AMD catalog prices must never be totaled as USD');
priced.project!.currency = 'AMD';
assert(analyzeProject(priced, [product.asset]).quantities.find(q => q.id === 'priced')?.cost === 80000, 'AMD estimates retain database values');
const incoming = createInitialScene();
incoming.objects = [priced.objects[0]!, { ...priced.objects[0]!, id:'another-object', assetId:'abo:another', position:[-2,0,0] }];
const another = { ...product, asset: { ...product.asset, id:'abo:another' } };
const visible = { ...product, asset: { ...product.asset, id:'abo:visible-card' } };
const known = new Map([[product.asset.id, product]]);
const imported = await resolveSceneProducts(incoming, known, async ids => {
  assert(ids.length === 1 && ids[0] === another.asset.id, 'Import fetches only missing products');
  known.clear(); // A concurrent search can replace unused browser records during the request.
  return [another];
});
const importStore = new EditorStore(createInitialScene(), []);
importStore.registerCatalogAssets([product.asset, visible.asset]);
const importCatalog = importStore.registerCatalogAssets([visible.asset, ...imported.map(p => p.asset)]);
assert(importCatalog.some(a => a.id === visible.asset.id), 'Visible cards remain registered across imports');
assert(importStore.execute({id:'mixed-import', label:'Import cached and fetched furniture', source:'human', baseRevision:0, operations:[{type:'replace-scene',scene:incoming}]},true).ok, 'Mixed cached/new imports preserve all required products');
assert(importStore.execute({id:'visible-add', label:'Add previous search result', source:'human', baseRevision:1, operations:[{type:'add',object:{...priced.objects[0]!,id:'visible-object',assetId:visible.asset.id,position:[-3,0,2]}}]},true).ok, 'Prior search cards still add furniture after an import');
console.log('Database import, browsing, and currency checks passed');

const extra = catalogProduct({ ...row, id: 'extra:appliances:washer', source: 'extra', kind: 'washing_machine',
  glb_url: 'http://100.107.246.46:8765/models/extra-appliances-washer.glb' });
assert(extra?.asset.kind === 'washing_machine' && extra.asset.category === 'Appliances', 'Extra washer retains its native kind and category');
assert(extra.asset.source.type === 'gltf' && extra.asset.source.url === '/api/catalog/models/extra-appliances-washer.glb', 'Extra models use the same-origin relay');
assert(!extra.attribution.includes('Amazon'), 'Extra provenance does not claim ABO authorship');
const extraStore = new EditorStore({ ...demoScene, objects: [] }, []);
extraStore.registerCatalogAssets([extra.asset]);
assert(extraStore.execute({ id: 'extra-add', label: 'Add washer', source: 'human', baseRevision: 0,
  operations: [{ type: 'add', object: { id: 'washer', name: 'Washer', assetId: extra.asset.id, position: [-2, 0, 0], rotation: 0, scale: [1, 1, 1] } }] }, true).ok, 'Extra washer registers and places');
for (const patch of [{ id: 'unknown:washer' }, { kind: 'range_hood' },
  { glb_url: 'http://evil.example:8765/models/extra-washer.glb' },
  { glb_url: 'http://100.107.246.46:8765/models/extra-washer.glb?redirect=evil' }]) {
  assert(catalogProduct({ ...row, id: 'extra:appliances:washer', kind: 'washing_machine', ...patch }) === null, 'Unknown prefixes, mounted kinds and unapproved URLs stay rejected');
}

for (const [category, kinds] of Object.entries(catalogCategories)) for (const kind of kinds) {
  const mapped = catalogProduct({ ...row, id: `extra:test:${kind}`, kind,
    glb_url: `http://100.107.246.46:8765/models/extra-test-${kind}.glb` });
  assert(mapped?.asset.kind === kind && mapped.asset.category === category, `${kind} maps natively into ${category}`);
  new EditorStore({ ...demoScene, objects: [] }, [mapped.asset]);
}
const extraPriced = structuredClone(priced);
extraPriced.objects[0]!.assetId = extra.asset.id;
extraPriced.project!.currency = 'USD';
assert(analyzeProject(extraPriced, [extra.asset]).quantities.find(q => q.id === 'priced')?.cost === 0, 'Extra AMD prices are not totaled as USD');
