import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { localCatalog } from '../../../../apps/editor/src/core/demo.js';
import { checkRestyle, styledMaterials } from '../lib/finishes.js';
import { Studio } from '../lib/sdk.js';
import { describe as describeScene, loadDraft, loadScene } from '../lib/scene.js';
import { editorDocument } from '../lib/view/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../cli.ts');
const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
const fixture = new URL('../fixtures/avani-empty.json', import.meta.url).pathname;
// A local asset id: editorDocument then needs no catalog service.
const sku = localCatalog.find(asset => asset.kind === 'cabinet')!.id;

/** The Avani flat with one made-to-measure kitchen run (fronts already restyled by the flat). */
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'varpet-restyle-'));
  const scene = JSON.parse(readFileSync(fixture, 'utf8'));
  scene.items.push({ id: 'k-run', room_id: 'room-kitchen', kind: 'kitchen_cabinet', name: 'Kitchen run', pos: [0, 0], rot: 0, size: [0.6, 0.6, 0.9], keep: false,
    sku, material_slots: ['fronts', 'handles', 'worktop'], materials: { fronts: '#3c5646' } });
  const kitchen = scene.rooms.find((room: { id: string }) => room.id === 'room-kitchen').polygon as [number, number][];
  scene.items.at(-1).pos = [kitchen.reduce((s, p) => s + p[0], 0) / kitchen.length, kitchen.reduce((s, p) => s + p[1], 0) / kitchen.length];
  writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene));
  writeFileSync(join(dir, 'draft.json'), '{"items": []}\n');
  return dir;
}
function varpet(dir: string, ...args: string[]): { code: number; out: string } {
  try { return { code: 0, out: execFileSync(process.execPath, ['--import', loader, cli, ...args], { cwd: dir, encoding: 'utf8' }) }; }
  catch (error) { const e = error as { status: number; stdout: string; stderr: string }; return { code: e.status, out: e.stdout + e.stderr }; }
}

describe('restyling made-to-measure pieces', () => {
  test('the designer sees restylable pieces with their roles and colours', () => {
    const dir = workspace(), scene = loadScene(join(dir, 'scene.json'));
    expect(describeScene(scene, { items: [] })).toContain('k-run (Kitchen run) [room-kitchen] restylable: fronts #3c5646, handles own finish, worktop own finish');
    expect(new Studio(dir).room('room-kitchen').info()).toContain('made-to-measure k-run');
    expect(varpet(dir, 'restyle').out).toContain('k-run (Kitchen run) [room-kitchen] restylable');
  });

  test('Studio.restyle validates roles and colours and merges per role into draft.restyle', () => {
    const s = new Studio(workspace());
    expect(() => s.restyle('k-run', { doors: '#112233' })).toThrow(/unknown role doors; roles: fronts, handles, worktop/);
    expect(() => s.restyle('k-run', { fronts: 'navy' })).toThrow(/#rrggbb/);
    expect(() => s.restyle('room-kitchen', { fronts: '#112233' })).toThrow(/not a made-to-measure piece/);
    s.restyle('k-run', { fronts: '#1F3A5F', worktop: '#f5f3ee' });
    expect(s.restyle('k-run', { handles: '#b08d57' })).toBe('k-run (Kitchen run) [room-kitchen] restylable: fronts #1f3a5f, handles #b08d57, worktop #f5f3ee');
    expect(s.draft.restyle).toEqual([{ id: 'k-run', room_id: 'room-kitchen', materials: { fronts: '#1f3a5f', worktop: '#f5f3ee', handles: '#b08d57' } }]);
    // null: an only-restyled role is simply dropped; a role the flat set goes back to the model's own finish.
    s.restyle('k-run', { worktop: null, fronts: null });
    expect(s.draft.restyle![0]!.materials).toEqual({ fronts: null, handles: '#b08d57' });
    expect(styledMaterials(s.get('k-run'), s.draft)).toEqual({ handles: '#b08d57' });
  });

  test('./varpet restyle writes the draft, which check accepts; bad input fails', () => {
    const dir = workspace();
    const ok = varpet(dir, 'restyle', 'k-run', 'fronts=#1f3a5f', 'worktop=#F5F3EE');
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('restyled k-run');
    expect(loadDraft(join(dir, 'draft.json')).restyle).toEqual([{ id: 'k-run', room_id: 'room-kitchen', materials: { fronts: '#1f3a5f', worktop: '#f5f3ee' } }]);
    expect(varpet(dir, 'restyle', 'k-run', 'fronts=default').code).toBe(0);
    expect(loadDraft(join(dir, 'draft.json')).restyle![0]!.materials).toEqual({ fronts: null, worktop: '#f5f3ee' });
    expect(varpet(dir, 'restyle', 'k-run', 'plinth=#000000').out).toMatch(/unknown role plinth/);
    expect(varpet(dir, 'restyle', 'k-run', 'fronts=blue').out).toMatch(/not role=#rrggbb/);
    const check = varpet(dir, 'check', '--facts');
    expect(check.out).not.toContain('restyle:');
  });

  test('a room designer restyles in its room file and merge keeps it', () => {
    const dir = workspace();
    expect(varpet(dir, 'restyle', 'k-run', 'handles=#b08d57', '--part', 'room-kitchen').code).toBe(0);
    expect(loadDraft(join(dir, 'rooms/room-kitchen.json')).restyle).toHaveLength(1);
    varpet(dir, 'merge');
    expect(loadDraft(join(dir, 'draft.json')).restyle).toEqual([{ id: 'k-run', room_id: 'room-kitchen', materials: { handles: '#b08d57' } }]);
  });

  test('check rejects hand-written restyle entries that break the contract', () => {
    const scene = loadScene(join(workspace(), 'scene.json'));
    const problems = checkRestyle(scene, { items: [], restyle: [
      { id: 'k-run', room_id: 'room-living', materials: { fronts: '#12345', plinth: '#000000' } },
      { id: 'sofa', room_id: 'room-living', materials: { fronts: '#000000' } },
    ] });
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^restyle: .*k-run: room_id must be room-kitchen/), expect.stringMatching(/fronts must be #RRGGBB/),
      expect.stringMatching(/unknown role plinth/), expect.stringMatching(/sofa: not a made-to-measure piece/)]));
  });

  test('the design document carries the restyled finishes for the proposal', async () => {
    const dir = workspace(), scene = loadScene(join(dir, 'scene.json'));
    const { scene: doc } = await editorDocument(scene, { items: [], restyle: [{ id: 'k-run', room_id: 'room-kitchen', materials: { worktop: '#f5f3ee', fronts: null } }] });
    expect((doc.objects.find(o => o.id === 'k-run') as { materials?: Record<string, string> }).materials).toEqual({ worktop: '#f5f3ee' });
  });
});
