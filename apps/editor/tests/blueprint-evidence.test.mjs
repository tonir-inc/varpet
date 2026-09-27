import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'blueprint-evidence-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  lib: { entry: join(root, 'src/portal/blueprint-evidence.ts'), formats: ['es'], fileName: () => 'test.mjs' },
  outDir: output, minify: false,
} });
const api = await import(pathToFileURL(join(output, 'test.mjs')));

test('raster preparation applies orientation, preserves format and downsizes oversized encodings', async t => {
  const saved = [globalThis.createImageBitmap, globalThis.document];
  t.after(() => { [globalThis.createImageBitmap, globalThis.document] = saved; });
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    let closed = false;
    const draws = [], encodes = [];
    globalThis.createImageBitmap = async (file, options) => {
      assert.equal(file.type, type); assert.deepEqual(options, {imageOrientation: 'from-image'});
      return {width: 600, height: 800, close() { closed = true; }};
    };
    globalThis.document = {createElement: () => ({
      getContext: () => ({drawImage: (...args) => draws.push(args.slice(1))}),
      toBlob(callback, mime, quality) {
        encodes.push([mime, quality]);
        callback(new Blob([new Uint8Array(encodes.length === 1 ? 2_000_001 : 100)], {type: mime}));
      },
    })};
    const original = new File(['pixels'], 'room.' + type.split('/')[1], {type});
    const clean = await api.prepareBlueprintImage(original);
    assert.notEqual(clean, original); assert.equal(clean.type, type); assert.equal(clean.name, original.name);
    assert.deepEqual(draws, [[0, 0, 600, 800], [0, 0, 450, 600]]);
    assert.deepEqual(encodes, [[type, type === 'image/png' ? undefined : .92], [type, type === 'image/png' ? undefined : .92]]);
    assert.ok(clean.size <= 2_000_000); assert.ok(closed);
  }
});

test('encoding failure releases bitmap and never returns original bytes', async t => {
  const saved = [globalThis.createImageBitmap, globalThis.document];
  t.after(() => { [globalThis.createImageBitmap, globalThis.document] = saved; });
  let closed = false;
  globalThis.createImageBitmap = async () => ({width: 2, height: 3, close() { closed = true; }});
  globalThis.document = {createElement: () => ({getContext: () => ({drawImage() {}}), toBlob(callback) {callback(null);}})};
  await assert.rejects(api.prepareBlueprintImage(new File(['image'], 'plan.png', {type: 'image/png'})), /encoding/i);
  assert.ok(closed);
});

test('landing discloses immediate upload and prepares room photos before adding them', async () => {
  const source = await readFile(join(root, 'src/portal/blueprint.ts'), 'utf8');
  assert.match(source, /Upload only plans and photos of a home you own or rent\. They are sent to OpenAI as soon as you add them to rebuild your flat, and photo location data is removed first\./);
  assert.match(source, /await Promise\.all\(files\.map\(prepareBlueprintImage\)\)/);
});

// Opt-in real browser coverage: PLAYWRIGHT_MODULE points at an installed Playwright package.
test('browser canvas removes JPEG EXIF GPS and PNG text, applying EXIF orientation', {skip: !process.env.PLAYWRIGHT_MODULE}, async () => {
  const {chromium} = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  try {
    const page = await browser.newPage();
    const code = await readFile(join(output, 'test.mjs'), 'utf8');
    const result = await page.evaluate(async code => {
      const api = await import(URL.createObjectURL(new Blob([code], {type: 'text/javascript'})));
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 4;
      canvas.getContext('2d').fillRect(0, 0, 8, 4);
      const encode = type => new Promise(resolve => canvas.toBlob(resolve, type));
      const jpeg = new Uint8Array(await (await encode('image/jpeg')).arrayBuffer());
      // Little-endian TIFF: Orientation=6 and a GPS IFD with GPSLatitudeRef=N.
      const exif = new Uint8Array(6 + 56); exif.set([69,120,105,102,0,0,73,73,42,0,8,0,0,0]);
      const view = new DataView(exif.buffer, 6);
      view.setUint16(8, 2, true);
      view.setUint16(10, 0x112, true); view.setUint16(12, 3, true); view.setUint32(14, 1, true); view.setUint16(18, 6, true);
      view.setUint16(22, 0x8825, true); view.setUint16(24, 4, true); view.setUint32(26, 1, true); view.setUint32(30, 38, true);
      view.setUint16(38, 1, true); view.setUint16(40, 1, true); view.setUint16(42, 2, true); view.setUint32(44, 2, true); view.setUint16(48, 78, true);
      const tagged = new File([jpeg.slice(0, 2), new Uint8Array([255,225,0,exif.length + 2]), exif, jpeg.slice(2)], 'gps.jpg', {type:'image/jpeg'});
      const clean = await api.prepareBlueprintImage(tagged);
      const bytes = new Uint8Array(await clean.arrayBuffer()), bitmap = await createImageBitmap(clean);
      const png = new Uint8Array(await (await encode('image/png')).arrayBuffer());
      const text = new TextEncoder().encode('Comment\0private location');
      const chunk = new Uint8Array(text.length + 12), dv = new DataView(chunk.buffer);
      dv.setUint32(0, text.length); chunk.set([116,69,88,116], 4); chunk.set(text, 8);
      let crc = 0xffffffff;
      for (const byte of chunk.slice(4, -4)) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      dv.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
      const taggedPng = new File([png.slice(0, 33), chunk, png.slice(33)], 'plan.png', {type:'image/png'});
      const cleanPng = (await api.prepareBlueprintPlan(taggedPng)).file;
      const pngBytes = new Uint8Array(await cleanPng.arrayBuffer());
      return {exif: new TextDecoder().decode(bytes).includes('Exif'), app1: bytes.some((b,i) => b === 255 && bytes[i+1] === 225),
        size: [bitmap.width, bitmap.height], jpegType: clean.type, pngType: cleanPng.type,
        text: new TextDecoder().decode(pngBytes).includes('tEXt')};
    }, code);
    assert.deepEqual(result, {exif:false, app1:false, size:[4,8], jpegType:'image/jpeg', pngType:'image/png', text:false});
  } finally { await browser.close(); }
});
