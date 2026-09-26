import { expect, test } from 'vitest';
import { demoScene } from '../../../apps/editor/src/core/demo.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { localCatalog } from '../../../apps/editor/src/core/demo.js';
import { place } from '../src/place.js';
import { placeBatch } from '../src/place-batch.js';
import { DesignerSession } from '../src/session.js';
import type { Scene } from '../src/scene.js';

function crowdedFlat(): Scene {
  return { rooms: [
    { id: 'living', polygon: [[0,0],[4,0],[4,4],[0,4]] },
    { id: 'bedroom', polygon: [[5,0],[9,0],[9,4],[5,4]] },
  ], walls: [], openings: [], fixed: [], items: [
    { id: 'chair', kind: 'chair', name: 'Chair', room_id: 'living', pos: [1,1], rot: 0, size: [.5,.5,1], keep: false },
    { id: 'bed', kind: 'bed', name: 'Bed', room_id: 'bedroom', pos: [6,2], rot: 0, size: [2,2,.5], keep: false },
    { id: 'cabinet', kind: 'cabinet', name: 'Cabinet', room_id: 'bedroom', pos: [6.8,2], rot: 0, size: [1,1,1], keep: false },
  ] };
}

test('single and batch placement can rearrange one room while another retains an existing violation', () => {
  const scene = crowdedFlat(), original = structuredClone(scene);
  const request = { room_id: 'living', item_id: 'chair', relations: [{ type: 'centered' as const }] };
  expect(place(scene, request).candidates.length).toBeGreaterThan(0);
  expect(placeBatch(scene, [request], { compareBaseline: true }).candidates.length).toBeGreaterThan(0);
  expect(scene).toEqual(original);
});

test('baseline forgiveness does not let placement introduce a collision', () => {
  const scene = crowdedFlat();
  scene.items.push({ ...scene.items[0]!, id: 'occupied', pos: [2,2] });
  expect(place(scene, { room_id: 'living', item_id: 'chair', relations: [{ type: 'centered' }] }).candidates).toEqual([]);
});

test('Avani living-room proposal survives translation and editor approval despite existing bedroom access issues', () => {
  const original = structuredClone(demoScene), session = new DesignerSession(editorToDesigner(demoScene));
  session.setIntent({ room_id: 'room-living', add: [], remove: [], move: [{ kinds: ['chair'], count: 1 }] });
  const result = session.propose([{ type: 'move', id: 'lounge-chair', pos: [-1.25,-1.95] }], 'Move the lounge chair inward to open the living-room edge. Existing bedroom access needs separate attention.');
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) return;
  expect(result.proposal.checks.notes?.some(note => note.check === 'walkway' && note.item_ids.includes('bedside-table'))).toBe(true);
  const translated = proposalToEditor(result.proposal, demoScene, 0);
  const store = new EditorStore(demoScene, localCatalog);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects.find(item => item.id === 'lounge-chair')!.position).toEqual([-1.25,0,1.95]);
  expect(store.scene.objects.filter(item => item.id.startsWith('bed'))).toEqual(demoScene.objects.filter(item => item.id.startsWith('bed')));
  expect(demoScene).toEqual(original);
});
