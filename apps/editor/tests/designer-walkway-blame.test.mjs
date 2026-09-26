import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-walkway-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: join(root, 'src/ui/designer-panel.ts'), target: 'node22', outDir: output,
  minify: false, rolldownOptions: { output: { entryFileNames: 'panel.mjs' } },
} });
const { createDesignerConversation } = await import(pathToFileURL(join(output, 'panel.mjs')));
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', rooms: [], walls: [], objects: [] };
const proposal = { id: 'p1', title: 'A TV', description: 'Add a TV.',
  command: { id: 'p1', label: 'Add TV', source: 'designer', baseRevision: 12, operations: [] } };
const blockedRoute = { from: 'door:bedroom-door', to: 'item:bedside-table', width_m: 0, reachable: false };
const open = { from: 'door:living-door', to: 'item:tv', width_m: 0.9, reachable: true };
async function walkwayRow(metrics) {
  const controller = createDesignerConversation({ ask: async () => ({ type: 'proposal', conversationId: 'c1', proposal, metrics }),
    snapshot: () => ({ scene, revision: 12 }), onProposal: () => {} });
  await controller.send('Put a TV in the living room');
  return controller.state.messages.at(-1).metrics[1];
}

test('a walkway blocked before the proposal is labelled pre-existing, not blamed on it', async () => {
  const row = await walkwayRow({
    before: { space: { rooms: [{ room_id: 'room-bedroom', walkways: [blockedRoute] }] } },
    after: { space: { rooms: [{ room_id: 'room-bedroom', walkways: [blockedRoute] }, { room_id: 'room-living', walkways: [open] }] } } });
  assert.deepEqual(row, { label: 'Narrowest walkway · proposed', value: '0.00 m (already blocked before this change)' });
});

test('a walkway the proposal blocks stays flagged as blocked', async () => {
  const row = await walkwayRow({
    before: { space: { rooms: [{ room_id: 'room-bedroom', walkways: [blockedRoute] }, { room_id: 'room-living', walkways: [open] }] } },
    after: { space: { rooms: [{ room_id: 'room-bedroom', walkways: [blockedRoute] }, { room_id: 'room-living', walkways: [{ ...open, width_m: 0, reachable: false }] }] } } });
  assert.equal(row.value, '0.00 m (blocked)');
});
