import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-sharing-client-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'sharing-entry', resolveId(id) { if (id.endsWith('sharing-entry')) return '\0sharing-entry'; },
  load(id) { if (id === '\0sharing-entry') return `export * from '${root}/src/core/sharing.ts'; export * from '${root}/src/core/demo.ts';`; },
}], build: { ssr: 'sharing-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'sharing.mjs' } } } });
const { parseShareReference, shareLink, createShareSnapshot, readSharedProject, ShareCreation, SharingSession, demoScene, localCatalog } = await import(pathToFileURL(join(output, 'sharing.mjs')));
const id = 'a'.repeat(32), edit = 'e'.repeat(43), view = 'v'.repeat(43);
const reference = { id, token: edit }, updatedAt = '2026-09-26T18:00:00.000Z';
const snapshot = () => createShareSnapshot(demoScene, localCatalog);
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const project = (access = 'edit') => ({ ...snapshot(), id, version: 1, updatedAt, access, ...(access === 'edit' ? { viewToken: view } : {}) });

test('capabilities live only in URL fragments and permission labels cannot elevate access', () => {
  const link = shareLink(reference, 'https://varpet.example/?old=query#other');
  assert.equal(link, `https://varpet.example/#share=${id}.${edit}`);
  assert.deepEqual(parseShareReference(new URL(link).hash), reference);
  assert.equal(parseShareReference('#'), null);
  for (const hash of ['#share=', '#share=../../etc.secret', `#share=${id}.${edit}&access=edit`]) assert.throws(() => parseShareReference(hash));
});

test('shared snapshots contain the exact scene and only its referenced catalog', () => {
  const next = snapshot();
  assert.deepEqual(next.scene, demoScene);
  assert.deepEqual(new Set(next.catalog.map(asset => asset.id)), new Set(demoScene.objects.map(item => item.assetId)));
  next.scene.name = 'Changed'; assert.notEqual(demoScene.name, next.scene.name);
  assert.throws(() => createShareSnapshot(demoScene, []), /catalog|asset|unknown/i);
});

test('receiving a view capability stays view-only and sends token in Authorization', async () => {
  let request;
  const received = await readSharedProject({ id, token: view }, async (url, init) => { request = { url, init }; return response(project('view')); });
  assert.equal(received.access, 'view'); assert.equal(received.viewToken, undefined);
  assert.equal(request.url, `/api/shares/${id}`); assert.equal(request.init.headers.Authorization, `Bearer ${view}`);
  assert.throws(() => new SharingSession({ id, token: view }, received), /view.only/i);
});

test('invalid or mismatched shared data never becomes editable startup data', async () => {
  for (const value of [{ ...project(), access: 'owner' }, { ...project(), id: 'b'.repeat(32) },
    { ...project(), scene: {} }, { ...project(), catalog: [] }, { ...project(), viewToken: undefined }]) {
    await assert.rejects(readSharedProject(reference, async () => response(value)));
  }
});

test('new sharing publishes current progress and generates distinct view and edit links', async () => {
  let sent;
  const session = await SharingSession.create(snapshot(), 12, async (_url, init) => {
    sent = JSON.parse(init.body); return response({ id, editToken: edit, viewToken: view, version: 1, updatedAt }, 201);
  });
  assert.deepEqual(sent.scene, demoScene); assert.equal(session.savedRevision, 12);
  assert.equal(new URL(session.link('view', 'https://varpet.example/')).hash, `#share=${id}.${view}`);
  assert.equal(new URL(session.link('edit', 'https://varpet.example/')).hash, `#share=${id}.${edit}`);
});

test('saving captures the submitted local revision and rejects a duplicate in-flight save', async () => {
  let release, sent;
  const session = new SharingSession(reference, project(), 0, async (_url, init) => {
    sent = JSON.parse(init.body); return new Promise(resolve => { release = resolve; });
  });
  const saving = session.save(snapshot(), 4);
  assert.equal(session.saving, true);
  await assert.rejects(session.save(snapshot(), 5), /already|progress/i);
  assert.equal(sent.version, 1);
  release(response({ version: 2, updatedAt })); await saving;
  assert.equal(session.savedRevision, 4); assert.equal(session.version, 2); assert.equal(session.saving, false);
});

test('conflict preserves the local draft, saved revision and server version', async () => {
  const next = snapshot(); const before = structuredClone(next);
  const session = new SharingSession(reference, project(), 3, async () => response({ reason: 'stale' }, 409));
  await assert.rejects(session.save(next, 4), /another|newer/i);
  assert.equal(session.version, 1); assert.equal(session.savedRevision, 3); assert.equal(session.saving, false);
  assert.deepEqual(next, before);
});

test('save responses and scene identity are checked before marking progress saved', async () => {
  const session = new SharingSession(reference, project(), 0, async () => response({ version: 1, updatedAt }));
  await assert.rejects(session.save(snapshot(), 2), /response/i);
  assert.equal(session.savedRevision, 0);
  const different = snapshot(); different.scene.id = 'another-project';
  await assert.rejects(session.save(different, 3), /different|project/i);
});

test('pending link creation stays with its source project after close, replace and reopen', async () => {
  const pending = [], creation = new ShareCreation();
  const fetcher = async (_url, init) => new Promise(resolve => pending.push({ scene: JSON.parse(init.body).scene, resolve }));
  const a = snapshot(), b = snapshot(); b.scene.id = 'project-b';
  const first = creation.create(a, 1, fetcher);
  const second = creation.create(b, 2, fetcher);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].scene.id, a.scene.id); assert.equal(pending[1].scene.id, b.scene.id);
  pending[0].resolve(response({ id, editToken: edit, viewToken: view, version: 1, updatedAt }, 201));
  const sessionA = await first;
  const duplicateB = creation.create(b, 3, fetcher);
  assert.equal(pending.length, 2, 'completing A must not discard B in flight');
  pending[1].resolve(response({ id: 'b'.repeat(32), editToken: edit, viewToken: view, version: 1, updatedAt }, 201));
  const sessionB = await second;
  assert.equal(await duplicateB, sessionB);
  assert.notEqual(sessionA.reference.id, sessionB.reference.id);
  assert.equal(sessionB.savedRevision, 2);
});
