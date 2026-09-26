import { expect, test } from 'vitest';
import type { SceneDocument } from '../../../apps/editor/src/contracts.js';
import { migrateScene } from '../../../apps/editor/src/core/renovation.js';
import { placementIssues, validateScene } from '../../../apps/editor/src/core/validation.js';
import { editorToDesigner } from '../src/editor-bridge.js';
import { checkDecor } from '../spike/lib/check.js';
import type { Draft, DraftItem } from '../spike/lib/finishes.js';
import { onWall } from '../spike/lib/scene.js';
import { editorDocument, wallFaces } from '../spike/lib/view/document.js';

/** Three rooms traced 2 cm short of their wall faces, as reconstructed flats are: A on the left, B and C on the right
 * of partition P (B the longer stretch), wall BC between them. */
function source(): SceneDocument {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, height: 2.7, thickness: 0.1, color: '#ffffff', openings: [] });
  const rect = (id: string, x0: number, z0: number, x1: number, z1: number) => ({ id, name: id, color: '#ffffff', polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as [number, number][] });
  return migrateScene({ format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
    rooms: [rect('A', 0.07, 0.07, 2.93, 2.93), rect('B', 3.07, 0.07, 4.93, 1.93), rect('C', 3.07, 2.07, 4.93, 2.93)],
    walls: [wall('south', [0, 0], [5, 0]), wall('east', [5, 0], [5, 3]), wall('north', [5, 3], [0, 3]), wall('west', [0, 3], [0, 0]),
      wall('P', [3, 0], [3, 3]), wall('BC', [3, 2], [5, 2])],
    objects: [] });
}

const finishOf = (doc: SceneDocument, wallId: string, surface: string) => doc.project!.finishes.find(finish => finish.entityId === wallId && finish.surface === surface)?.materialId;

test('every wall face of a room gets its paint; a shared face takes the room it mostly bounds; an accent wins on its own face', async () => {
  const scene = editorToDesigner(source());
  const accentWall = scene.walls.find(wall => (wall.source_id ?? wall.id) === 'P' && wall.room_id === 'A')!;
  const draft: Draft = { items: [], finishes: [
    { room_id: 'A', surface: 'walls', material: 'chalk' }, { room_id: 'B', surface: 'walls', color: '#dce3d7' }, { room_id: 'C', surface: 'walls', color: '#baccd1' },
    { room_id: 'A', surface: 'wall', wall_id: accentWall.id, color: '#294b3d' }] };
  const { scene: doc, catalog } = await editorDocument(scene, draft, source());
  expect(validateScene(doc, catalog).ok).toBe(true);
  const faces = wallFaces(doc);
  for (const room of ['A', 'B', 'C']) expect(faces.filter(face => face.rooms.has(room)).length).toBeGreaterThanOrEqual(3);
  for (const face of faces) expect(finishOf(doc, face.wallId, face.surface), `${face.wallId} ${face.surface}`).toBeDefined();
  const colourOf = (room: string) => finishOf(doc, faces.find(face => face.owner === room && !(face.wallId === 'P' && room === 'A'))!.wallId, faces.find(face => face.owner === room && !(face.wallId === 'P' && room === 'A'))!.surface);
  // P's right face runs 1.93 m along B and 0.93 m along C: one finish per face, B's.
  const pRight = faces.find(face => face.wallId === 'P' && face.rooms.has('B'))!;
  expect(pRight.owner).toBe('B');
  expect(finishOf(doc, 'P', pRight.surface)).toBe(colourOf('B'));
  // The south wall's inner face is shared by A (2.9 m) and B (1.9 m).
  const south = faces.find(face => face.wallId === 'south' && face.rooms.has('A'))!;
  expect(finishOf(doc, 'south', south.surface)).toBe(colourOf('A'));
  const pLeft = faces.find(face => face.wallId === 'P' && face.owner === 'A')!;
  expect(finishOf(doc, 'P', pLeft.surface)).toContain('#294b3d');
  expect(colourOf('A')).not.toContain('#294b3d');
});

test('wall art is mounted exactly as the editor mounts it, so the placement review passes', async () => {
  const scene = editorToDesigner(source());
  const west = scene.walls.find(wall => (wall.source_id ?? wall.id) === 'west' && wall.room_id === 'A')!;
  const art: DraftItem = { id: 'art', room_id: 'A', kind: 'wall_art', name: 'Print', size: [0.6, 0.04, 0.8], keep: false, price: 0, ...onWall(scene, 'A', west.id, [0.6, 0.04, 0.8]) } as DraftItem;
  const mirror: DraftItem = { id: 'mirror', room_id: 'B', kind: 'mirror', name: 'Mirror', size: [0.68, 0.09, 0.78], keep: false, price: 0,
    ...onWall(scene, 'B', scene.walls.find(wall => (wall.source_id ?? wall.id) === 'east' && wall.room_id === 'B')!.id, [0.68, 0.09, 0.78]) } as DraftItem;
  const { scene: doc, catalog } = await editorDocument(scene, { items: [art, mirror] }, source());
  expect(validateScene(doc, catalog).errors).toEqual([]);
  expect(doc.objects.find(object => object.id === 'art')?.host?.wallId).toBe('west');
  expect(doc.objects.find(object => object.id === 'mirror')?.host?.wallId).toBe('east');
  expect(placementIssues(doc, catalog).filter(issue => issue.blocking)).toEqual([]);
});

test('the spike check refuses what the editor cannot hang or stack', () => {
  const scene = editorToDesigner(source());
  const west = scene.walls.find(wall => (wall.source_id ?? wall.id) === 'west' && wall.room_id === 'A')!;
  const item = (extra: Partial<DraftItem>): DraftItem => ({ id: 'x', room_id: 'A', kind: 'cabinet', name: 'Wall mounted cabinet', pos: [1, -1], rot: 0, size: [0.5, 0.2, 0.6], keep: false, price: 0, ...extra }) as DraftItem;
  const hung = item({ ...onWall(scene, 'A', west.id, [0.5, 0.2, 0.6]) });
  expect(checkDecor(scene, { items: [hung] }).join('\n')).toMatch(/x cabinet cannot hang on a wall/);
  const clock = item({ kind: 'clock', name: 'Wall clock', size: [0.3, 0.05, 0.3], ...onWall(scene, 'A', west.id, [0.3, 0.05, 0.3]) });
  expect(checkDecor(scene, { items: [clock] }, kind => kind === 'clock' ? 'wall_art' : kind).join('\n')).not.toMatch(/cannot hang/);
  const table: DraftItem = item({ id: 'table', kind: 'table', name: 'Table', pos: [1.5, -1.5], size: [1.2, 0.8, 0.75] });
  const stacked = item({ id: 'box', pos: [1.5, -1.5], size: [0.4, 0.3, 0.4], on: 'table' });
  expect(checkDecor(scene, { items: [table, stacked] }).join('\n')).toMatch(/box cabinet .* cannot rest on table/);
  const vase = item({ id: 'vase', kind: 'decor', name: 'Vase', pos: [1.5, -1.5], size: [0.15, 0.15, 0.2], on: 'table' });
  expect(checkDecor(scene, { items: [table, vase] })).toEqual([]);
  const rug = item({ id: 'rug', kind: 'rug', name: 'Rug', pos: [1.5, -1.5], size: [2, 1.5, 0.01] });
  expect(checkDecor(scene, { items: [rug, { ...vase, on: 'rug' }] }).join('\n')).toMatch(/cannot rest on rug/);
});
