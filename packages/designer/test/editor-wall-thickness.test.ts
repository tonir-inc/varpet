import { expect, test } from 'vitest';
import { demoScene } from '../../../apps/editor/src/core/demo.js';
import { emptyProject } from '../../../apps/editor/src/core/renovation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { applyOps } from '../src/adapter.js';
import { checkLayout } from '../src/layout.js';
import { localGeometryErrors, compareLayoutErrors } from '../src/local-checks.js';
import { place } from '../src/place.js';
import type { Scene } from '../src/scene.js';
import { DesignerSession } from '../src/session.js';
import { innerWallFace, wallSolidPolygons } from '../src/wall-geometry.js';

function room(): Scene {
  return { rooms: [{ id: 'room', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }],
    walls: [{ id: 'west', source_id: 'physical-west', room_id: 'room', a: [0, 0], b: [0, 6], thickness: .2, height: 2.7 }], openings: [], fixed: [],
    items: [{ id: 'rug', kind: 'rug', name: 'Rug', room_id: 'room', pos: [.55, 3], rot: 0, size: [1, 1, .01], keep: false }] };
}

test('solid walls include their half thickness; floor rugs collide and touching the inner face is allowed', () => {
  const scene = room();
  expect(innerWallFace(scene, scene.walls[0]!)).toEqual([[.1, 0], [.1, 6]]);
  const issues = localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision');
  expect(issues).toHaveLength(1); expect(issues[0]).toMatchObject({ wall_id: 'physical-west', item_ids: ['rug'], room_id: 'room' });
  expect(issues[0]!.deficit_m).toBeCloseTo(.05, 8);
  scene.items[0]!.pos[0] = .6;
  expect(localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision')).toEqual([]);
});

test('only sufficiently tall floor-reaching doors carve wall volume; windows and raised doors stay solid', () => {
  const scene = room(); scene.openings = [{ id: 'door', wall_id: 'west', kind: 'door', offset: 2, width: 2, height: 2.1, sill: 0 }];
  expect(localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision')).toEqual([]);
  expect(wallSolidPolygons(scene, .01)).toHaveLength(2);
  scene.items[0]!.size[2] = 2.2;
  expect(localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision')).toHaveLength(1);
  scene.items[0]!.size[2] = .01; scene.openings[0]!.kind = 'window';
  expect(localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision')).toHaveLength(1);
  scene.openings[0]!.kind = 'door'; scene.openings[0]!.sill = .05;
  expect(localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision')).toHaveLength(1);
});

test('open and legacy zero-thickness boundaries add no physical obstacle', () => {
  const scene = room(); delete scene.walls[0]!.thickness;
  expect(wallSolidPolygons(scene)).toEqual([]);
  expect(innerWallFace(scene, scene.walls[0]!)).toEqual([[0, 0], [0, 6]]);
  scene.walls[0]!.thickness = .2; scene.walls[0]!.open = true;
  expect(wallSolidPolygons(scene)).toEqual([]);
});

test('shared reversed aliases use the same physical door and deduplicate identical solid spans', () => {
  const scene = room(); scene.rooms.push({ id: 'other', polygon: [[-6, 0], [0, 0], [0, 6], [-6, 6]] });
  scene.walls.push({ ...scene.walls[0]!, id: 'west-alias', room_id: 'other', a: [0, 6], b: [0, 0] });
  scene.openings = [{ id: 'door', wall_id: 'west', kind: 'door', offset: 2, width: 2, height: 2.1, sill: 0 }];
  expect(wallSolidPolygons(scene, .01)).toHaveLength(2);
  expect(localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision')).toEqual([]);
  scene.items[0]!.pos[1] = 1;
  const issues = localGeometryErrors(scene).filter(issue => issue.check === 'wall_collision');
  expect(issues).toHaveLength(1); expect(issues[0]!.wall_id).toBe('physical-west');
});

test('wall collision baseline compares measured depth against the same physical wall', () => {
  const before = room(), after = applyOps(before, [{ type: 'move', id: 'rug', pos: [.525, 3] }]);
  const prior = localGeometryErrors(before), current = localGeometryErrors(after);
  expect(compareLayoutErrors(prior, prior).errors).toEqual([]);
  expect(compareLayoutErrors(prior, current).errors.some(issue => issue.check === 'wall_collision')).toBe(true);
  const different = structuredClone(prior); different[0]!.wall_id = 'another-wall';
  expect(compareLayoutErrors(prior, different).errors).toHaveLength(1);
});

test('real demo group translation is refused before the rug penetrates the west wall by 5 mm', () => {
  const editor = structuredClone(demoScene); editor.version = 2; editor.project = emptyProject();
  for (const object of editor.objects) if (['lounge-chair', 'living-rug'].includes(object.id)) object.groupId = 'living-seat';
  const scene = editorToDesigner(editor, { groupPolicy: 'move-together' }), chair = scene.items.find(item => item.id === 'lounge-chair')!;
  expect(scene.walls.every(wall => wall.thickness === .16 && wall.height === 2.7)).toBe(true);
  const session = new DesignerSession(scene); session.setIntent({ move: [{ kinds: ['chair'], count: 1 }, { kinds: ['rug'], count: 1 }] });
  const result = session.propose([{ type: 'move', id: chair.id, pos: [chair.pos[0] - .1, chair.pos[1]] }], 'Shift the seating group left by ten centimetres.');
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Wall intersection must be refused');
  expect(result.errors.some(issue => issue.check === 'collision' && 'item_ids' in issue && issue.item_ids?.includes('living-rug') && issue.message.includes('wall-west'))).toBe(true);
});

test('against-wall candidates use the inner face and translate into an accepted editor command', () => {
  const catalog: CatalogAsset[] = [{ id: 'chair', name: 'Chair', category: 'Seats', kind: 'chair', dimensions: [.5, .8, .6], color: '#888888', price: 25000, source: { type: 'procedural' } }];
  const editor: SceneDocument = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]], color: '#ffffff' }],
    walls: [{ id: 'west', start: [0, 0], end: [0, 6], thickness: .2, height: 2.7, color: '#eeeeee', openings: [] }],
    objects: [{ id: 'seat', name: 'Chair', assetId: 'chair', position: [3, 0, 3], rotation: 0, scale: [1, 1, 1] }] };
  const scene = editorToDesigner(editor, { catalog }), placements = place(scene, { room_id: 'room', item_id: 'seat', relations: [{ type: 'against_wall', wall_id: 'west' }] });
  expect(placements.candidates.length).toBeGreaterThan(0);
  const candidate = placements.candidates[0]!.item, op = { type: 'move' as const, id: 'seat', pos: candidate.pos, rot: candidate.rot };
  expect(checkLayout(scene, [op]).ok).toBe(true);
  const session = new DesignerSession(scene); session.setIntent({ move: [{ kinds: ['chair'], count: 1 }], preferences: [{ type: 'against_wall', item_id: 'seat', wall_id: 'west' }] });
  const result = session.propose([op], 'Place the chair against the inner wall face.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const translated = proposalToEditor(result.proposal, editor, 0, { catalog }), store = new EditorStore(editor, catalog);
  expect(store.execute(translated.command, true).ok).toBe(true);
});
