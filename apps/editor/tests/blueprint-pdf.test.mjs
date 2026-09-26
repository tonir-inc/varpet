import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-blueprint-pdf-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, ssr: { noExternal: ['pdfjs-dist'] }, publicDir: false, logLevel: 'error', plugins: [{
  name: 'mock-pdfjs', enforce: 'pre',
  resolveId(id) { if (id === 'pdfjs-dist' || id.includes('pdf.worker.min.mjs?url')) return '\0' + id; },
  load(id) {
    if (id === '\0pdfjs-dist') return `export const GlobalWorkerOptions = {}; export const getDocument = options => globalThis.pdfMock(options);`;
    if (id.includes('pdf.worker.min.mjs?url')) return 'export default "worker.mjs";';
  },
}], build: { ssr: 'src/portal/blueprint-evidence.ts', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const api = await import(pathToFileURL(join(output, 'test.mjs')));
const pdf = size => new File([new Uint8Array(size ?? 8)], 'plan.pdf', { type: 'application/pdf' });
function setup({ pages = 1, sizes = [100], fail = false } = {}) {
  const calls = [], encodes = []; let destroyed = false;
  globalThis.pdfMock = ({ data, password }) => {
    assert.ok(data instanceof Uint8Array); assert.equal(password, '');
    return { promise: fail ? Promise.reject(new Error('bad PDF')) : Promise.resolve({ numPages: pages,
      async getPage(n) { assert.equal(n, 1); return {
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
        render: ({ viewport }) => { calls.push(viewport); return { promise: Promise.resolve() }; },
      }; },
    }), async destroy() { destroyed = true; } };
  };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}),
    toBlob(callback, type, quality) { encodes.push([type, quality]); callback(new Blob([new Uint8Array(sizes.shift() ?? 100)], { type })); },
  }) };
  return { calls, encodes, get destroyed() { return destroyed; } };
}
test('PDF over image limit converts page 1 to a bounded PNG; images pass through', async () => {
  const mock = setup();
  const result = await api.prepareBlueprintPlan(pdf(3_000_000));
  assert.equal(result.file.name, 'floor-plan.png'); assert.equal(result.file.type, 'image/png');
  assert.equal(result.note, ''); assert.deepEqual(mock.calls, [{ width: 1800, height: 2400 }]);
  assert.ok(mock.destroyed); api.validateBlueprintFile(result.file);
  const image = new File(['x'], 'plan.png', { type: 'image/png' });
  assert.equal((await api.prepareBlueprintPlan(image)).file, image);
  assert.throws(() => api.validateBlueprintFile(pdf()), /image/);
});
test('multi-page PDF reports first-page choice and falls back to JPEG 0.85', async () => {
  const mock = setup({ pages: 4, sizes: [2_000_001, 2_000_000] });
  const result = await api.prepareBlueprintPlan(pdf());
  assert.equal(result.note, 'Used page 1 of 4'); assert.equal(result.file.name, 'floor-plan.jpg');
  assert.deepEqual(mock.encodes, [['image/png', undefined], ['image/jpeg', 0.85]]);
});
test('oversized encodings downscale before returning an image under 2 MB', async () => {
  const mock = setup({ sizes: [3_000_000, 2_500_000, 100] });
  const result = await api.prepareBlueprintPlan(pdf());
  assert.ok(result.file.size <= 2_000_000); assert.ok(mock.calls[1].height < 2400);
});
test('PDF source size limit is 20 MB and image limit remains 2 MB', async () => {
  setup(); await api.prepareBlueprintPlan(pdf(20_000_000));
  await assert.rejects(api.prepareBlueprintPlan(pdf(20_000_001)), /20 MB/);
  await assert.rejects(api.prepareBlueprintPlan(new File([new Uint8Array(2_000_001)], 'x.png', { type: 'image/png' })), /2 MB/);
});
test('corrupt, encrypted and zero-page PDFs give actionable error and release worker', async () => {
  for (const options of [{ fail: true }, { pages: 0 }]) {
    const mock = setup(options);
    await assert.rejects(api.prepareBlueprintPlan(pdf()), { message: 'This PDF could not be read. Export the plan page as an image.' });
    assert.ok(mock.destroyed);
  }
  await assert.rejects(api.prepareBlueprintPlan(pdf(0)), /This PDF could not be read/);
});
