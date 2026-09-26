import { createArchitectHttpAdapter, splitPlan, withBuiltPieces } from './architect-http';
import { structureAdapter as mock } from './mock';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`architect check failed: ${message}`);
}
const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
function stream(lines: object[]): Response {
  const text = lines.map(line => JSON.stringify(line)).join('\n') + '\n';
  // Split mid-line to prove the reader buffers partial lines.
  const cut = Math.floor(text.length / 2);
  return new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode(text.slice(0, cut))); c.enqueue(e.encode(text.slice(cut))); c.close(); } }));
}

const picked = splitPlan([file('living.jpg'), file('Plan-2F.png'), file('a.jpg'), file('b.jpg'), file('c.jpg'), file('d.jpg')]);
assert(picked.plan.name === 'Plan-2F.png', 'a file named plan is the plan');
assert(picked.photos.length === 4, 'at most four photos are sent');

const real = await mock.reconstruct();
let sent: { plan: { name: string }; photos: unknown[] } | undefined;
const progress: string[] = [];
const adapter = createArchitectHttpAdapter({
  url: 'http://architect.test',
  pickFiles: async () => [file('plan.jpg'), file('photo-1.jpg')],
  onProgress: message => progress.push(message),
  fetch: async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return stream([{ type: 'progress', message: 'shell: checking' }, { type: 'structure', rooms: real.rooms, walls: real.walls, notes: ['scale from 3 printed dimensions'] }]);
  },
});
const structure = await adapter.reconstruct();
assert(sent?.plan.name === 'plan.jpg' && sent.photos.length === 1, 'plan and photos are posted');
assert(progress.some(message => message.includes('checking')), 'progress lines reach the editor');
assert(structure.notes[0] === 'scale from 3 printed dimensions', 'notes pass through');
const store = new EditorStore(demoScene, localCatalog);
const applied = store.execute({ id: 'architect', label: 'Import structure', source: 'architect', baseRevision: store.revision, operations: [{ type: 'replace-structure', rooms: structure.rooms, walls: structure.walls }] }, true);
assert(applied.ok, `the store accepts the structure: ${applied.errors.join(' ')}`);

const failing = createArchitectHttpAdapter({ pickFiles: async () => [file('plan.jpg')], fetch: async () => stream([{ type: 'error', message: 'faults left' }]) });
let error = '';
try { await failing.reconstruct(); } catch (e) { error = String(e); }
assert(error.includes('faults left'), 'service errors surface as messages');
const built = { id: 'built-demo-sofa', name: 'Sofa', category: 'Built from your photos', kind: 'sofa' as const, dimensions: [2.2, 0.85, 0.95] as [number, number, number], color: '#e0ddd5', price: 0, source: { type: 'gltf' as const, url: 'http://architect.test/files/demo/sofa/piece.glb' } };
const piecesFetch: typeof fetch = async url => new Response(JSON.stringify(String(url).endsWith('/runs') ? [{ run: 'demo', pieces: 1 }] : [built]));
const merged = await withBuiltPieces(localCatalog, 'http://architect.test', undefined, piecesFetch);
assert(merged.length === localCatalog.length + 1 && merged.at(-1)?.id === built.id, 'built pieces join the start-up catalog');
const placing = new EditorStore({ ...structuredClone(demoScene), objects: [] }, merged);
const placed = placing.execute({ id: 'place', label: 'Place built sofa', source: 'human', baseRevision: placing.revision, operations: [{ type: 'add', object: { id: 'sofa-1', name: 'Built sofa', assetId: built.id, position: [-2.6, 0, -2.2], rotation: 0, scale: [1, 1, 1] } }] }, true);
assert(placed.ok, `a built piece can be placed: ${placed.errors.join(' ')}`);
const down = await withBuiltPieces(localCatalog, 'http://architect.test', undefined, async () => { throw new TypeError('offline'); });
assert(down === localCatalog, 'a dead service keeps the base catalog');
assert(await withBuiltPieces(localCatalog, undefined) === localCatalog, 'no architect URL, no change');
console.log('architect adapter check passed');
