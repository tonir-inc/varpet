import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-panel-integration-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'panel-test-entry', resolveId(id) { if (id.endsWith('panel-test-entry')) return '\0panel-test-entry'; },
  load(id) { if (id === '\0panel-test-entry') return `export * from '${root}/src/ui/designer-panel.ts'; export * from '${root}/src/adapters/designer-http.ts'; export * from '${root}/src/core/store.ts'; export * from '${root}/src/core/demo.ts';`; },
}], build: { ssr: 'panel-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'integration.mjs' } } } });
const { createDesignerConversation, createRecordedDesigner, askDesigner, EditorStore, demoScene, localCatalog } = await import(pathToFileURL(join(output, 'integration.mjs')));

async function service(t) {
  const requests = [], ask = createRecordedDesigner(0);
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push(request);
    res.setHeader('Content-Type', 'application/x-ndjson');
    const reply = await ask(request, { onProgress: message => res.write(`${JSON.stringify({ type: 'progress', message })}\n`) });
    res.end(`${JSON.stringify(reply)}\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return { requests, ask: (req, opts) => askDesigner(req, { ...opts, baseUrl: `http://127.0.0.1:${server.address().port}` }) };
}
test('recorded HTTP proposal requires approval, applies through the editor store, and undo restores every object', async t => {
  const stub = await service(t), store = new EditorStore(demoScene, localCatalog);
  const original = structuredClone(store.scene); let proposal;
  const controller = createDesignerConversation({ ask: stub.ask, snapshot: () => ({ scene: store.scene, revision: store.revision }), onProposal: p => { proposal = p; } });
  await controller.send('Move the table');
  assert.ok(proposal); assert.deepEqual(store.scene, original);
  assert.equal(store.execute(proposal.command, false).ok, false);
  assert.equal(store.execute(proposal.command, true).ok, true);
  assert.equal(store.scene.objects.find(o => o.id === 'coffee-table').position[2], 1.2);
  assert.equal(store.undo().ok, true); assert.deepEqual(store.scene, original);
});
test('recorded HTTP question continues the conversation and declines preserve keeps', async t => {
  const stub = await service(t), store = new EditorStore(demoScene, localCatalog);
  const controller = createDesignerConversation({ ask: stub.ask, snapshot: () => ({ scene: store.scene, revision: store.revision }), onProposal() { assert.fail('Kept table must not move'); } });
  controller.setKeep('coffee-table', true);
  await controller.send('Make it cozier'); const id = controller.state.conversationId;
  await controller.send(controller.state.options[0]);
  assert.equal(stub.requests[1].conversationId, id); assert.deepEqual(stub.requests[1].keep, ['coffee-table']);
  assert.match(controller.state.messages.at(-1).text, /marked keep/);
  await controller.send('Pick paint colours'); assert.match(controller.state.messages.at(-1).text, /don’t choose paint/);
});
test('a scene edited after the request rejects its stale proposal atomically', async t => {
  const stub = await service(t), store = new EditorStore(demoScene, localCatalog);
  let proposal;
  const controller = createDesignerConversation({ ask: stub.ask, snapshot: () => ({ scene: store.scene, revision: store.revision }), onProposal: p => { proposal = p; } });
  const pending = controller.send('Move the table');
  assert.equal(store.execute({ id: 'human-edit', label: 'Rename table', source: 'human', baseRevision: 0,
    operations: [{ type: 'update', id: 'coffee-table', patch: { name: 'My table' } }] }, true).ok, true);
  await pending;
  const result = store.execute(proposal.command, true);
  assert.equal(result.ok, false); assert.match(result.errors.join(), /stale/);
  assert.equal(store.scene.objects.find(o => o.id === 'coffee-table').name, 'My table');
});
