import { expect, test } from 'vitest';
import type { AgentProposal, CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { createApartmentStore } from '../../../apps/editor/src/core/apartment-store.js';
import { createInitialScene } from '../../../apps/editor/src/core/initial-scene.js';
import { projectSnapshot } from '../../../apps/editor/src/core/renovation.js';
import { createDesignerHttpAdapter } from '../../../apps/editor/src/adapters/designer-http.js';

function source(): SceneDocument {
  const scene = structuredClone(createApartmentStore(createInitialScene(), []).scene);
  scene.project!.metadata['room-bedroom'] = { notes: 'Preserve this measured room note',
    ceilingDesign: { style: 'soft-glow', drop: .12, inset: .25, brightness: 65, temperature: 3000, enabled: true } };
  scene.project!.sources = [{ id: 'source-photo', name: 'Room photograph', kind: 'photo', roomId: 'room-bedroom', dataUrl: 'data:image/png;base64,dGVzdA==' }];
  scene.project!.baseline = projectSnapshot(scene);
  scene.project!.options = [{ id: 'saved-option', name: 'Original apartment', snapshot: projectSnapshot(scene) }];
  return scene;
}

test('HTTP sends the entire normalized v2 source including ceilings and preserves it after approved paint', async () => {
  const scene = source(), original = structuredClone(scene), store = createApartmentStore(scene, []);
  const wall = scene.walls[0]!;
  const proposal: AgentProposal = { id: 'paint-current-v2', title: 'Sage wall', description: 'Preview sage paint.',
    command: { id: 'paint-current-v2', label: 'Paint', source: 'designer', baseRevision: store.revision,
      operations: [{ type: 'update-wall', id: wall.id, patch: { color: '#93a58d' } }] } };
  let sent: Record<string, unknown> | undefined;
  const adapter = createDesignerHttpAdapter({ catalog: [], catalogCurrency: 'AMD', fetch: async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ type: 'proposal', conversationId: 'current-v2', proposal })+'\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  } });
  const received = await adapter.propose(scene, store.revision);
  expect(sent).toMatchObject({ scene: original, catalog: [], catalogCurrency: 'AMD' });
  expect(store.execute(received.command, false).ok).toBe(false);
  expect(store.execute(received.command, true).ok).toBe(true);
  expect(store.scene.project).toEqual(original.project);
  expect(store.scene.rooms).toEqual(original.rooms);
  expect(scene).toEqual(original);
});

test('photo-built GLB identities survive catalog registration and the HTTP boundary without ABO filtering', async () => {
  const piece: CatalogAsset = { id: 'built:photo-cabinet', name: 'Photo-built cabinet', category: 'Built from photo', kind: 'cabinet',
    dimensions: [.8, 1.2, .4], color: '#aabbaa', price: 0, source: { type: 'gltf', url: 'http://127.0.0.1:8788/pieces/photo-cabinet/model.glb' } };
  const store = createApartmentStore(source(), []), revision = store.revision;
  const catalog = store.registerCatalogAssets([piece]);
  expect(store.revision).toBe(revision);
  expect(store.execute({ id: 'place-built', label: 'Place photo-built piece', source: 'human', baseRevision: revision,
    operations: [{ type: 'add', object: { id: 'photo-cabinet', name: piece.name, assetId: piece.id, position: [-2, 0, 0], rotation: 0, scale: [1, 1, 1] } }] }, true).ok).toBe(true);
  const before = structuredClone(store.scene), proposal: AgentProposal = { id: 'built-color', title: 'Cabinet colour', description: 'Recolour the existing cabinet.',
    command: { id: 'built-color', label: 'Cabinet colour', source: 'designer', baseRevision: store.revision,
      operations: [{ type: 'update', id: 'photo-cabinet', patch: { color: '#93a58d' } }] } };
  const adapter = createDesignerHttpAdapter({ catalog, catalogCurrency: 'AMD', fetch: async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({ scene: before, catalog: [piece] });
    return new Response(JSON.stringify({ type: 'proposal', conversationId: 'photo-built', proposal })+'\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  } });
  const result = await adapter.propose(store.scene, store.revision);
  expect(store.execute(result.command, true).ok).toBe(true);
  expect(store.scene.objects[0]).toMatchObject({ assetId: piece.id, color: '#93a58d' });
  expect(store.scene.project).toEqual(before.project);
  expect(store.registerCatalogAssets([])).toEqual([piece]);
});
