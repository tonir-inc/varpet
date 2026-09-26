import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-portal-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'portal-test-entry', resolveId(id) { if (id.endsWith('portal-test-entry')) return '\0portal-test-entry'; },
  load(id) { if (id === '\0portal-test-entry') return `export * from '${root}/src/portal/templates.ts'; export * from '${root}/src/portal/session.ts'; export * from '${root}/src/core/validation.ts'; export { serializeScene } from '${root}/src/core/persistence.ts';`; },
}], build: { ssr: 'portal-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { apartmentTemplates, createTemplateScene, validateScene, apartmentPayload, restoreApartment, restoreApartmentSharing, ApartmentShareAttachment, serializeScene } = await import(pathToFileURL(join(output, 'test.mjs')));

test('every selectable plan is valid, empty, and copied independently for each apartment', () => {
  assert.ok(apartmentTemplates.length >= 2);
  for (const plan of apartmentTemplates) {
    const first = createTemplateScene(plan.id), second = createTemplateScene(plan.id);
    assert.equal(validateScene(first, []).ok, true, plan.name);
    assert.equal(first.objects.length, 0);
    assert.notEqual(first.id, second.id);
    first.rooms[0].name = 'My changed room';
    assert.notEqual(second.rooms[0].name, first.rooms[0].name);
    assert.notEqual(plan.scene.rooms[0].name, first.rooms[0].name);
    assert.ok(plan.area > 0);
  }
  assert.throws(() => createTemplateScene('missing'), /not found/i);
});

test('account save preserves full renovation evidence and copies exact referenced catalog metadata', () => {
  const scene = createTemplateScene(apartmentTemplates[0].id);
  scene.project.sources.push({ id:'source-test', kind:'measurement', name:'Window measurement', notes:'123 cm' });
  const product = { asset:{ id:'saved-chair', name:'Chair', kind:'chair', category:'chair', dimensions:[.5,.8,.5], color:'#aaaaaa', price:10, source:{type:'procedural'} }, priceSource:'test', sizeStatus:'confirmed', attribution:'Test' };
  scene.objects.push({id:'chair-test', name:'Chair', assetId:product.asset.id, position:[-2,0,0], rotation:0, scale:[1,1,1]});
  const payload = apartmentPayload(scene, [product], 'avani', 'My home');
  assert.deepEqual(payload.scene.project, scene.project);
  assert.equal(payload.name, 'My home');
  assert.equal(payload.scene.name, 'My home');
  assert.equal(scene.name, apartmentTemplates[0].scene.name);
  assert.deepEqual(payload.catalog, [product]);
  const restored = restoreApartment({...payload, id:'saved-id', version:1, updatedAt:new Date().toISOString()});
  assert.deepEqual(restored.scene, payload.scene);
  assert.deepEqual(restored.catalog, [product]);
  payload.scene.rooms[0].name = 'Mutated after restore';
  assert.notEqual(restored.scene.rooms[0].name, payload.scene.rooms[0].name);
});

test('reopen rejects malformed projects or missing furniture instead of silently dropping content', () => {
  const scene = createTemplateScene(apartmentTemplates[0].id);
  const saved = { id:'saved', name:'Home', templateId:null, updatedAt:new Date().toISOString(), version:1, scene, catalog:[] };
  assert.throws(() => restoreApartment({...saved, catalog:[{}]}), /catalog/i);
  scene.objects.push({id:'missing', name:'Missing', assetId:'missing', position:[0,0,0],rotation:0,scale:[1,1,1]});
  assert.throws(() => restoreApartment(saved), /Cannot import/);
});

const shareId = 'a'.repeat(32), editToken = 'e'.repeat(43), viewToken = 'v'.repeat(43);
const sharedUpdatedAt = '2026-09-26T18:00:00.000Z';
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function savedApartment() {
  const scene = createTemplateScene('avani');
  const product = { asset:{ id:'retained-chair', name:'Retained chair', kind:'chair', category:'chair', dimensions:[.5,.8,.5], color:'#aaaaaa', price:10, source:{type:'procedural'} }, priceSource:'test', sizeStatus:'confirmed', attribution:'Test' };
  scene.objects.push({id:'retained-chair-object', name:'Chair', assetId:product.asset.id, position:[-2,0,0], rotation:0, scale:[1,1,1]});
  const payload = apartmentPayload(scene, [product], 'avani', 'Account apartment');
  return {...payload, id:'account-apartment-a', version:12, updatedAt:sharedUpdatedAt,
    sharing:{id:shareId, token:editToken, sceneId:scene.id}};
}
function sharedProject(apartment) {
  return {id:shareId, version:7, updatedAt:sharedUpdatedAt, access:'edit', viewToken,
    scene:structuredClone(apartment.scene), catalog:apartment.catalog.map(product => structuredClone(product.asset))};
}

test('reopening matching shared progress restores its version and marks revision zero saved', async () => {
  const apartment = savedApartment(), restored = restoreApartment(apartment);
  const before = structuredClone({apartment, restored});
  let request;
  const session = await restoreApartmentSharing(apartment, restored.scene, restored.catalog, async (url, init) => {
    request = {url, init}; return response(sharedProject(apartment));
  });
  assert.ok(session);
  assert.equal(session.savedRevision, 0);
  assert.equal(session.version, 7, 'share versions are independent of account record versions');
  assert.equal(session.updatedAt, sharedUpdatedAt);
  assert.equal(session.matchesProject(restored.scene.id, apartment.id), true);
  assert.equal(request.url, `/api/shares/${shareId}`);
  assert.equal(request.init.headers.Authorization, `Bearer ${editToken}`);
  assert.deepEqual({apartment, restored}, before);
});

test('different shared scenes or catalog snapshots stay dirty without replacing account progress', async () => {
  for (const difference of ['scene', 'catalog']) {
    const apartment = savedApartment(), restored = restoreApartment(apartment);
    const before = structuredClone({apartment, restored});
    const remote = sharedProject(apartment);
    if (difference === 'scene') remote.scene.name = 'Progress saved through the edit link';
    else remote.catalog[0].color = '#bbbbbb';
    const session = await restoreApartmentSharing(apartment, restored.scene, restored.catalog, async () => response(remote));
    assert.equal(session.savedRevision, -1, difference);
    assert.equal(session.version, remote.version);
    assert.deepEqual({apartment, restored}, before, `${difference} differences must not overwrite account data`);
  }
});

test('a restored account share rejects saving from a copied apartment with the same scene ID', async () => {
  const apartment = savedApartment(), restored = restoreApartment(apartment);
  const before = structuredClone({apartment, restored});
  let writes = 0;
  const session = await restoreApartmentSharing(apartment, restored.scene, restored.catalog, async (_url, init) => {
    if (init.method === 'PUT') { writes++; return response({version:8, updatedAt:sharedUpdatedAt}); }
    return response(sharedProject(apartment));
  });
  const snapshot = {scene:restored.scene, catalog:restored.catalog.map(product => product.asset)};
  for (const ownerId of ['account-apartment-copy', undefined]) {
    await assert.rejects(session.save(snapshot, 1, ownerId), /different|project/i);
  }
  assert.equal(writes, 0, 'a different account owner must be rejected before a share write');
  assert.equal(session.savedRevision, 0);
  await session.save(snapshot, 1, apartment.id);
  assert.equal(writes, 1); assert.equal(session.savedRevision, 1);
  assert.deepEqual({apartment, restored}, before);
});

test('account scene exports and copied apartment payloads exclude the durable sharing capability', () => {
  const apartment = savedApartment(), before = structuredClone(apartment);
  const restored = restoreApartment(apartment);
  const copied = apartmentPayload(restored.scene, restored.catalog, apartment.templateId, 'Independent copy');
  assert.deepEqual(Object.keys(restored).sort(), ['catalog', 'scene']);
  assert.deepEqual(Object.keys(copied).sort(), ['catalog', 'name', 'scene', 'templateId']);
  for (const encoded of [JSON.stringify(restored), JSON.stringify(copied), serializeScene(restored.scene)]) {
    for (const secret of [shareId, editToken, viewToken]) assert.equal(encoded.includes(secret), false);
  }
  assert.deepEqual(apartment, before, 'copying must not remove the source apartment’s private association');
});

test('sharing read failures propagate while the saved account snapshot remains unchanged', async () => {
  for (const fetcher of [async () => { throw new Error('network unavailable'); }, async () => response({reason:'unavailable'}, 503)]) {
    const apartment = savedApartment(), restored = restoreApartment(apartment);
    const before = structuredClone({apartment, restored});
    await assert.rejects(restoreApartmentSharing(apartment, restored.scene, restored.catalog, fetcher), /unavailable|could not|connection/i);
    assert.deepEqual({apartment, restored}, before);
  }
});

test('a sharing record for another scene cannot restore an account sharing session', async () => {
  const apartment = savedApartment(), restored = restoreApartment(apartment);
  const before = structuredClone({apartment, restored});
  const remote = sharedProject(apartment); remote.scene.id = 'another-scene';
  await assert.rejects(restoreApartmentSharing(apartment, restored.scene, restored.catalog, async () => response(remote)), /different apartment/i);
  assert.deepEqual({apartment, restored}, before);
});

test('view-only sharing access cannot become the account’s editing session', async () => {
  const apartment = savedApartment(), restored = restoreApartment(apartment);
  const before = structuredClone({apartment, restored});
  const remote = {...sharedProject(apartment), access:'view'}; delete remote.viewToken;
  await assert.rejects(restoreApartmentSharing(apartment, restored.scene, restored.catalog, async () => response(remote)), /view.only/i);
  assert.deepEqual({apartment, restored}, before);
});

test('absent or locally stale sharing references do not load a shared apartment', async () => {
  for (const reference of [undefined, null, {id:shareId, token:editToken, sceneId:'replaced-scene'}]) {
    const apartment = {...savedApartment(), sharing:reference}, restored = restoreApartment(apartment);
    const before = structuredClone({apartment, restored});
    let reads = 0;
    const session = await restoreApartmentSharing(apartment, restored.scene, restored.catalog, async () => {
      reads++; return response(sharedProject(apartment));
    });
    assert.equal(session, null); assert.equal(reads, 0);
    assert.deepEqual({apartment, restored}, before);
  }
});

test('simultaneous link choices attach the same share once at the account record version', async () => {
  assert.equal(typeof ApartmentShareAttachment, 'function');
  const source = savedApartment(), restored = restoreApartment(source);
  const session = await restoreApartmentSharing(source, restored.scene, restored.catalog, async () => response(sharedProject(source)));
  const apartment = {...source, sharing:null}, before = structuredClone(apartment);
  const attachment = new ApartmentShareAttachment();
  const calls = [];
  let release;
  const writer = (id, version, reference) => {
    calls.push({id, version, reference}); return new Promise(resolve => { release = resolve; });
  };
  const first = attachment.attach(apartment, session, writer);
  const second = attachment.attach(apartment, session, writer);
  assert.equal(calls.length, 1, 'view/edit choices must not race two attachments at the same version');
  assert.equal(calls[0].id, apartment.id); assert.equal(calls[0].version, apartment.version);
  assert.equal(calls[0].reference.id, shareId); assert.equal(calls[0].reference.token, editToken);
  const saved = {...apartment, version:apartment.version + 1, sharing:source.sharing};
  release(saved);
  assert.equal(await first, saved); assert.equal(await second, saved);
  assert.deepEqual(apartment, before, 'the caller owns applying the updated account record');
});

test('account share attachment refuses a different apartment owner before writing', async () => {
  assert.equal(typeof ApartmentShareAttachment, 'function');
  const source = savedApartment(), restored = restoreApartment(source);
  const session = await restoreApartmentSharing(source, restored.scene, restored.catalog, async () => response(sharedProject(source)));
  const copy = {...source, id:'different-account-apartment', sharing:null}, before = structuredClone(copy);
  const attachment = new ApartmentShareAttachment();
  let writes = 0;
  await assert.rejects(attachment.attach(copy, session, async () => { writes++; return copy; }), /different|project|apartment/i);
  assert.equal(writes, 0);
  assert.deepEqual(copy, before);
});

test('permission choices join link creation while the account attachment is still pending', async () => {
  const apartment = {...savedApartment(), sharing:null};
  const snapshot = {scene:apartment.scene, catalog:apartment.catalog.map(product => product.asset)};
  const attachment = new ApartmentShareAttachment();
  assert.equal(typeof attachment.create, 'function');
  const posts = [], writes = [];
  let releaseWrite, announceWrite;
  const writeStarted = new Promise(resolve => { announceWrite = resolve; });
  const fetcher = async (_url, init) => new Promise(resolve => { posts.push({init, resolve}); });
  const writer = (id, version, reference) => {
    writes.push({id, version, reference}); announceWrite();
    return new Promise(resolve => { releaseWrite = resolve; });
  };
  const first = attachment.create(snapshot, 4, apartment, fetcher, writer);
  assert.equal(posts.length, 1);
  posts[0].resolve(response({id:shareId, editToken, viewToken, version:1, updatedAt:sharedUpdatedAt}, 201));
  await writeStarted;
  const second = attachment.create(snapshot, 5, apartment, fetcher, writer);
  assert.equal(posts.length, 1, 'the pending attachment must keep the whole creation request shared');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, apartment.id); assert.equal(writes[0].version, apartment.version);
  const saved = {...apartment, version:apartment.version + 1,
    sharing:{...writes[0].reference, sceneId:apartment.scene.id}};
  releaseWrite(saved);
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.session, secondResult.session);
  assert.equal(firstResult.session.savedRevision, 4);
  assert.equal(firstResult.apartment, saved); assert.equal(secondResult.apartment, saved);
});

