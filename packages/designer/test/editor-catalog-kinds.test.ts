import { expect, test } from 'vitest';
import type { AssetKind, CatalogAsset } from '../../../apps/editor/src/contracts.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { DesignerSession, type Proposal } from '../src/session.js';

const compatible: [string, AssetKind][] = [
  ['desk', 'table'], ['dresser', 'cabinet'], ['wardrobe', 'cabinet'], ['nightstand', 'cabinet'],
  ['stool', 'chair'], ['ottoman', 'chair'], ['bench', 'chair'],
];
const assets: CatalogAsset[] = compatible.map(([kind, editorKind]) => ({
  id: `shop-${kind}`, name: `Catalog ${kind}`, category: `${kind}s`, kind: editorKind,
  dimensions: [.65, .75, .45], color: '#888888', price: 45000, source: { type: 'procedural' },
}));
const catalog = [...localCatalog, ...assets];
const options = { catalog, catalogCurrency: 'AMD' as const };
function accepted(kind: string, sku = `shop-${kind}`): Proposal {
  const session = new DesignerSession(editorToDesigner(demoScene, options));
  session.setIntent({ room_id: 'room-living', add: [{ kinds: [kind], count: 1 }] });
  const result = session.propose([{ type: 'add', item: { id: `purchased-${kind}`, room_id: 'room-living', kind, name: `Purchased ${kind}`,
    pos: [-2.1, .3], rot: 0, size: [.65, .45, .75], keep: false, sku, price: 45000 } }], `Add the requested catalog ${kind} in the living room.`);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.proposal;
}

test.each(compatible)('catalog %s applies as editor %s on the complete Avani demo', (kind, editorKind) => {
  const original = structuredClone(demoScene), proposal = accepted(kind);
  const translated = proposalToEditor(proposal, demoScene, 0, options), store = new EditorStore(demoScene, catalog);
  expect(store.execute(translated.command, false).ok).toBe(false);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(validateScene(store.scene, catalog).ok).toBe(true);
  const addition = store.scene.objects.find(object => object.id === `purchased-${kind}`)!;
  expect(addition).toMatchObject({ assetId: `shop-${kind}`, name: `Purchased ${kind}`, position: [-2.1, 0, -.3], scale: [1, 1, 1] });
  expect(catalog.find(asset => asset.id === addition.assetId)).toMatchObject({ kind: editorKind, dimensions: [.65, .75, .45], price: 45000 });
  expect(store.scene.objects.filter(object => object.id !== addition.id)).toEqual(demoScene.objects);
  expect(store.scene.rooms).toEqual(demoScene.rooms); expect(store.scene.walls).toEqual(demoScene.walls);
  expect(demoScene).toEqual(original);
});

test('existing exact shared-kind purchases remain accepted', () => {
  const translated = proposalToEditor(accepted('table', 'shop-desk'), demoScene, 0, options);
  expect(new EditorStore(demoScene, catalog).execute(translated.command, true).ok).toBe(true);
});

test.each(['identity', 'dimensions', 'price', 'currency', 'unmapped kind', 'wrong mapped family'])('compatibility never bypasses the %s check', constraint => {
  const proposal = accepted('desk'), op = proposal.ops[0]!;
  if (op.type !== 'add') throw new Error('Expected catalog addition');
  const checkedOptions = { ...options };
  if (constraint === 'identity') op.item.sku = 'missing-sku';
  if (constraint === 'dimensions') op.item.size[0] += .01;
  if (constraint === 'price') op.item.price = 44999;
  if (constraint === 'currency') delete (checkedOptions as { catalogCurrency?: string }).catalogCurrency;
  if (constraint === 'unmapped kind') op.item.kind = 'writing_desk';
  if (constraint === 'wrong mapped family') op.item.kind = 'wardrobe';
  expect(() => proposalToEditor(proposal, demoScene, 0, checkedOptions)).toThrow(/catalog|asset|kind|dimensions|price|currency|AMD/i);
});

test('reverse conversion follows the editor kind and never infers desk semantics from an uncontracted name/category', () => {
  const proposal = accepted('desk'), translated = proposalToEditor(proposal, demoScene, 0, options), store = new EditorStore(demoScene, catalog);
  expect(store.execute(translated.command, true).ok).toBe(true);
  const roundTrip = editorToDesigner(store.scene, options).items.find(item => item.id === 'purchased-desk')!;
  expect(roundTrip).toMatchObject({ kind: 'table', sku: 'shop-desk', name: 'Purchased desk', size: [.65, .45, .75] });
});
