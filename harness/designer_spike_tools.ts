/** Small measurements the designer service needs around a spike turn (run with packages/designer's tsx):
 *   tsx harness/designer_spike_tools.ts metrics <workspace>        -> {rooms:[...], free_before_m2, free_after_m2}
 *   tsx harness/designer_spike_tools.ts snap <editor-document.json> -> {operations:[update-room...]}
 * metrics: free floor and the narrowest reachable walkway per room, before (scene.json, the customer's own flat) and
 * after (plus draft.json's floor pieces), from the designer's own space metrics (the ones ./varpet check walks).
 * snap: the room outlines the spike's 3D export snaps onto wall faces (reconcile-geometry snapRoomFaces); the editor
 * hangs wall art and finds the floor under a mirror only where a room polygon reaches the face, so a proposal carries
 * the same snap as polygon-only room updates. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spaceMetrics, type RoomSpaceMetrics } from '../packages/designer/src/metrics/space.ts';
import { snapRoomFaces } from '../packages/designer/src/reconcile-geometry.ts';
import type { Scene } from '../packages/designer/src/scene.ts';
import { onFloor, plainItem, type DraftItem } from '../packages/designer/spike/lib/finishes.ts';
import type { SceneDocument } from '../apps/editor/src/contracts.ts';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function roomMetrics(scene: Scene, items: DraftItem[]) {
  const ops = items.filter(onFloor).map(item => ({ type: 'add' as const, item: { ...plainItem(item), keep: item.keep ?? false } }));
  const before = spaceMetrics(scene), after = spaceMetrics(scene, ops);
  const touched = new Set(items.map(item => item.room_id));
  const byId = (rooms: RoomSpaceMetrics[]) => new Map(rooms.map(room => [room.room_id, room]));
  const beforeRooms = byId(before.rooms);
  const rooms = after.rooms.map(room => {
    const reachable = room.walkways.filter(path => path.reachable);
    // A route the empty flat already could not walk is the flat's, not the design's.
    const blockedBefore = new Set((beforeRooms.get(room.room_id)?.walkways ?? []).filter(path => !path.reachable).map(path => [path.from, path.to].sort().join('|')));
    const blocked = room.walkways.filter(path => !path.reachable && !blockedBefore.has([path.from, path.to].sort().join('|'))).length;
    const name = scene.rooms.find(entry => entry.id === room.room_id)?.name ?? room.room_id;
    return { id: room.room_id, name, designed: touched.has(room.room_id),
      free_before_m2: round(beforeRooms.get(room.room_id)?.free_area_m2 ?? room.free_area_m2),
      free_after_m2: round(room.free_area_m2),
      narrowest_m: reachable.length ? round(Math.min(...reachable.map(path => path.width_m))) : null,
      blocked };
  });
  return { rooms, free_before_m2: round(before.free_area_m2), free_after_m2: round(after.free_area_m2) };
}

export function snapOperations(doc: SceneDocument) {
  if (doc.version !== 2) return [];
  const snapped = snapRoomFaces({ ...doc, objects: [] }).editor;
  return snapped.rooms.flatMap(room => {
    const original = doc.rooms.find(entry => entry.id === room.id);
    if (!original || JSON.stringify(original.polygon) === JSON.stringify(room.polygon)) return [];
    return [{ type: 'update-room' as const, id: room.id, patch: { polygon: room.polygon } }];
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const [command, path] = process.argv.slice(2);
  if (command === 'metrics' && path) {
    const scene = json(join(path, 'scene.json')) as Scene, draft = json(join(path, 'draft.json')) as { items?: DraftItem[] };
    scene.items ??= []; scene.fixed ??= []; scene.openings ??= [];
    console.log(JSON.stringify(roomMetrics(scene, draft.items ?? [])));
  } else if (command === 'snap' && path) {
    console.log(JSON.stringify({ operations: snapOperations(json(path) as SceneDocument) }));
  } else {
    console.error('usage: designer_spike_tools.ts metrics <workspace> | snap <editor-document.json>');
    process.exit(2);
  }
}
