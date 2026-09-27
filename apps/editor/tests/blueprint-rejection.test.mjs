import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'blueprint-rejection-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'rejection-test', enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('rejection-entry')) return '\0entry';
    if (/architect-stage$|database-catalog$|built-catalog$|\/main$/.test(id)) return '\0stage';
  },
  load(id) {
    if (id === '\0entry') return `export * from '${root}/src/portal/blueprint.ts'; export * from '${root}/src/adapters/architect-http.ts';`;
    if (id === '\0stage') return `export const resolveSceneProducts=()=>[],resolveFurnitureProducts=()=>[]; export const createArchitectStage=()=>({start(){}, enter(){}, dispose(){}, progress(){}, event(){}, planRect(){return null;}});`;
  },
}], build: { ssr: 'rejection-entry', target: 'node22', outDir: output,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { buildFurnishedFlat, createArchitectHttpAdapter, mountBlueprintLanding } = await import(pathToFileURL(join(output, 'test.mjs')));
const rejected = {type: 'rejected', kind: 'room photo', reason: 'This image shows a room, rather than its floor plan.'};
const file = () => new File(['image'], 'room.png', {type: 'image/png'});
const response = () => new Response(JSON.stringify(rejected) + '\n');
for (const legacy of [false, true]) test(`rejected event preserves a specific error (${legacy ? 'structure' : 'flat'})`, async () => {
  const run = legacy ? () => createArchitectHttpAdapter({pickFiles: async () => [file()], fetch: async () => response()}).reconstruct()
    : () => buildFurnishedFlat({plan: file(), photos: [], name: 'test'}, () => {}, {fetch: async () => response()});
  await assert.rejects(run, error => error.name === 'PlanRejectedError' && error.kind === 'room photo' && /floor plan.*JPG, PNG or WebP/.test(error.message));
});

// A small DOM surface exercises the landing controller, including speculative-request races.
function element(selector = '') {
  const children = new Map(), classes = new Set();
  return {hidden: /flow$|next$|bp-ink$|error$/.test(selector), disabled: false, value: '', textContent: '',
    dataset: {}, style: {setProperty() {}}, isConnected: true, files: [],
    classList: {add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), toggle() {}},
    querySelector(s) {if (!children.has(s)) children.set(s, element(s)); return children.get(s);},
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, closest: () => null,
    focus() {}, getAnimations: () => [], getBoundingClientRect: () => ({left: 0, top: 0, width: 2, height: 2}),
    toBlob(callback, type) {callback(new Blob(['pixels'], {type}));},
    getContext: () => ({drawImage() {}, clearRect() {}, putImageData() {},
      getImageData: () => ({data: new Uint8ClampedArray(16).fill(255)}),
      createImageData: (w,h) => ({data: new Uint8ClampedArray(w*h*4)})}),
  };
}
for (const submit of [false, true]) test(`rejection ${submit ? 'during construction' : 'before submit'} clears selection and returns to landing`, async t => {
  const saved = new Map();
  let dispose;
  const set = (key, value) => {saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});};
  t.after(() => {dispose?.(); for (const [key, value] of saved) {if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key];}});
  set('navigator', {platform: 'Mac'});
  set('matchMedia', () => ({matches: true}));
  set('window', {addEventListener() {}, removeEventListener() {}, setInterval, clearInterval});
  set('document', {createElement: () => element(), querySelector: () => null});
  set('createImageBitmap', async () => ({width: 2, height: 2, close() {}}));
  set('Image', class {naturalWidth=2; naturalHeight=2; async decode() {}});
  let send;
  set('fetch', async () => new Response(new ReadableStream({start(controller) {send = value => {controller.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n')); controller.close();};}})));
  const host = element(), opened = [];
  dispose = mountBlueprintLanding(host, {showSample() {}, openProject: async (...args) => opened.push(args)});
  const picker = host.querySelector('.blueprint-file-input');
  picker.files = [file()]; picker.onchange();
  const flush = async () => {for (let i=0; i<15; i++) await new Promise(setImmediate);};
  await flush();
  assert.equal(typeof send, 'function');
  if (submit) {host.querySelector('.blueprint-build').onclick(); await flush();}
  send(rejected); await flush();
  assert.equal(host.querySelector('.blueprint-welcome').hidden, false);
  assert.equal(host.querySelector('.blueprint-flow').hidden, true);
  assert.equal(host.querySelector('.blueprint-next').hidden, true);
  assert.equal(host.querySelector('.blueprint-drop').hidden, false);
  assert.equal(host.querySelector('.blueprint-build').disabled, true);
  assert.equal(picker.value, '');
  assert.match(host.querySelector('.blueprint-error').textContent, /floor plan.*JPG, PNG or WebP/);
  assert.equal(host.querySelector('.blueprint-error').hidden, false);
  assert.deepEqual(opened, []);
  // No retained plan can restart the rejected request.
  host.querySelector('.blueprint-build').onclick(); await flush();
  assert.equal(host.querySelector('.blueprint-flow').hidden, true);
});