test('the complete sharing creation pipeline keeps copied account apartments independent', async () => {
  const apartment = {...savedApartment(), sharing:null}, copy = {...apartment, id:'independent-account-copy'};
  const snapshot = {scene:apartment.scene, catalog:apartment.catalog.map(product => product.asset)};
  const attachment = new ApartmentShareAttachment();
  assert.equal(typeof attachment.create, 'function');
  const posts = [], writes = [];
  const fetcher = async () => new Promise(resolve => { posts.push(resolve); });
  const writer = async (id, version, reference) => {
    writes.push({id, version, reference});
    return {...(id === apartment.id ? apartment : copy), version:version + 1,
      sharing:{...reference, sceneId:apartment.scene.id}};
  };
  const first = attachment.create(snapshot, 1, apartment, fetcher, writer);
  const second = attachment.create(snapshot, 2, copy, fetcher, writer);
  assert.equal(posts.length, 2, 'separate account owners must create separate share records');
  posts[0](response({id:shareId, editToken, viewToken, version:1, updatedAt:sharedUpdatedAt}, 201));
  posts[1](response({id:'b'.repeat(32), editToken, viewToken, version:1, updatedAt:sharedUpdatedAt}, 201));
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(writes.length, 2);
  assert.notEqual(firstResult.session.reference.id, secondResult.session.reference.id);
  assert.equal(firstResult.apartment.id, apartment.id); assert.equal(secondResult.apartment.id, copy.id);
  assert.equal(firstResult.session.matchesProject(snapshot.scene.id, apartment.id), true);
  assert.equal(secondResult.session.matchesProject(snapshot.scene.id, copy.id), true);
});
