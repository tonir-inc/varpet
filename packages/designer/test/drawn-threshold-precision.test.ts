import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { editorToDesigner } from '../src/editor-bridge.js';
import { checkLocalLayout } from '../src/local-checks.js';
import { snapRoomFaces } from '../src/reconcile-geometry.js';
import type { SceneDocument } from '../../../apps/editor/src/contracts.js';
const published = () => JSON.parse(readFileSync(new URL('../eval/komitas-drawn-inputs/b21-t13.scene.json', import.meta.url), 'utf8')) as SceneDocument;
describe('published doorway precision', () => {
 test('rounded doorway jambs remain traversable for a new sofa without changing the editor shell', () => {
  const editor = published(), original = structuredClone(editor);
  const scene = editorToDesigner(editor, { catalog: [] });
  scene.items.push({ id: 'new-sofa', room_id: 'living', kind: 'sofa', name: 'sofa', pos: [6.17, -.88], rot: 0, size: [2, .84, .9], keep: false });
  const errors = checkLocalLayout(scene).errors.filter(e => e.check === 'walkway' && e.walkway?.from === 'door:bed_door');
  expect(errors).toEqual([]);
  expect(editor).toEqual(original);
 });
 test('a real three-centimetre threshold gap remains a failed route', () => {
  const editor = published();
  editor.rooms.find(r => r.id === 'living')!.polygon.forEach(p => { if (p[1] === 3.684) p[1] -= .03; });
  const scene = editorToDesigner(editor, { catalog: [] });
  expect(checkLocalLayout(scene).errors.some(e => e.walkway?.from === 'door:bed_door')).toBe(true);
 });
 test('only vertices within one millimetre of a physical door corner are precision snaps', () => {
  const editor = published();
  const { audit } = snapRoomFaces(editor);
  const threshold = audit.adjustments.filter(a => a.room_id === 'living' && [12,13].includes(a.vertex));
  expect(threshold).toHaveLength(2);
  expect(threshold.every(a => a.distance_m <= .001)).toBe(true);
 });
});
