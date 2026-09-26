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
const { parseShareReference, shouldReloadShareNavigation, shareLink, createShareSnapshot, readSharedProject, ShareCreation, SharingSession, demoScene, localCatalog } = await import(pathToFileURL(join(output, 'sharing.mjs')));
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

test('landing anchors stay in-page while changed share fragments reload, including malformed links', () => {
  assert.equal(typeof shouldReloadShareNavigation, 'function');
  const share = `#share=${id}.${edit}`, other = `#share=${id}.${view}`;
  for (const [previous, next] of [['', '#apartments'], ['#apartments', '#details'], ['#apartments', ''], [share, share], ['#share=', '#share=']]) {
    assert.equal(shouldReloadShareNavigation(previous, next), false, `${previous} → ${next}`);
  }
  for (const [previous, next] of [['', share], [share, ''], [share, '#apartments'], [share, other],
    ['#apartments', '#share='], ['#share=', '#apartments'], ['#share=', '#share=malformed']]) {
    assert.equal(shouldReloadShareNavigation(previous, next), true, `${previous} → ${next}`);
  }
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

test('the same scene cannot publish through a different account apartment or an unowned editor', async () => {
  let requests = 0;
  const session = new SharingSession(reference, project(), 3, async () => {
    requests++; return response({ version: 2, updatedAt });
  }, 'apartment-a');
  for (const owner of ['apartment-b', '__account_draft__', undefined]) {
    await assert.rejects(session.save(snapshot(), 4, owner), /different|project/i);
  }
  assert.equal(requests, 0, 'identity mismatch must be rejected before sending a save');
  assert.equal(session.version, 1); assert.equal(session.savedRevision, 3); assert.equal(session.saving, false);
  await session.save(snapshot(), 4, 'apartment-a');
  assert.equal(requests, 1); assert.equal(session.savedRevision, 4);
});

test('project matching distinguishes account records, drafts, direct shares and replaced scenes', () => {
  const account = new SharingSession(reference, project(), 0, undefined, 'apartment-a');
  const draft = new SharingSession(reference, project(), 0, undefined, '__account_draft__');
  const direct = new SharingSession(reference, project());
  assert.equal(typeof account.matchesProject, 'function');
  assert.equal(account.matchesProject(demoScene.id, 'apartment-a'), true);
  assert.equal(account.matchesProject(demoScene.id, 'apartment-b'), false);
  assert.equal(account.matchesProject(demoScene.id), false);
  assert.equal(account.matchesProject('reconstructed-scene', 'apartment-a'), false);
  assert.equal(draft.matchesProject(demoScene.id, '__account_draft__'), true);
  assert.equal(draft.matchesProject(demoScene.id, 'apartment-a'), false);
  assert.equal(direct.matchesProject(demoScene.id), true);
  assert.equal(direct.matchesProject(demoScene.id, 'apartment-a'), false);
});

test('newly created sharing sessions retain their account apartment identity', async () => {
  let requests = 0;
  const session = await SharingSession.create(snapshot(), 12, async (_url, init) => {
    requests++;
    return init.method === 'POST'
      ? response({ id, editToken: edit, viewToken: view, version: 1, updatedAt }, 201)
      : response({ version: 2, updatedAt });
  }, 'apartment-a');
  await assert.rejects(session.save(snapshot(), 13, 'apartment-b'), /different|project/i);
  assert.equal(requests, 1, 'creating a link must retain the owner check for later saves');
  await session.save(snapshot(), 13, 'apartment-a');
  assert.equal(requests, 2); assert.equal(session.savedRevision, 13);
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

test('pending link creation separates account apartments that contain the same scene', async () => {
  const pending = [], creation = new ShareCreation();
  const fetcher = async () => new Promise(resolve => pending.push(resolve));
  const sameScene = snapshot();
  const first = creation.create(sameScene, 1, fetcher, 'apartment-a');
  const second = creation.create(sameScene, 2, fetcher, 'apartment-b');
  assert.equal(pending.length, 2, 'different account apartments need independent share records');
  pending[0](response({ id, editToken: edit, viewToken: view, version: 1, updatedAt }, 201));
  const sessionA = await first;
  const duplicateB = creation.create(sameScene, 3, fetcher, 'apartment-b');
  assert.equal(pending.length, 2, 'finishing the other owner must not discard this owner’s pending request');
  pending[1](response({ id: 'b'.repeat(32), editToken: edit, viewToken: view, version: 1, updatedAt }, 201));
  const sessionB = await second;
  assert.equal(await duplicateB, sessionB);
  assert.notEqual(sessionA.reference.id, sessionB.reference.id);
  assert.equal(sessionB.savedRevision, 2);
  assert.equal(sessionA.matchesProject(sameScene.scene.id, 'apartment-a'), true);
  assert.equal(sessionB.matchesProject(sameScene.scene.id, 'apartment-b'), true);
});
