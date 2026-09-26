import { afterEach, expect, test, vi } from 'vitest';
import { loadEditorCatalog } from '../../../apps/editor/src/adapters/catalog-bootstrap.js';
import { CATALOG_CURRENCY } from '../../../apps/editor/src/adapters/catalog-http.js';
import type { DesignerRequest } from '../../../apps/editor/src/adapters/designer-http.js';
import { createDesignerConversation } from '../../../apps/editor/src/ui/designer-panel.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import type { CatalogAsset } from '../../../apps/editor/src/contracts.js';

const remote: CatalogAsset = { id: 'catalog-reading-chair', name: 'Catalog reading chair', category: 'Living',
  kind: 'chair', dimensions: [0.6, 0.8, 0.6], color: '#889988', price: 35000,
  source: { type: 'gltf', url: 'https://amazon-berkeley-objects.s3.amazonaws.com/test.glb' } };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('an unconfigured catalog keeps the demo immediately without a network call', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await loadEditorCatalog()).toEqual(localCatalog);
  expect(fetch).not.toHaveBeenCalled();
});

test('catalog bootstrap preserves demo identities and lets the immutable store accept a remote asset', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify([remote, { ...localCatalog[0]!, price: 999 }])));
  vi.stubGlobal('fetch', fetch);
  const catalog = await loadEditorCatalog('http://localhost:8765/editor/assets');
  expect(fetch.mock.calls).toHaveLength(1);
  expect(catalog).toEqual([...localCatalog, remote]);
  const store = new EditorStore(demoScene, catalog);
  const command = { id: 'add-catalog-chair', label: 'Reading chair', source: 'designer' as const, baseRevision: 0,
    operations: [{ type: 'add' as const, object: { id: 'reading-chair', name: remote.name, assetId: remote.id,
      position: [-1, 0, 0] as [number, number, number], rotation: 0, scale: [1, 1, 1] as [number, number, number] } }] };
  expect(store.execute(command, false).ok).toBe(false);
  expect(store.execute(command, true).ok).toBe(true);
  expect(store.scene.objects.some(object => object.assetId === remote.id)).toBe(true);
});

test('a failed catalog connection falls back to a usable demo catalog', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection refused'); }));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const catalog = await loadEditorCatalog('http://localhost:8765/editor/assets');
  expect(catalog).toEqual(localCatalog);
  expect(new EditorStore(demoScene, catalog).scene.objects).toHaveLength(demoScene.objects.length);
  expect(warning).toHaveBeenCalledOnce();
});

test.each(['too many assets', 'below minimum dimension'])('an editor-incompatible catalog falls back: %s', reason => {
  const data = reason === 'too many assets'
    ? Array.from({ length: 1000 }, (_, index) => ({ ...remote, id: `remote-${index}` }))
    : [{ ...remote, dimensions: [0.005, 0.8, 0.6] }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(data))));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return expect(loadEditorCatalog('http://localhost:8765/editor/assets')).resolves.toEqual(localCatalog);
});

test('chat sends the store catalog and explicit AMD on both initial and follow-up requests', async () => {
  const catalog = [...localCatalog, remote], calls: DesignerRequest[] = [];
  const chat = createDesignerConversation({
    snapshot: () => ({ scene: demoScene, revision: 0, catalog, catalogCurrency: CATALOG_CURRENCY }),
    ask: async req => { calls.push(req); return { type: 'question', conversationId: 'catalog-chat', question: 'Which window?', options: ['Living room', 'Bedroom'] }; },
    onProposal: () => { throw new Error('A question must not become a proposal'); },
  });
  await chat.send('Add an armchair for reading by the window');
  await chat.send('Living room');
  expect(calls).toHaveLength(2);
  for (const request of calls) {
    expect(request.catalog).toEqual(catalog);
    expect(request.catalogCurrency).toBe('AMD');
    expect(request.catalog).not.toBe(catalog);
  }
  expect(calls[1]!.conversationId).toBe('catalog-chat');
  expect(demoScene.objects).toHaveLength(20);
  chat.dispose();
});
