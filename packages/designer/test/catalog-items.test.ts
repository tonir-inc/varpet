import { expect, test } from 'vitest';
import type { CatalogAsset } from '../../../apps/editor/src/contracts.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import * as catalog from '../src/catalog.js';
import * as bridge from '../src/editor-bridge.js';
import { DesignerSession } from '../src/session.js';

const chair = { id: 'abo:B0CHAIR01', source: 'abo', kind: 'chair', name: 'Catalog armchair', currency: 'AMD', price: 45000,
  size_m: [.65, .45, .75], fit_size_m: [.65, .45, .75], license: 'CC BY 4.0', price_source: 'shop', size_status: 'confirmed',
  glb_url: 'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/1/B0CHAIR01.glb' };

function stubItems(records: Record<string, unknown>[]) {
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    if (init?.method === 'GET') return new Response(null, { status: 405 });
    if (init?.method === 'DELETE') return new Response(null, { status: 200 });
    const message = JSON.parse(String(init?.body));
    if (message.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (message.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'items-stub', version: '1' } };
    } else {
      const id = message.params.arguments.item_id as string;
      calls.push(id);
      result = { content: [], structuredContent: records.find(record => record.id === id) ?? { error: `no item ${id}` } };
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

test('catalog items are fetched by id over one session; ids the catalog lacks are left out', async () => {
  const stub = stubItems([chair]);
  const items = catalog.createHttpCatalogItems({ url: 'http://catalog.test/mcp', fetch: stub.fetch });
  expect(await items(['abo:B0CHAIR01', 'abo:GONE', 'abo:B0CHAIR01'])).toEqual([chair]);
  expect(stub.calls).toEqual(['abo:B0CHAIR01', 'abo:GONE']);
});

function proposal(sku: string) {
  const session = new DesignerSession(bridge.editorToDesigner(demoScene, { catalog: localCatalog, catalogCurrency: 'AMD' }));
  session.setIntent({ room_id: 'room-living', add: [{ kinds: ['chair'], count: 1 }] });
  const result = session.propose([{ type: 'add', item: { id: 'purchased-chair', room_id: 'room-living', kind: 'chair', name: 'Catalog armchair',
    pos: [-2.1, .3], rot: 0, size: [.65, .45, .75], keep: false, sku, price: 45000 } }], 'Add the requested armchair in the living room.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.proposal;
}

test('the bridge fetches only purchases missing from the request and converts them as the editor does', async () => {
  const requested: string[][] = [];
  const fetchItems = async (ids: string[]) => { requested.push(ids); return [chair, { ...chair, id: 'abo:NOT-ASKED' }]; };
  const extended = await bridge.withProposalAssets(proposal('abo:B0CHAIR01'), localCatalog, fetchItems);
  expect(requested).toEqual([['abo:B0CHAIR01']]);
  expect(extended.slice(0, localCatalog.length)).toEqual(localCatalog);
  expect(extended.slice(localCatalog.length)).toEqual([expect.objectContaining<Partial<CatalogAsset>>({
    id: 'abo:B0CHAIR01', kind: 'chair', price: 45000, dimensions: [.65, .75, .45], source: { type: 'gltf', url: chair.glb_url } })]);
  const known = await bridge.withProposalAssets(proposal('abo:B0CHAIR01'), extended, async () => { throw new Error('no fetch expected'); });
  expect(known).toBe(extended);
});

test('a purchase outside the request catalog translates once fetched, and is still refused when the catalog lacks it', async () => {
  const accepted = proposal('abo:B0CHAIR01');
  expect(() => bridge.proposalToEditor(accepted, demoScene, 3, { catalog: localCatalog, catalogCurrency: 'AMD' })).toThrow(/real catalog asset/);
  const extended = await bridge.withProposalAssets(accepted, localCatalog, async () => [chair]);
  const translated = bridge.proposalToEditor(accepted, demoScene, 3, { catalog: extended, catalogCurrency: 'AMD' });
  expect(translated.command.operations).toContainEqual(expect.objectContaining({ type: 'add', object: expect.objectContaining({ assetId: 'abo:B0CHAIR01' }) }));
  const missing = await bridge.withProposalAssets(accepted, localCatalog, async () => []);
  expect(() => bridge.proposalToEditor(accepted, demoScene, 3, { catalog: missing, catalogCurrency: 'AMD' })).toThrow(/real catalog asset/);
});
